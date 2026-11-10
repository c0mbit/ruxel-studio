use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::layout::ContainerLayout;
use rux_ast::widget::{WidgetNode, WidgetType};
use syn::File;

use crate::controller_merge::{generate_initial_controller, merge_controller};
use crate::error::CodegenError;
use crate::events::{generate_ui_message_tokens, BoundEvent};
use crate::generator::CodegenDiagnostic;
use crate::handler::generate_ui_handler_tokens;
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, TargetFramework,
};
use crate::sanitizer::{make_ident, to_snake_case};
use crate::state::{generate_app_state_tokens, InferredField};
use crate::view::generate_widget_ids_tokens;

fn get_gap(node: &WidgetNode) -> f64 {
    if let Some(ref layout) = node.layout {
        if let Some(ContainerLayout::Flex(ref flex)) = layout.container {
            return flex.gap;
        }
    }
    8.0
}

pub struct DioxusPlugin;

impl DioxusPlugin {
    pub fn new() -> Self {
        Self
    }

    fn generate_widget_rsx(&self, node: &WidgetNode, events: &[BoundEvent]) -> TokenStream {
        let child_rsx: Vec<TokenStream> = node
            .children
            .iter()
            .map(|child| self.generate_widget_rsx(child, events))
            .collect();

        match node.widget_type {
            WidgetType::VBox | WidgetType::AnchorPane | WidgetType::BorderPane | WidgetType::Grid | WidgetType::TabPane | WidgetType::SplitPane | WidgetType::Accordion => {
                let gap = get_gap(node);
                let style = format!("display: flex; flex-direction: column; gap: {}px;", gap);
                quote! {
                    div {
                        style: #style,
                        #(#child_rsx)*
                    }
                }
            }
            WidgetType::HBox => {
                let gap = get_gap(node);
                let style = format!("display: flex; flex-direction: row; gap: {}px;", gap);
                quote! {
                    div {
                        style: #style,
                        #(#child_rsx)*
                    }
                }
            }
            WidgetType::ScrollPane => {
                quote! {
                    div {
                        style: "overflow-y: auto; display: flex; flex-direction: column; gap: 8px;",
                        #(#child_rsx)*
                    }
                }
            }
            WidgetType::Button => {
                let btn_text = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());

                let on_click_handler = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_click");

                if let Some(ev) = on_click_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        button {
                            onclick: {
                                let mut state = state.clone();
                                let mut handler = handler.clone();
                                move |_| {
                                    handler.dispatch(&mut state, UiMessage::#msg_variant);
                                }
                            },
                            #btn_text
                        }
                    }
                } else {
                    quote! {
                        button {
                            #btn_text
                        }
                    }
                }
            }
            WidgetType::Label => {
                if let Some(binding) = &node.bindings.value {
                    let field_ident = make_ident(&to_snake_case(binding));
                    quote! {
                        span {
                            format!("{}", state.#field_ident)
                        }
                    }
                } else {
                    let txt = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    quote! {
                        span {
                            #txt
                        }
                    }
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
                        input {
                            r#type: "text",
                            value: format!("{}", state.#field_ident),
                            oninput: {
                                let mut state = state.clone();
                                let mut handler = handler.clone();
                                move |evt: FormEvent| {
                                    handler.dispatch(&mut state, UiMessage::#msg_variant(evt.value()));
                                }
                            }
                        }
                    }
                } else {
                    quote! {
                        input {
                            r#type: "text",
                            value: format!("{}", state.#field_ident),
                        }
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
                        label {
                            input {
                                r#type: "checkbox",
                                checked: state.#field_ident,
                                onchange: {
                                    let mut state = state.clone();
                                    let mut handler = handler.clone();
                                    move |evt: FormEvent| {
                                        let is_checked = evt.value() == "true";
                                        handler.dispatch(&mut state, UiMessage::#msg_variant(is_checked));
                                    }
                                }
                            },
                            #label
                        }
                    }
                } else {
                    quote! {
                        label {
                            input {
                                r#type: "checkbox",
                                checked: state.#field_ident,
                            },
                            #label
                        }
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

                quote! {
                    label {
                        input {
                            r#type: "radio",
                            name: "radio_group",
                            checked: state.#field_ident,
                        },
                        #label
                    }
                }
            }
            WidgetType::Slider => {
                let min_str = format!("{}", node.properties.min_value.unwrap_or(0.0));
                let max_str = format!("{}", node.properties.max_value.unwrap_or(100.0));

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
                        input {
                            r#type: "range",
                            min: #min_str,
                            max: #max_str,
                            value: format!("{}", state.#field_ident),
                            oninput: {
                                let mut state = state.clone();
                                let mut handler = handler.clone();
                                move |evt: FormEvent| {
                                    if let Ok(v) = evt.value().parse::<f64>() {
                                        handler.dispatch(&mut state, UiMessage::#msg_variant(v));
                                    }
                                }
                            }
                        }
                    }
                } else {
                    quote! {
                        input {
                            r#type: "range",
                            min: #min_str,
                            max: #max_str,
                            value: format!("{}", state.#field_ident),
                        }
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
                    progress {
                        value: format!("{}", state.#field_ident),
                        max: "1.0",
                    }
                }
            }
            WidgetType::ComboBox => {
                quote! {
                    select {}
                }
            }
            WidgetType::CustomComponent => {
                let comp_name = node.properties.custom_type.as_deref().unwrap_or("CustomComponent");
                let comp_ident: TokenStream = syn::parse_str(comp_name).unwrap_or_else(|_| quote!(#comp_name));
                quote! {
                    #comp_ident {}
                }
            }
            WidgetType::Image => {
                let img_path = node
                    .properties
                    .image_path
                    .as_deref()
                    .unwrap_or("assets/image.png");
                quote! {
                    img {
                        src: #img_path
                    }
                }
            }
            _ => {
                quote! {
                    div {}
                }
            }
        }
    }
}

impl Default for DioxusPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeGenerator for DioxusPlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Dioxus
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Dioxus,
            framework_name: "Dioxus".to_string(),
            version: "0.5".to_string(),
            language: "rust".to_string(),
            description: "Fullstack, cross-platform GUI framework for Rust with reactive RSX architecture.".to_string(),
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

        let rsx_tree = self.generate_widget_rsx(&doc.root, events);

        let component_tokens = quote! {
            #[component]
            pub fn AppUi<H: UiHandler + Clone + PartialEq + 'static>(
                state: AppState,
                handler: H,
            ) -> Element {
                rsx! {
                    #rsx_tree
                }
            }
        };

        let file_tokens = quote! {
            use dioxus::prelude::*;
            use serde::{Deserialize, Serialize};

            #app_state_tokens
            #ui_message_tokens
            #ui_handler_tokens
            #widget_ids_tokens
            #component_tokens
        };

        let syntax_file: File = syn::parse2(file_tokens)
            .map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;
        let ui_generated_code = if let Some(ref existing) = _options.existing_ui_code {
            if !existing.trim().is_empty() {
                if let Some(pos) = existing.find("rsx!") {
                    let after = &existing[pos + 4..];
                    if let Some(brace_rel) = after.find('{') {
                        let brace_start = pos + 4 + brace_rel;
                        let inner = &existing[brace_start + 1..];
                        let mut depth = 1;
                        let mut end_pos = None;
                        for (idx, ch) in inner.char_indices() {
                            if ch == '{' {
                                depth += 1;
                            } else if ch == '}' {
                                depth -= 1;
                                if depth == 0 {
                                    end_pos = Some(brace_start + 1 + idx);
                                    break;
                                }
                            }
                        }
                        if let Some(close_idx) = end_pos {
                            let rsx_str = rsx_tree.to_string();
                            let mut patched = existing.to_string();
                            patched.replace_range(
                                brace_start + 1..close_idx,
                                &format!("\n            {}\n        ", rsx_str),
                            );
                            patched
                        } else {
                            prettyplease::unparse(&syntax_file)
                        }
                    } else {
                        prettyplease::unparse(&syntax_file)
                    }
                } else {
                    prettyplease::unparse(&syntax_file)
                }
            } else {
                prettyplease::unparse(&syntax_file)
            }
        } else {
            prettyplease::unparse(&syntax_file)
        };

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
                "Successfully generated Dioxus 0.5 component ({} bytes) and controller ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        let theme_file = crate::view::generate_theme_file(doc, TargetFramework::Dioxus);

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.rs".to_string(),
            ui_generated_code,
            controller_filename: "controller.rs".to_string(),
            controller_code,
            auxiliary_files: vec![theme_file],
            diagnostics,
            target_framework: TargetFramework::Dioxus,
            framework_version: "0.5".to_string(),
        })
    }
}

impl DioxusPlugin {
    pub fn reverse_parse_rsx(code: &str) -> Result<WidgetNode, CodegenError> {
        let extracted = extract_rsx_body(code);
        let call_body: dioxus_rsx::CallBody = match syn2::parse_str::<dioxus_rsx::CallBody>(extracted) {
            Ok(b) => b,
            Err(_) => {
                syn2::parse_str::<dioxus_rsx::CallBody>(&format!("{{\n{}\n}}", extracted))
                    .map_err(|e| CodegenError::SynParseError(format!("Failed to parse Dioxus RSX: {}", e)))?
            }
        };

        let mut counter = 0;
        let mut children = Vec::new();
        for root in &call_body.roots {
            if let Some(child_node) = body_node_to_widget_node(root, &mut counter) {
                children.push(child_node);
            }
        }

        if children.len() == 1 {
            Ok(children.remove(0))
        } else {
            Ok(WidgetNode {
                id: "div_root".to_string(),
                widget_type: WidgetType::VBox,
                slot: None,
                properties: rux_ast::widget::WidgetProperties::default(),
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children,
            })
        }
    }

    pub fn patch_dioxus_document(
        doc: &mut RuxDocument,
        code: &str,
        patches: &mut Vec<crate::reverse_parser::PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let parsed_tree = Self::reverse_parse_rsx(code)?;
        Self::reconcile_dioxus_node(&mut doc.root, &parsed_tree, patches);
        Ok(())
    }

    fn reconcile_dioxus_node(
        target: &mut WidgetNode,
        parsed: &WidgetNode,
        patches: &mut Vec<crate::reverse_parser::PropertyPatch>,
    ) {
        if let Some(ref new_text) = parsed.properties.text {
            if target.properties.text.as_ref() != Some(new_text) {
                patches.push(crate::reverse_parser::PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "text".to_string(),
                    old_value: target.properties.text.as_ref().map(|t| t.to_string()),
                    new_value: new_text.to_string(),
                });
                target.properties.text = Some(new_text.clone());
            }
        }

        if let Some(ref new_bg) = parsed.properties.background_color {
            if target.properties.background_color.as_ref() != Some(new_bg) {
                patches.push(crate::reverse_parser::PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "background_color".to_string(),
                    old_value: target.properties.background_color.clone(),
                    new_value: new_bg.clone(),
                });
                target.properties.background_color = Some(new_bg.clone());
            }
        }

        if let Some(ref new_img) = parsed.properties.image_path {
            if target.properties.image_path.as_ref() != Some(new_img) {
                patches.push(crate::reverse_parser::PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "image_path".to_string(),
                    old_value: target.properties.image_path.clone(),
                    new_value: new_img.clone(),
                });
                target.properties.image_path = Some(new_img.clone());
            }
        }

        if target.children.is_empty() && !parsed.children.is_empty() {
            target.children = parsed.children.clone();
            patches.push(crate::reverse_parser::PropertyPatch {
                widget_id: target.id.clone(),
                property_name: "children".to_string(),
                old_value: None,
                new_value: format!("{} children", parsed.children.len()),
            });
        } else {
            let min_len = target.children.len().min(parsed.children.len());
            for i in 0..min_len {
                Self::reconcile_dioxus_node(&mut target.children[i], &parsed.children[i], patches);
            }
            if parsed.children.len() > target.children.len() {
                for i in target.children.len()..parsed.children.len() {
                    let new_child = parsed.children[i].clone();
                    patches.push(crate::reverse_parser::PropertyPatch {
                        widget_id: new_child.id.clone(),
                        property_name: "created".to_string(),
                        old_value: None,
                        new_value: format!("{:?}", new_child.widget_type),
                    });
                    target.children.push(new_child);
                }
            }
        }
    }
}

pub fn extract_rsx_body(source: &str) -> &str {
    if let Some(pos) = source.find("rsx!") {
        let after = &source[pos + 4..];
        if let Some(brace_start) = after.find('{') {
            let inner = &after[brace_start + 1..];
            let mut depth = 1;
            for (idx, ch) in inner.char_indices() {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                    if depth == 0 {
                        return &inner[..idx];
                    }
                }
            }
            return inner;
        }
    }
    source
}

