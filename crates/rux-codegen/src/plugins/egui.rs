use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    EventHandler, PropertyValue, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties,
    WidgetType,
};
use syn::{
    Expr, ExprCall, ExprClosure, ExprIf, ExprLit, File, Item, ItemFn, Lit, Stmt,
};

use crate::controller_merge::{generate_initial_controller, merge_controller};
use crate::error::CodegenError;
use crate::events::{generate_ui_message_tokens, BoundEvent};
use crate::generator::CodegenDiagnostic;
use crate::handler::generate_ui_handler_tokens;
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, GeneratedFile, TargetFramework,
};
use crate::reverse_parser::PropertyPatch;
use crate::sanitizer::{make_ident, to_pascal_case, to_snake_case};
use crate::state::{generate_app_state_tokens, InferredField};
use crate::view::generate_widget_ids_tokens;

pub struct EguiPlugin;

impl EguiPlugin {
    pub fn new() -> Self {
        Self
    }

    pub fn reverse_parse_egui(code: &str) -> Result<WidgetNode, CodegenError> {
        let syntax_file: File = syn::parse_str(code)
            .map_err(|e| CodegenError::SynParseError(format!("Failed to parse egui source: {}", e)))?;

        let mut root_node = WidgetNode {
            id: "root".to_string(),
            widget_type: WidgetType::VBox,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: Vec::new(),
            children: Vec::new(),
        };

        let mut counter = 0;
        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { sig, block, .. }) = item {
                if sig.ident == "render_ui" {
                    Self::parse_egui_stmts_into_node(&mut root_node, &block.stmts, &mut counter);
                }
            }
        }

        Ok(root_node)
    }

    pub fn patch_egui_document(
        doc: &mut RuxDocument,
        code: &str,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let parsed = Self::reverse_parse_egui(code)?;
        Self::reconcile_egui_node(&mut doc.root, &parsed, patches);
        Ok(())
    }

    fn reconcile_egui_node(
        target: &mut WidgetNode,
        parsed: &WidgetNode,
        patches: &mut Vec<PropertyPatch>,
    ) {
        if let Some(ref new_text) = parsed.properties.text {
            if target.properties.text.as_ref() != Some(new_text) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "text".to_string(),
                    old_value: target.properties.text.as_ref().map(|t| t.to_string()),
                    new_value: new_text.to_string(),
                });
                target.properties.text = Some(new_text.clone());
            }
        }

        if let Some(ref new_img) = parsed.properties.image_path {
            if target.properties.image_path.as_ref() != Some(new_img) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "image_path".to_string(),
                    old_value: target.properties.image_path.clone(),
                    new_value: new_img.clone(),
                });
                target.properties.image_path = Some(new_img.clone());
            }
        }

        let min_len = target.children.len().min(parsed.children.len());
        for i in 0..min_len {
            Self::reconcile_egui_node(&mut target.children[i], &parsed.children[i], patches);
        }
        if parsed.children.len() > target.children.len() {
            for i in target.children.len()..parsed.children.len() {
                let new_child = parsed.children[i].clone();
                patches.push(PropertyPatch {
                    widget_id: new_child.id.clone(),
                    property_name: "created".to_string(),
                    old_value: None,
                    new_value: format!("{:?}", new_child.widget_type),
                });
                target.children.push(new_child);
            }
        }
    }

    fn parse_egui_stmts_into_node(
        parent: &mut WidgetNode,
        stmts: &[Stmt],
        counter: &mut usize,
    ) {
        for stmt in stmts {
            match stmt {
                Stmt::Expr(expr, _) => {
                    Self::parse_egui_expr_into_node(parent, expr, counter);
                }
                Stmt::Local(local) => {
                    if let Some(init) = &local.init {
                        Self::parse_egui_expr_into_node(parent, &init.expr, counter);
                    }
                }
                _ => {}
            }
        }
    }

    fn parse_egui_expr_into_node(
        parent: &mut WidgetNode,
        expr: &Expr,
        counter: &mut usize,
    ) {
        match expr {
            Expr::Closure(ExprClosure { body, .. }) => {
                if let Expr::Block(b) = &**body {
                    Self::parse_egui_stmts_into_node(parent, &b.block.stmts, counter);
                } else {
                    Self::parse_egui_expr_into_node(parent, body, counter);
                }
            }
            Expr::Block(b) => {
                Self::parse_egui_stmts_into_node(parent, &b.block.stmts, counter);
            }
            Expr::If(ExprIf { cond, then_branch, else_branch, .. }) => {
                let cond_str = quote::quote!(#cond).to_string();
                if cond_str.contains(".clicked()") || cond_str.contains(".button(") || cond_str.contains("Button::new") {
                    *counter += 1;
                    let mut btn = WidgetNode {
                        id: format!("button_{}", counter),
                        widget_type: WidgetType::Button,
                        slot: None,
                        properties: WidgetProperties::default(),
                        layout: None,
                        events: WidgetEvents {
                            on_click: Some(EventHandler {
                                handler_name: "on_click".to_string(),
                                message: None,
                                navigate_to: None,
                            }),
                            ..Default::default()
                        },
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    if let Some(txt) = extract_string_literal(cond) {
                        btn.properties.text = Some(PropertyValue::Static(txt));
                    }
                    parent.children.push(btn);
                } else {
                    *counter += 1;
                    let mut cond_node = WidgetNode {
                        id: format!("cond_{}", counter),
                        widget_type: WidgetType::ConditionalNode,
                        slot: None,
                        properties: WidgetProperties {
                            condition: Some(cond_str),
                            ..Default::default()
                        },
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    Self::parse_egui_stmts_into_node(&mut cond_node, &then_branch.stmts, counter);
                    if let Some((_, else_expr)) = else_branch {
                        Self::parse_egui_expr_into_node(&mut cond_node, else_expr, counter);
                    }
                    parent.children.push(cond_node);
                }
            }
            Expr::MethodCall(m) => {
                let method = m.method.to_string();
                if method == "vertical" || method == "horizontal" || method == "group" || method == "scope" || method == "show" {
                    *counter += 1;
                    let wtype = if method == "horizontal" {
                        WidgetType::HBox
                    } else if method == "show" && quote::quote!(#m.receiver).to_string().contains("ScrollArea") {
                        WidgetType::ScrollPane
                    } else {
                        WidgetType::VBox
                    };
                    let mut container = WidgetNode {
                        id: format!("{}_{}", method, counter),
                        widget_type: wtype,
                        slot: None,
                        properties: WidgetProperties::default(),
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    for arg in &m.args {
                        if let Expr::Closure(closure) = arg {
                            if let Expr::Block(b) = &*closure.body {
                                Self::parse_egui_stmts_into_node(&mut container, &b.block.stmts, counter);
                            } else {
                                Self::parse_egui_expr_into_node(&mut container, &closure.body, counter);
                            }
                        }
                    }
                    parent.children.push(container);
                } else if method == "button" {
                    *counter += 1;
                    let mut btn = WidgetNode {
                        id: format!("button_{}", counter),
                        widget_type: WidgetType::Button,
                        slot: None,
                        properties: WidgetProperties::default(),
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    if let Some(txt) = m.args.first().and_then(extract_string_literal) {
                        btn.properties.text = Some(PropertyValue::Static(txt));
                    }
                    parent.children.push(btn);
                } else if method == "label" {
                    *counter += 1;
                    let mut lbl = WidgetNode {
                        id: format!("label_{}", counter),
                        widget_type: WidgetType::Label,
                        slot: None,
                        properties: WidgetProperties::default(),
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    if let Some(txt) = m.args.first().and_then(extract_string_literal) {
                        lbl.properties.text = Some(PropertyValue::Static(txt));
                    }
                    parent.children.push(lbl);
                } else if method == "checkbox" {
                    *counter += 1;
                    let mut chk = WidgetNode {
                        id: format!("checkbox_{}", counter),
                        widget_type: WidgetType::Checkbox,
                        slot: None,
                        properties: WidgetProperties::default(),
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    if let Some(txt) = m.args.iter().find_map(extract_string_literal) {
                        chk.properties.text = Some(PropertyValue::Static(txt));
                    }
                    parent.children.push(chk);
                } else if method == "image" {
                    *counter += 1;
                    let img_path = m
                        .args
                        .first()
                        .and_then(extract_string_literal)
                        .map(|p| rux_ast::asset::normalize_image_path(&p));
                    let img = WidgetNode {
                        id: format!("image_{}", counter),
                        widget_type: WidgetType::Image,
                        slot: None,
                        properties: WidgetProperties {
                            image_path: img_path,
                            ..Default::default()
                        },
                        layout: None,
                        events: WidgetEvents::default(),
                        bindings: WidgetBindings::default(),
                        animations: Vec::new(),
                        children: Vec::new(),
                    };
                    parent.children.push(img);
                } else if method == "add" || method == "add_sized" {
                    if let Some(arg) = m.args.last() {
                        let arg_str = quote::quote!(#arg).to_string();
                        *counter += 1;
                        let (wtype, txt_opt) = if arg_str.contains("Button") {
                            (WidgetType::Button, extract_string_literal(arg))
                        } else if arg_str.contains("Label") {
                            (WidgetType::Label, extract_string_literal(arg))
                        } else if arg_str.contains("Checkbox") {
                            (WidgetType::Checkbox, extract_string_literal(arg))
                        } else if arg_str.contains("Slider") {
                            (WidgetType::Slider, extract_string_literal(arg))
                        } else if arg_str.contains("Image") {
                            (WidgetType::Image, extract_string_literal(arg))
                        } else {
                            (WidgetType::GenericWidget, None)
                        };

                        let mut node = WidgetNode {
                            id: format!("widget_{}", counter),
                            widget_type: wtype,
                            slot: None,
                            properties: WidgetProperties::default(),
                            layout: None,
                            events: WidgetEvents::default(),
                            bindings: WidgetBindings::default(),
                            animations: Vec::new(),
                            children: Vec::new(),
                        };
                        if let Some(txt) = txt_opt {
                            if node.widget_type == WidgetType::Image {
                                node.properties.image_path = Some(rux_ast::asset::normalize_image_path(&txt));
                            } else {
                                node.properties.text = Some(PropertyValue::Static(txt));
                            }
                        }
                        parent.children.push(node);
                    }
                }
            }
            _ => {}
        }
    }
}

impl Default for EguiPlugin {
    fn default() -> Self {
        Self::new()
    }
}

fn extract_string_literal(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Lit(ExprLit { lit: Lit::Str(s), .. }) => Some(s.value()),
        Expr::Call(ExprCall { args, .. }) => {
            for arg in args {
                if let Some(s) = extract_string_literal(arg) {
                    return Some(s);
                }
            }
            None
        }
        Expr::MethodCall(m) => {
            for arg in &m.args {
                if let Some(s) = extract_string_literal(arg) {
                    return Some(s);
                }
            }
            extract_string_literal(&m.receiver)
        }
        _ => None,
    }
}

impl EguiPlugin {
    fn generate_widget_stmts(&self, node: &WidgetNode, events: &[BoundEvent]) -> TokenStream {
        let child_stmts: Vec<TokenStream> = node
            .children
            .iter()
            .map(|child| self.generate_widget_stmts(child, events))
            .collect();

        let anim_stmts: Vec<TokenStream> = node.animations.iter().map(|anim| {
            let anim_id_str = format!("{}_{}", node.id, anim.id);
            let duration_sec = (anim.duration_ms / 1000.0) as f32;
            let target_val = match &anim.to_value {
                serde_json::Value::Number(n) => n.as_f64().unwrap_or(1.0) as f32,
                _ => 1.0f32,
            };
            quote! {
                let _ = ui.ctx().animate_value_with_time(
                    egui::Id::new(#anim_id_str),
                    #target_val,
                    #duration_sec,
                );
            }
        }).collect();

        let widget_tokens = match node.widget_type {
            WidgetType::VBox => {
                quote! {
                    ui.vertical(|ui| {
                        #(#child_stmts)*
                    });
                }
            }
            WidgetType::HBox => {
                quote! {
                    ui.horizontal(|ui| {
                        #(#child_stmts)*
                    });
                }
            }
            WidgetType::ScrollPane => {
                quote! {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        #(#child_stmts)*
                    });
                }
            }
            WidgetType::AnchorPane | WidgetType::BorderPane | WidgetType::Grid | WidgetType::TabPane | WidgetType::SplitPane | WidgetType::Accordion => {
                quote! {
                    ui.vertical(|ui| {
                        #(#child_stmts)*
                    });
                }
            }
            WidgetType::Button => {
                let btn_text_expr = if let Some(key) = &node.properties.text_key {
                    quote!(t!(#key))
                } else {
                    let txt = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    quote!(#txt)
                };

                let nav_target = node
                    .events
                    .on_click
                    .as_ref()
                    .and_then(|e| e.navigate_to.as_ref())
                    .or(node.events.navigate.as_ref());

                let on_press_handler = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_click");

                

                if let Some(target_screen) = nav_target {
                    let screen_ident = make_ident(&to_pascal_case(target_screen));
                    if let Some(aria) = &node.properties.aria_label {
                        quote! {
                            let btn_res = ui.button(#btn_text_expr);
                            btn_res.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, #aria));
                            if btn_res.clicked() {
                                handler.dispatch(state, UiMessage::Navigate(AppScreen::#screen_ident));
                            }
                        }
                    } else {
                        quote! {
                            if ui.button(#btn_text_expr).clicked() {
                                handler.dispatch(state, UiMessage::Navigate(AppScreen::#screen_ident));
                            }
                        }
                    }
                } else if let Some(ev) = on_press_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    if let Some(aria) = &node.properties.aria_label {
                        quote! {
                            let btn_res = ui.button(#btn_text_expr);
                            btn_res.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, #aria));
                            if btn_res.clicked() {
                                handler.dispatch(state, UiMessage::#msg_variant);
                            }
                        }
                    } else {
                        quote! {
                            if ui.button(#btn_text_expr).clicked() {
                                handler.dispatch(state, UiMessage::#msg_variant);
                            }
                        }
                    }
                } else {
                    if let Some(aria) = &node.properties.aria_label {
                        quote! {
                            ui.button(#btn_text_expr).widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, #aria));
                        }
                    } else {
                        quote! {
                            let _ = ui.button(#btn_text_expr);
                        }
                    }
                }
            }
            WidgetType::Label => {
                let lbl_core = if let Some(binding) = &node.bindings.value {
                    let field_ident = make_ident(&to_snake_case(binding));
                    quote! {
                        ui.label(format!("{}", state.#field_ident))
                    }
                } else if let Some(key) = &node.properties.text_key {
                    quote! {
                        ui.label(t!(#key))
                    }
                } else {
                    let lbl_text = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    quote! {
                        ui.label(#lbl_text)
                    }
                };

                if let Some(aria) = &node.properties.aria_label {
                    quote! {
                        #lbl_core.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Label, #aria));
                    }
                } else {
                    quote! {
                        let _ = #lbl_core;
                    }
                }
            }
            WidgetType::Image => {
                let img_path = node
                    .properties
                    .image_path
                    .as_deref()
                    .or_else(|| {
                        node.properties
                            .custom_properties
                            .get("image_path")
                            .and_then(|v| v.as_str())
                    })
                    .unwrap_or("assets/image.png");

                quote! {
                    ui.add(egui::Image::from_bytes(#img_path, include_bytes!(#img_path)));
                }
            }
            WidgetType::TextInput => {
                let field_ident = if let Some(binding) = &node.bindings.value {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };

                let on_input_handler = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_input")
                });

                if let Some(ev) = on_input_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        if ui.text_edit_singleline(&mut state.#field_ident).changed() {
                            handler.dispatch(state, UiMessage::#msg_variant(state.#field_ident.clone()));
                        }
                    }
                } else {
                    quote! {
                        ui.text_edit_singleline(&mut state.#field_ident);
                    }
                }
            }
            WidgetType::Checkbox => {
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());

                let field_ident = if let Some(binding) = &node.bindings.value {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };

                let on_toggle_handler = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_click")
                });

                if let Some(ev) = on_toggle_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        if ui.checkbox(&mut state.#field_ident, #label).changed() {
                            handler.dispatch(state, UiMessage::#msg_variant(state.#field_ident));
                        }
                    }
                } else {
                    quote! {
                        ui.checkbox(&mut state.#field_ident, #label);
                    }
                }
            }
            WidgetType::RadioButton => {
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());

                let field_ident = if let Some(binding) = &node.bindings.value {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };

                let on_click_handler = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_click");

                if let Some(ev) = on_click_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        if ui.radio_value(&mut state.#field_ident, true, #label).clicked() {
                            handler.dispatch(state, UiMessage::#msg_variant);
                        }
                    }
                } else {
                    quote! {
                        ui.radio_value(&mut state.#field_ident, true, #label);
                    }
                }
            }
            WidgetType::Slider => {
                let min = node.properties.min_value.unwrap_or(0.0);
                let max = node.properties.max_value.unwrap_or(100.0);
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());

                let field_ident = if let Some(binding) = &node.bindings.value {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };

                let on_change_handler = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_change");

                if let Some(ev) = on_change_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        if ui.add(egui::Slider::new(&mut state.#field_ident, #min..=#max).text(#label)).changed() {
                            handler.dispatch(state, UiMessage::#msg_variant(state.#field_ident));
                        }
                    }
                } else {
                    quote! {
                        ui.add(egui::Slider::new(&mut state.#field_ident, #min..=#max).text(#label));
                    }
                }
            }
            WidgetType::ProgressBar => {
                let field_ident = if let Some(binding) = &node.bindings.value {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };
                quote! {
                    ui.add(egui::ProgressBar::new(state.#field_ident as f32));
                }
            }
            WidgetType::ComboBox => {
                let id_literal = &node.id;
                let items_ident = if let Some(binding) = &node.bindings.items {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&format!("{}_options", to_snake_case(&node.id)))
                };

                let selected_ident = if let Some(binding) = &node.bindings.selected {
                    make_ident(&to_snake_case(binding))
                } else {
                    make_ident(&to_snake_case(&node.id))
                };

                let on_change_handler = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_change");

                let event_stmt = if let Some(ev) = on_change_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        handler.dispatch(state, UiMessage::#msg_variant(item.clone()));
                    }
                } else {
                    quote! {}
                };

                quote! {
                    egui::ComboBox::from_id_salt(#id_literal)
                        .selected_text(format!("{:?}", state.#selected_ident))
                        .show_ui(ui, |ui| {
                            for item in &state.#items_ident {
                                let is_selected = state.#selected_ident.as_ref() == Some(item);
                                if ui.selectable_label(is_selected, item).clicked() {
                                    state.#selected_ident = Some(item.clone());
                                    #event_stmt
                                }
                            }
                        });
                }
            }
            WidgetType::DataGrid => {
                let table_id = &node.id;
                let cols = &node.properties.columns;
                let col_headers = if cols.is_empty() {
                    vec![quote!(header.col(|ui| { ui.strong("Column"); });)]
                } else {
                    cols.iter()
                        .map(|col| {
                            let title = &col.title;
                            quote!(header.col(|ui| { ui.strong(#title); });)
                        })
                        .collect()
                };
                let col_builders = if cols.is_empty() {
                    vec![quote!(.column(egui_extras::Column::auto().resizable(true)))]
                } else {
                    cols.iter()
                        .map(|_| quote!(.column(egui_extras::Column::auto().resizable(true))))
                        .collect()
                };
                let row_height = node.properties.row_height.unwrap_or(24.0) as f32;
                let total_rows = node.properties.total_rows.unwrap_or(100);

                quote! {
                    egui_extras::TableBuilder::new(ui)
                        .id_salt(#table_id)
                        .striped(true)
                        .resizable(true)
                        .cell_layout(egui::Layout::left_to_right(egui::Align::Center))
                        #(#col_builders)*
                        .header(20.0, |mut header| {
                            #(#col_headers)*
                        })
                        .body(|body| {
                            body.rows(#row_height, #total_rows, |mut row| {
                                row.col(|ui| {
                                    ui.label("Data");
                                });
                            });
                        });
                }
            }
            WidgetType::Chart | WidgetType::LineChart | WidgetType::BarChart | WidgetType::PieChart | WidgetType::ScatterChart => {
                let chart_id = &node.id;
                let series_name = node.properties.text.as_deref().unwrap_or("Series 1");
                quote! {
                    egui_plot::Plot::new(#chart_id)
                        .legend(egui_plot::Legend::default())
                        .show(ui, |plot_ui| {
                            let points = egui_plot::PlotPoints::new(vec![[0.0, 10.0], [1.0, 25.0], [2.0, 42.0], [3.0, 68.0]]);
                            plot_ui.line(egui_plot::Line::new(points).name(#series_name));
                        });
                }
            }
            WidgetType::TreeView => {
                let header_text = node.properties.text.as_deref().unwrap_or(node.id.as_str());
                if child_stmts.is_empty() {
                    quote! {
                        egui::CollapsingHeader::new(#header_text)
                            .default_open(true)
                            .show(ui, |ui| {
                                ui.label("Item 1");
                                ui.label("Item 2");
                            });
                    }
                } else {
                    quote! {
                        egui::CollapsingHeader::new(#header_text)
                            .default_open(true)
                            .show(ui, |ui| {
                                #(#child_stmts)*
                            });
                    }
                }
            }
            WidgetType::Viewport3D | WidgetType::Canvas3D => {
                let model_path = node.properties.model_3d_path.as_deref().unwrap_or("assets/model.gltf");
                let fov = node.properties.camera_fov.unwrap_or(60.0);
                quote! {
                    ui.group(|ui| {
                        ui.label(format!("3D Viewport: {} (FOV: {:.0})", #model_path, #fov));
                    });
                }
            }
            WidgetType::ConditionalNode => {
                let cond_str = node.properties.condition.as_deref().unwrap_or("true");
                let cond_tokens: TokenStream = syn::parse_str(cond_str).unwrap_or_else(|_| quote!(#cond_str));
                quote! {
                    if #cond_tokens {
                        #(#child_stmts)*
                    }
                }
            }
            WidgetType::GenericWidget => {
                let custom_str = node.properties.custom_type.as_deref().unwrap_or("GenericWidget::new");
                let custom_tokens: TokenStream = syn::parse_str(custom_str).unwrap_or_else(|_| quote!(#custom_str));
                if let Some(ref raw_args) = node.properties.raw_args {
                    let args_tokens: TokenStream = syn::parse_str(raw_args).unwrap_or_else(|_| quote!(#raw_args));
                    quote! {
                        #custom_tokens(ui, #args_tokens);
                    }
                } else {
                    quote! {
                        #custom_tokens(ui);
                    }
                }
            }
            WidgetType::CustomComponent => {
                let comp_name = node.properties.custom_type.as_deref().unwrap_or("CustomComponent");
                if let Some(ref raw_args) = node.properties.raw_args {
                    let call_tokens: TokenStream = syn::parse_str(raw_args).unwrap_or_else(|_| quote!(#raw_args));
                    quote! { #call_tokens; }
                } else {
                    let comp_ident: TokenStream = syn::parse_str(comp_name).unwrap_or_else(|_| quote!(#comp_name));
                    quote! { #comp_ident::show(ui); }
                }
            }
            _ => {
                if let Some(img_path) = node
                    .properties
                    .image_path
                    .as_deref()
                    .or_else(|| {
                        node.properties
                            .custom_properties
                            .get("image_path")
                            .and_then(|v| v.as_str())
                    })
                {
                    quote! {
                        ui.add(egui::Image::from_bytes(#img_path, include_bytes!(#img_path)));
                    }
                } else {
                    let node_id = node.id.as_str();
                    quote! {
                        ui.label(#node_id);
                    }
                }
            }
        };

        quote! {
            #(#anim_stmts)*
            #widget_tokens
        }
    }
}

impl CodeGenerator for EguiPlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Egui
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Egui,
            framework_name: "egui".to_string(),
            version: "0.29".to_string(),
            language: "rust".to_string(),
            description: "Immediate mode GUI library for Rust designed to be simple, fast, and highly portable.".to_string(),
            ui_filename: "ui_generated.rs".to_string(),
            controller_filename: "controller.rs".to_string(),
        }
    }

    fn generate(
        &self,
        doc: &RuxDocument,
        state_fields: &[InferredField],
        events: &[BoundEvent],
        existing_controller: Option<&str>,
        _options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError> {
        let app_state_tokens = generate_app_state_tokens(state_fields);
        let ui_message_tokens = generate_ui_message_tokens(events);
        let ui_handler_tokens = generate_ui_handler_tokens(events);
        let widget_ids_tokens = generate_widget_ids_tokens(doc);

        let render_body = self.generate_widget_stmts(&doc.root, events);

        let render_tokens = quote! {
            pub fn render_ui<H: UiHandler>(
                ui: &mut egui::Ui,
                state: &mut AppState,
                handler: &mut H,
            ) {
                #render_body
            }
        };

        let file_tokens = quote! {
            use serde::{Deserialize, Serialize};

            #app_state_tokens
            #ui_message_tokens
            #ui_handler_tokens
            #widget_ids_tokens
            #render_tokens
        };

        let syntax_file: File = syn::parse2(file_tokens)
            .map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;
        let mut ui_generated_code = if let Some(ref existing) = _options.existing_ui_code {
            if !existing.trim().is_empty() {
                match crate::patcher::AstPatcher::patch_ui_source(existing, doc, TargetFramework::Egui) {
                    Ok(patched) => patched,
                    Err(_) => prettyplease::unparse(&syntax_file),
                }
            } else {
                prettyplease::unparse(&syntax_file)
            }
        } else {
            prettyplease::unparse(&syntax_file)
        };

        if !doc.components.is_empty() && !ui_generated_code.contains("pub mod components;") {
            ui_generated_code = format!("pub mod components;\npub use components::*;\n\n{}", ui_generated_code);
        }

        let mut diagnostics = Vec::new();
        let controller_code = match existing_controller {
            Some(existing) if !existing.trim().is_empty() => {
                match merge_controller(existing, events) {
                    Ok(merged) => merged,
                    Err(err) => {
                        return Err(CodegenError::SynParseError(format!(
                            "Cannot overwrite controller.rs because existing code contains syntax errors: {}. Fix syntax errors before exporting.",
                            err
                        )));
                    }
                }
            }
            _ => generate_initial_controller(events),
        };

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated egui 0.29 UI ({} bytes) and controller ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        let theme_file = crate::view::generate_theme_file(doc, TargetFramework::Egui);
        let mut auxiliary_files = vec![theme_file];
        let mut i18n_files = crate::view::generate_localization_files(doc);
        auxiliary_files.append(&mut i18n_files);

        let default_proj = rux_ast::project::RuxProject::new(&doc.metadata.app_name, "main");
        let router_file = crate::router::RouterGenerator::generate_router_file(
            &default_proj,
            TargetFramework::Egui,
        );
        auxiliary_files.push(router_file);

        if !doc.components.is_empty() {
            let mut mod_exports = String::new();
            for (comp_name, comp_def) in &doc.components {
                let snake = crate::sanitizer::to_snake_case(comp_name);
                let comp_tokens = self.generate_widget_stmts(&comp_def.root, events);
                let comp_code = format!(
                    "//! Component {}\nuse egui::Ui;\n\npub struct {};\n\nimpl {} {{\n    pub fn show(ui: &mut Ui) {{\n        {}\n    }}\n}}\n",
                    comp_name, comp_name, comp_name, comp_tokens
                );
                let filename = comp_def.file_path.clone().unwrap_or_else(|| format!("src/components/{}.rs", snake));
                auxiliary_files.push(GeneratedFile {
                    filename,
                    content: comp_code,
                    file_type: "component".to_string(),
                });
                mod_exports.push_str(&format!("pub mod {};\npub use {}::*;\n", snake, snake));
            }
            auxiliary_files.push(GeneratedFile {
                filename: "src/components/mod.rs".to_string(),
                content: mod_exports,
                file_type: "component_module".to_string(),
            });
        }

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.rs".to_string(),
            ui_generated_code,
            controller_filename: "controller.rs".to_string(),
            controller_code,
            auxiliary_files,
            diagnostics,
            target_framework: TargetFramework::Egui,
            framework_version: "0.29".to_string(),
        })
    }
}