fn extract_literal_string(s: &str) -> Option<String> {
    if let Some(start) = s.find('"') {
        let rest = &s[start + 1..];
        if let Some(end) = rest.rfind('"') {
            return Some(rest[..end].to_string());
        }
    }
    None
}

fn body_node_to_widget_node(node: &dioxus_rsx::BodyNode, counter: &mut usize) -> Option<WidgetNode> {
    match node {
        dioxus_rsx::BodyNode::Element(el) => {
            let tag = el.name.to_string();
            let mut properties = rux_ast::widget::WidgetProperties::default();
            let bindings = rux_ast::widget::WidgetBindings::default();
            let mut events = rux_ast::widget::WidgetEvents::default();
            let mut text_content: Option<String> = None;
            let mut child_widgets = Vec::new();

            let mut style_attr: Option<String> = None;
            let mut type_attr: Option<String> = None;

            for attr in &el.attributes {
                if let dioxus_rsx::AttributeType::Named(named) = attr {
                    let attr_name_tokens = &named.attr.name;
                    let attr_val_tokens = &named.attr.value;
                    let attr_name = quote::quote!(#attr_name_tokens).to_string();
                    let val_raw = quote::quote!(#attr_val_tokens).to_string();
                    let val_str = extract_literal_string(&val_raw).unwrap_or(val_raw);

                    match attr_name.as_str() {
                        "style" => {
                            style_attr = Some(val_str.clone());
                            properties
                                .custom_properties
                                .insert("style".to_string(), serde_json::Value::String(val_str));
                        }
                        "type" | "r#type" => {
                            type_attr = Some(val_str);
                        }
                        "src" => {
                            properties.image_path = Some(rux_ast::asset::normalize_image_path(&val_str));
                        }
                        "value" => {
                            properties.text = Some(rux_ast::widget::PropertyValue::Static(val_str));
                        }
                        "checked" => {
                            properties.checked = Some(val_str == "true");
                        }
                        "min" => {
                            properties.min_value = val_str.parse::<f64>().ok();
                        }
                        "max" => {
                            properties.max_value = val_str.parse::<f64>().ok();
                        }
                        "onclick" => {
                            events.on_click = Some(rux_ast::widget::EventHandler {
                                handler_name: "on_click".to_string(),
                                message: None,
                                navigate_to: None,
                            });
                        }
                        _ => {}
                    }
                }
            }

            for child in &el.children {
                match child {
                    dioxus_rsx::BodyNode::Text(ifmt) => {
                        let t = ifmt.source.as_ref().map(|s| s.value()).unwrap_or_else(|| {
                            let s = quote::quote!(#ifmt).to_string();
                            extract_literal_string(&s).unwrap_or(s)
                        });
                        text_content = Some(t);
                    }
                    dioxus_rsx::BodyNode::RawExpr(expr) => {
                        let s = quote::quote!(#expr).to_string();
                        if let Some(lit) = extract_literal_string(&s) {
                            text_content = Some(lit);
                        } else {
                            properties.text = Some(rux_ast::widget::PropertyValue::Binding(s));
                        }
                    }
                    other => {
                        if let Some(child_node) = body_node_to_widget_node(other, counter) {
                            child_widgets.push(child_node);
                        }
                    }
                }
            }

            if let Some(txt) = text_content {
                properties.text = Some(rux_ast::widget::PropertyValue::Static(txt));
            }

            *counter += 1;
            let node_id = format!("{}_{}", tag.to_lowercase(), counter);

            let widget_type = match tag.as_str() {
                "div" => {
                    if let Some(ref st) = style_attr {
                        if st.contains("flex-direction: row") {
                            rux_ast::widget::WidgetType::HBox
                        } else if st.contains("overflow-y: auto") {
                            rux_ast::widget::WidgetType::ScrollPane
                        } else if st.contains("display: grid") {
                            rux_ast::widget::WidgetType::Grid
                        } else {
                            rux_ast::widget::WidgetType::VBox
                        }
                    } else {
                        rux_ast::widget::WidgetType::VBox
                    }
                }
                "button" => rux_ast::widget::WidgetType::Button,
                "span" | "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "label" => {
                    rux_ast::widget::WidgetType::Label
                }
                "input" => match type_attr.as_deref() {
                    Some("checkbox") => rux_ast::widget::WidgetType::Checkbox,
                    Some("radio") => rux_ast::widget::WidgetType::RadioButton,
                    Some("range") => rux_ast::widget::WidgetType::Slider,
                    _ => rux_ast::widget::WidgetType::TextInput,
                },
                "progress" => rux_ast::widget::WidgetType::ProgressBar,
                "select" => rux_ast::widget::WidgetType::ComboBox,
                "img" => rux_ast::widget::WidgetType::Image,
                other => {
                    properties.custom_type = Some(other.to_string());
                    rux_ast::widget::WidgetType::GenericWidget
                }
            };

            Some(WidgetNode {
                id: node_id,
                widget_type,
                slot: None,
                properties,
                layout: None,
                events,
                bindings,
                animations: Vec::new(),
                children: child_widgets,
            })
        }
        _ => None,
    }
}
