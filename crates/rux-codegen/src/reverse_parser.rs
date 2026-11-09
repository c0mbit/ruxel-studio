use rux_ast::document::RuxDocument;
use rux_ast::widget::{WidgetNode, WidgetType};
use serde::{Deserialize, Serialize};
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{
    Expr, ExprCall, ExprLit, ExprMacro, ExprPath, ExprStruct, File, Item, ItemFn, Lit, Member,
    Stmt, Token,
};

use crate::error::CodegenError;
use crate::events::EventCollector;
use crate::plugin::TargetFramework;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PropertyPatch {
    pub widget_id: String,
    pub property_name: String,
    pub old_value: Option<String>,
    pub new_value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReverseParserReport {
    pub patched_nodes_count: usize,
    pub patches: Vec<PropertyPatch>,
}

pub struct ReverseParser;

impl ReverseParser {
    pub fn patch_document(
        doc: &mut RuxDocument,
        code: &str,
        framework: Option<TargetFramework>,
    ) -> Result<ReverseParserReport, CodegenError> {
        let syntax_file: File =
            syn::parse_str(code).map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;

        let mut patches = Vec::new();

        match framework {
            Some(TargetFramework::Iced) => {
                Self::patch_iced(doc, &syntax_file, &mut patches)?;
            }
            Some(TargetFramework::Egui) => {
                Self::patch_egui(doc, &syntax_file, &mut patches)?;
            }
            _ => {
                let has_view_fn = syntax_file.items.iter().any(|item| {
                    if let Item::Fn(f) = item {
                        f.sig.ident == "view"
                    } else {
                        false
                    }
                });

                let has_render_ui_fn = syntax_file.items.iter().any(|item| {
                    if let Item::Fn(f) = item {
                        f.sig.ident == "render_ui"
                    } else {
                        false
                    }
                });

                let has_build_view_fn = syntax_file.items.iter().any(|item| {
                    if let Item::Fn(f) = item {
                        f.sig.ident == "build_view"
                    } else {
                        false
                    }
                });

                if has_build_view_fn {
                    Self::patch_build_view(doc, &syntax_file, &mut patches)?;
                } else if has_render_ui_fn {
                    Self::patch_egui(doc, &syntax_file, &mut patches)?;
                } else if has_view_fn {
                    Self::patch_iced(doc, &syntax_file, &mut patches)?;
                } else {
                    Self::patch_any(doc, &syntax_file, &mut patches)?;
                }
            }
        }

        let mut unique_node_ids = std::collections::HashSet::new();
        for p in &patches {
            unique_node_ids.insert(p.widget_id.clone());
        }

        Ok(ReverseParserReport {
            patched_nodes_count: unique_node_ids.len(),
            patches,
        })
    }

    fn patch_build_view(
        doc: &mut RuxDocument,
        syntax_file: &File,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { sig, block, .. }) = item {
                if sig.ident == "build_view" {
                    for stmt in &block.stmts {
                        if let Stmt::Expr(expr, _) = stmt {
                            Self::traverse_build_view_expr(doc, expr, patches);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn traverse_build_view_expr(
        doc: &mut RuxDocument,
        expr: &Expr,
        patches: &mut Vec<PropertyPatch>,
    ) {
        if let Expr::Struct(ExprStruct { path, fields, .. }) = expr {
            if path.is_ident("ViewNode") {
                let mut node_id: Option<String> = None;
                let mut text_val: Option<Option<String>> = None;
                let mut bg_val: Option<Option<String>> = None;
                let mut border_val: Option<Option<String>> = None;
                let mut text_color_val: Option<Option<String>> = None;
                let mut children_exprs: Vec<Expr> = Vec::new();

                for field in fields {
                    let field_name = match &field.member {
                        Member::Named(ident) => ident.to_string(),
                        _ => continue,
                    };

                    match field_name.as_str() {
                        "id" => {
                            node_id = extract_string_lit(&field.expr);
                        }
                        "text" => {
                            text_val = Some(extract_optional_string_lit(&field.expr));
                        }
                        "background" => {
                            bg_val = Some(extract_optional_string_lit(&field.expr));
                        }
                        "border_color" => {
                            border_val = Some(extract_optional_string_lit(&field.expr));
                        }
                        "text_color" => {
                            text_color_val = Some(extract_optional_string_lit(&field.expr));
                        }
                        "children" => {
                            children_exprs = extract_vec_macro_elements(&field.expr);
                        }
                        _ => {}
                    }
                }

                if let Some(id) = node_id {
                    let target_opt = if doc.root.id == id {
                        Some(&mut doc.root)
                    } else {
                        find_node_mut(&mut doc.root, &id)
                    };

                    if let Some(target_node) = target_opt {
                        if let Some(Some(txt)) = text_val {
                            patch_text(target_node, &txt, patches);
                        }
                        if let Some(bg) = bg_val {
                            patch_optional_color(
                                target_node,
                                "background_color",
                                bg.as_deref(),
                                patches,
                            );
                        }
                        if let Some(border) = border_val {
                            patch_optional_color(
                                target_node,
                                "border_color",
                                border.as_deref(),
                                patches,
                            );
                        }
                        if let Some(tc) = text_color_val {
                            patch_optional_color(
                                target_node,
                                "text_color",
                                tc.as_deref(),
                                patches,
                            );
                        }
                    }
                }

                for child_expr in children_exprs {
                    Self::traverse_build_view_expr(doc, &child_expr, patches);
                }
            }
        }
    }

    fn patch_iced(
        doc: &mut RuxDocument,
        syntax_file: &File,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let events = EventCollector::collect_document(doc);

        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { sig, block, .. }) = item {
                if sig.ident == "view" {
                    for stmt in &block.stmts {
                        if let Stmt::Expr(expr, _) = stmt {
                            let unwrapped = unwrap_method_calls(expr);
                            Self::reconcile_iced_container(
                                &mut doc.root,
                                unwrapped.base_expr,
                                &events,
                                patches,
                            );
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn reconcile_iced_container(
        node: &mut WidgetNode,
        expr: &Expr,
        events: &[crate::events::BoundEvent],
        patches: &mut Vec<PropertyPatch>,
    ) {
        match expr {
            Expr::Macro(ExprMacro { mac, .. }) => {
                let macro_name = mac
                    .path
                    .segments
                    .last()
                    .map(|s| s.ident.to_string())
                    .unwrap_or_default();

                if macro_name == "column" || macro_name == "row" {
                    let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
                    if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                        let elements: Vec<Expr> = punctuated.into_iter().collect();
                        Self::reconcile_iced_children(node, &elements, events, patches);
                    }
                }
            }
            Expr::Call(ExprCall { func, args, .. }) => {
                let func_name = extract_path_ident(func).unwrap_or_default();
                if (func_name == "container" || func_name == "scrollable") && !args.is_empty() {
                    let inner = unwrap_method_calls(&args[0]);
                    Self::reconcile_iced_container(node, inner.base_expr, events, patches);
                }
            }
            _ => {}
        }
    }

    fn reconcile_iced_children(
        parent: &mut WidgetNode,
        elements: &[Expr],
        events: &[crate::events::BoundEvent],
        patches: &mut Vec<PropertyPatch>,
    ) {
        let old_children = std::mem::take(&mut parent.children);
        let mut assigned_old: Vec<bool> = vec![false; old_children.len()];
        let mut element_matches: Vec<Option<usize>> = vec![None; elements.len()];

        // Pass 1: Exact ID match via events (e.g. on_press UiMessage variant)
        for (elem_idx, elem_expr) in elements.iter().enumerate() {
            let call_info = unwrap_call_chain(elem_expr);
            if let Some(target_id) = find_widget_id_from_calls(&call_info, events) {
                if let Some(old_idx) = old_children
                    .iter()
                    .enumerate()
                    .position(|(i, c)| !assigned_old[i] && c.id == target_id)
                {
                    element_matches[elem_idx] = Some(old_idx);
                    assigned_old[old_idx] = true;
                }
            }
        }

        // Pass 2: Type AND text/placeholder match
        for (elem_idx, elem_expr) in elements.iter().enumerate() {
            if element_matches[elem_idx].is_some() {
                continue;
            }
            let call_info = unwrap_call_chain(elem_expr);
            let inferred_type = infer_iced_widget_type(&call_info);
            let elem_text = extract_string_from_call_args(&call_info.base_args);

            if let (Some(wtype), Some(ref text)) = (inferred_type, &elem_text) {
                if let Some(old_idx) = old_children.iter().enumerate().position(|(i, c)| {
                    if assigned_old[i] || c.widget_type != wtype {
                        return false;
                    }
                    c.properties.text.as_deref() == Some(text.as_str())
                        || c.properties.placeholder.as_deref() == Some(text.as_str())
                }) {
                    element_matches[elem_idx] = Some(old_idx);
                    assigned_old[old_idx] = true;
                }
            }
        }

        // Pass 3: Same widget type match
        for (elem_idx, elem_expr) in elements.iter().enumerate() {
            if element_matches[elem_idx].is_some() {
                continue;
            }
            let call_info = unwrap_call_chain(elem_expr);
            if let Some(wtype) = infer_iced_widget_type(&call_info) {
                if let Some(old_idx) = old_children
                    .iter()
                    .enumerate()
                    .position(|(i, c)| !assigned_old[i] && c.widget_type == wtype)
                {
                    element_matches[elem_idx] = Some(old_idx);
                    assigned_old[old_idx] = true;
                }
            }
        }

        // Pass 4: Fallback to matching remaining in position order if lengths match
        if elements.len() == old_children.len() {
            for (elem_idx, old_match) in element_matches.iter_mut().enumerate() {
                if old_match.is_none() && !assigned_old[elem_idx] {
                    *old_match = Some(elem_idx);
                    assigned_old[elem_idx] = true;
                }
            }
        }

        // Record deletions for unassigned old children
        for (i, assigned) in assigned_old.iter().enumerate() {
            if !assigned {
                patches.push(PropertyPatch {
                    widget_id: old_children[i].id.clone(),
                    property_name: "deleted".to_string(),
                    old_value: Some(old_children[i].id.clone()),
                    new_value: "none".to_string(),
                });
            }
        }

        let mut new_children = Vec::with_capacity(elements.len());
        let mut existing_ids: std::collections::HashSet<String> =
            old_children.iter().map(|c| c.id.clone()).collect();
        let mut new_counter: usize = 1;

        for (elem_idx, elem_expr) in elements.iter().enumerate() {
            if let Some(old_idx) = element_matches[elem_idx] {
                let mut child = old_children[old_idx].clone();
                Self::reconcile_iced_widget(&mut child, elem_expr, events, patches);
                new_children.push(child);
            } else {
                // New element added in code (e.g. prepended or appended)
                let call_info = unwrap_call_chain(elem_expr);
                let wtype = infer_iced_widget_type(&call_info).unwrap_or(WidgetType::Label);
                let prefix = match wtype {
                    WidgetType::Button => "btn",
                    WidgetType::Label => "lbl",
                    WidgetType::TextInput => "txt",
                    WidgetType::Checkbox => "chk",
                    WidgetType::RadioButton => "rad",
                    WidgetType::VBox => "vbox",
                    WidgetType::HBox => "hbox",
                    _ => "node",
                };

                let mut new_id = format!("{}_{}", prefix, new_counter);
                while existing_ids.contains(&new_id) {
                    new_counter += 1;
                    new_id = format!("{}_{}", prefix, new_counter);
                }
                existing_ids.insert(new_id.clone());
                new_counter += 1;

                let mut new_child = WidgetNode {
                    id: new_id.clone(),
                    widget_type: wtype,
                    slot: None,
                    properties: rux_ast::widget::WidgetProperties::default(),
                    layout: None,
                    events: rux_ast::widget::WidgetEvents::default(),
                    bindings: rux_ast::widget::WidgetBindings::default(),
                    animations: Vec::new(),
                    children: Vec::new(),
                };

                Self::reconcile_iced_widget(&mut new_child, elem_expr, events, patches);
                patches.push(PropertyPatch {
                    widget_id: new_id,
                    property_name: "created".to_string(),
                    old_value: None,
                    new_value: format!("{:?}", new_child.widget_type),
                });
                new_children.push(new_child);
            }
        }

        parent.children = new_children;
    }

    fn reconcile_iced_widget(
        node: &mut WidgetNode,
        expr: &Expr,
        events: &[crate::events::BoundEvent],
        patches: &mut Vec<PropertyPatch>,
    ) {
        let call_info = unwrap_call_chain(expr);

        if let Some(target_id) = find_widget_id_from_calls(&call_info, events) {
            if target_id != node.id {
                return;
            }
        }

        match node.widget_type {
            WidgetType::Button => {
                if let Some(txt) = extract_string_from_call_args(&call_info.base_args) {
                    patch_text(node, &txt, patches);
                }
            }
            WidgetType::Label => {
                if let Some(txt) = extract_string_from_call_args(&call_info.base_args) {
                    patch_text(node, &txt, patches);
                }
            }
            WidgetType::TextInput => {
                if let Some(placeholder) = extract_string_from_call_args(&call_info.base_args) {
                    patch_placeholder(node, &placeholder, patches);
                }
            }
            WidgetType::Checkbox => {
                if let Some(txt) = extract_string_from_call_args(&call_info.base_args) {
                    patch_text(node, &txt, patches);
                }
            }
            WidgetType::RadioButton => {
                if let Some(txt) = extract_string_from_call_args(&call_info.base_args) {
                    patch_text(node, &txt, patches);
                }
            }
            WidgetType::VBox
            | WidgetType::HBox
            | WidgetType::ScrollPane
            | WidgetType::AnchorPane
            | WidgetType::BorderPane
            | WidgetType::Grid
            | WidgetType::TabPane
            | WidgetType::SplitPane
            | WidgetType::Accordion => {
                Self::reconcile_iced_container(node, call_info.base_expr, events, patches);
            }
            _ => {}
        }

        for (method_name, method_args) in &call_info.methods {
            if *method_name == "style" || *method_name == "background" {
                for arg in method_args {
                    if let Some(color_hex) = extract_color_hex(arg) {
                        patch_optional_color(
                            node,
                            "background_color",
                            Some(&color_hex),
                            patches,
                        );
                    }
                }
            }
        }
    }

    fn patch_egui(
        doc: &mut RuxDocument,
        syntax_file: &File,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let events = EventCollector::collect_document(doc);

        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { sig, block, .. }) = item {
                if sig.ident == "render_ui" {
                    Self::reconcile_egui_block(&mut doc.root, &block.stmts, &events, patches, true);
                }
            }
        }

        Ok(())
    }

    fn reconcile_egui_block(
        node: &mut WidgetNode,
        stmts: &[Stmt],
        events: &[crate::events::BoundEvent],
        patches: &mut Vec<PropertyPatch>,
        is_root_block: bool,
    ) {
        let mut child_index = 0;

        for stmt in stmts {
            match stmt {
                Stmt::Expr(expr, _) => {
                    Self::reconcile_egui_expr(
                        node,
                        expr,
                        &mut child_index,
                        events,
                        patches,
                        is_root_block,
                    );
                }
                Stmt::Local(local) => {
                    if let Some(init) = &local.init {
                        Self::reconcile_egui_expr(
                            node,
                            &init.expr,
                            &mut child_index,
                            events,
                            patches,
                            is_root_block,
                        );
                    }
                }
                _ => {}
            }
        }
    }

    fn reconcile_egui_expr(
        node: &mut WidgetNode,
        expr: &Expr,
        child_index: &mut usize,
        events: &[crate::events::BoundEvent],
        patches: &mut Vec<PropertyPatch>,
        is_root_block: bool,
    ) {
        match expr {
            Expr::If(expr_if) => {
                let call_info = unwrap_call_chain(&expr_if.cond);
                let has_button = call_info.methods.iter().any(|(m, _)| m == "button");

                if has_button {
                    let mut button_args = Vec::new();
                    for (m, args) in &call_info.methods {
                        if m == "button" {
                            button_args = args.clone();
                            break;
                        }
                    }

                    let event_id = find_event_in_block(&expr_if.then_branch.stmts, events);

                    let target_node = if let Some(ref id) = event_id {
                        find_node_mut(node, id)
                    } else if *child_index < node.children.len() {
                        Some(&mut node.children[*child_index])
                    } else {
                        None
                    };

                    if let Some(btn_node) = target_node {
                        if let Some(txt) = extract_string_from_call_args(&button_args) {
                            patch_text(btn_node, &txt, patches);
                        }
                    }
                    *child_index += 1;
                }
            }
            Expr::MethodCall(method_call) => {
                let method_name = method_call.method.to_string();

                if method_name == "vertical" || method_name == "horizontal" {
                    if let Some(closure_body) = extract_closure_stmts(&method_call.args) {
                        if is_root_block && *child_index == 0 {
                            Self::reconcile_egui_block(
                                node,
                                &closure_body,
                                events,
                                patches,
                                false,
                            );
                        } else if *child_index < node.children.len() {
                            let child_node = &mut node.children[*child_index];
                            Self::reconcile_egui_block(
                                child_node,
                                &closure_body,
                                events,
                                patches,
                                false,
                            );
                            *child_index += 1;
                        } else {
                            Self::reconcile_egui_block(
                                node,
                                &closure_body,
                                events,
                                patches,
                                false,
                            );
                        }
                    }
                } else if method_name == "button" {
                    let args: Vec<&Expr> = method_call.args.iter().collect();
                    if *child_index < node.children.len() {
                        let target_node = &mut node.children[*child_index];
                        if let Some(txt) = extract_string_from_call_args(&args) {
                            patch_text(target_node, &txt, patches);
                        }
                        *child_index += 1;
                    }
                } else if method_name == "label" {
                    let args: Vec<&Expr> = method_call.args.iter().collect();
                    let target_node = find_next_matching_child(node, *child_index, WidgetType::Label);
                    if let Some(lbl_node) = target_node {
                        if let Some(txt) = extract_string_from_call_args(&args) {
                            patch_text(lbl_node, &txt, patches);
                        }
                    }
                    *child_index += 1;
                } else if method_name == "checkbox" {
                    let args: Vec<&Expr> = method_call.args.iter().collect();
                    let target_node = if let Some(field_name) = extract_state_field_name(&args) {
                        find_node_mut(node, &field_name)
                    } else {
                        find_next_matching_child(node, *child_index, WidgetType::Checkbox)
                    };

                    if let Some(chk_node) = target_node {
                        if let Some(txt) = extract_string_from_call_args(&args) {
                            patch_text(chk_node, &txt, patches);
                        }
                    }
                    *child_index += 1;
                } else if method_name == "text_edit_singleline" {
                    *child_index += 1;
                }
            }
            _ => {}
        }
    }

    fn patch_any(
        doc: &mut RuxDocument,
        syntax_file: &File,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let events = EventCollector::collect_document(doc);

        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { block, .. }) = item {
                for stmt in &block.stmts {
                    if let Stmt::Expr(expr, _) = stmt {
                        let unwrapped = unwrap_method_calls(expr);
                        Self::reconcile_iced_container(
                            &mut doc.root,
                            unwrapped.base_expr,
                            &events,
                            patches,
                        );
                    }
                }
            }
        }

        Ok(())
    }
}

struct UnwrappedCall<'a> {
    base_expr: &'a Expr,
    #[allow(dead_code)]
    base_ident: String,
    base_args: Vec<&'a Expr>,
    methods: Vec<(String, Vec<&'a Expr>)>,
}

fn unwrap_call_chain<'a>(expr: &'a Expr) -> UnwrappedCall<'a> {
    let mut current = expr;
    let mut methods = Vec::new();

    while let Expr::MethodCall(method_call) = current {
        let name = method_call.method.to_string();
        let args: Vec<&'a Expr> = method_call.args.iter().collect();
        methods.push((name, args));
        current = &method_call.receiver;
    }

    let base_ident = match current {
        Expr::Call(ExprCall { func, args, .. }) => {
            let ident = extract_path_ident(func).unwrap_or_default();
            let base_args: Vec<&'a Expr> = args.iter().collect();
            return UnwrappedCall {
                base_expr: current,
                base_ident: ident,
                base_args,
                methods,
            };
        }
        Expr::Path(ExprPath { path, .. }) => {
            path.segments.last().map(|s| s.ident.to_string()).unwrap_or_default()
        }
        _ => String::new(),
    };

    UnwrappedCall {
        base_expr: current,
        base_ident,
        base_args: Vec::new(),
        methods,
    }
}

fn infer_iced_widget_type(call_info: &UnwrappedCall) -> Option<WidgetType> {
    if let Expr::Macro(ExprMacro { mac, .. }) = call_info.base_expr {
        let name = mac
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();
        if name == "column" {
            return Some(WidgetType::VBox);
        } else if name == "row" {
            return Some(WidgetType::HBox);
        }
    }
    match call_info.base_ident.as_str() {
        "button" => Some(WidgetType::Button),
        "text" => Some(WidgetType::Label),
        "text_input" => Some(WidgetType::TextInput),
        "checkbox" => Some(WidgetType::Checkbox),
        "radio" => Some(WidgetType::RadioButton),
        "slider" => Some(WidgetType::Slider),
        "progress_bar" => Some(WidgetType::ProgressBar),
        "container" => Some(WidgetType::VBox),
        "scrollable" => Some(WidgetType::ScrollPane),
        _ => None,
    }
}

struct UnwrappedMethodCalls<'a> {
    base_expr: &'a Expr,
}

fn unwrap_method_calls<'a>(expr: &'a Expr) -> UnwrappedMethodCalls<'a> {
    let mut current = expr;
    while let Expr::MethodCall(m) = current {
        current = &m.receiver;
    }
    UnwrappedMethodCalls { base_expr: current }
}

fn extract_path_ident(expr: &Expr) -> Option<String> {
    if let Expr::Path(ExprPath { path, .. }) = expr {
        path.segments.last().map(|s| s.ident.to_string())
    } else {
        None
    }
}

fn extract_closure_stmts(args: &Punctuated<Expr, Token![,]>) -> Option<Vec<Stmt>> {
    for arg in args {
        if let Expr::Closure(closure) = arg {
            match &*closure.body {
                Expr::Block(block) => return Some(block.block.stmts.clone()),
                Expr::MethodCall(_) | Expr::Call(_) | Expr::If(_) => {
                    return Some(vec![Stmt::Expr((*closure.body).clone(), None)]);
                }
                _ => {}
            }
        }
    }
    None
}

fn find_next_matching_child(
    parent: &mut WidgetNode,
    start_index: usize,
    target_type: WidgetType,
) -> Option<&mut WidgetNode> {
    if start_index < parent.children.len() {
        if let Some(pos) = parent.children[start_index..]
            .iter()
            .position(|c| c.widget_type == target_type)
        {
            return Some(&mut parent.children[start_index + pos]);
        }
    }

    if let Some(pos) = parent.children.iter().position(|c| c.widget_type == target_type) {
        return Some(&mut parent.children[pos]);
    }

    None
}

fn extract_state_field_name(args: &[&Expr]) -> Option<String> {
    for arg in args {
        if let Expr::Reference(ref_expr) = arg {
            if let Expr::Field(field_expr) = &*ref_expr.expr {
                if let Member::Named(ident) = &field_expr.member {
                    return Some(ident.to_string());
                }
            }
        } else if let Expr::Field(field_expr) = arg {
            if let Member::Named(ident) = &field_expr.member {
                return Some(ident.to_string());
            }
        }
    }
    None
}

fn find_event_in_block(
    stmts: &[Stmt],
    events: &[crate::events::BoundEvent],
) -> Option<String> {
    for stmt in stmts {
        if let Stmt::Expr(expr, _) = stmt {
            if let Some(variant) = extract_ui_message_variant_from_expr(expr) {
                if let Some(ev) = events.iter().find(|e| e.message_variant == variant) {
                    return Some(ev.widget_id.clone());
                }
            }
        }
    }
    None
}

fn extract_ui_message_variant_from_expr(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Call(ExprCall { args, .. }) => {
            for arg in args {
                if let Some(v) = extract_ui_message_variant(arg) {
                    return Some(v);
                }
            }
            None
        }
        Expr::MethodCall(method_call) => {
            for arg in &method_call.args {
                if let Some(v) = extract_ui_message_variant(arg) {
                    return Some(v);
                }
            }
            None
        }
        _ => None,
    }
}

fn find_widget_id_from_calls(
    call_info: &UnwrappedCall,
    events: &[crate::events::BoundEvent],
) -> Option<String> {
    for (_, args) in &call_info.methods {
        for arg in args {
            if let Some(variant) = extract_ui_message_variant(arg) {
                if let Some(ev) = events.iter().find(|e| e.message_variant == variant) {
                    return Some(ev.widget_id.clone());
                }
            }
        }
    }
    None
}

fn extract_ui_message_variant(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Path(ExprPath { path, .. }) => {
            if path.segments.len() >= 2 {
                let first = path.segments[0].ident.to_string();
                if first == "UiMessage" {
                    return Some(path.segments[1].ident.to_string());
                }
            }
            None
        }
        Expr::Call(ExprCall { func, .. }) => extract_ui_message_variant(func),
        _ => None,
    }
}

fn extract_string_from_call_args(args: &[&Expr]) -> Option<String> {
    for arg in args {
        if let Some(s) = extract_string_lit(arg) {
            return Some(s);
        }
    }
    None
}

fn extract_string_lit(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Lit(ExprLit {
            lit: Lit::Str(lit_str),
            ..
        }) => Some(lit_str.value()),
        Expr::Call(ExprCall { func, args, .. }) => {
            let func_ident = extract_path_ident(func).unwrap_or_default();
            if func_ident == "text" || func_ident == "format" {
                for arg in args {
                    if let Some(s) = extract_string_lit(arg) {
                        return Some(s);
                    }
                }
            }
            for arg in args {
                if let Some(s) = extract_string_lit(arg) {
                    return Some(s);
                }
            }
            None
        }
        Expr::MethodCall(method_call) => {
            if let Some(s) = extract_string_lit(&method_call.receiver) {
                return Some(s);
            }
            for arg in &method_call.args {
                if let Some(s) = extract_string_lit(arg) {
                    return Some(s);
                }
            }
            None
        }
        Expr::Reference(ref_expr) => extract_string_lit(&ref_expr.expr),
        _ => None,
    }
}

fn extract_optional_string_lit(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Call(ExprCall { func, args, .. }) => {
            let func_name = extract_path_ident(func).unwrap_or_default();
            if func_name == "Some" && !args.is_empty() {
                extract_string_lit(&args[0])
            } else {
                None
            }
        }
        Expr::Path(ExprPath { path, .. }) => {
            if path.is_ident("None") {
                None
            } else {
                None
            }
        }
        _ => extract_string_lit(expr),
    }
}

fn extract_color_hex(expr: &Expr) -> Option<String> {
    if let Some(raw) = extract_string_lit(expr) {
        if raw.starts_with('#') && (raw.len() == 4 || raw.len() == 7 || raw.len() == 9) {
            return Some(raw);
        }
    }
    None
}

fn extract_vec_macro_elements(expr: &Expr) -> Vec<Expr> {
    if let Expr::Macro(ExprMacro { mac, .. }) = expr {
        let name = mac
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();

        if name == "vec" {
            let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
            if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                return punctuated.into_iter().collect();
            }
        }
    }
    Vec::new()
}

pub fn find_node_mut<'a>(node: &'a mut WidgetNode, target_id: &str) -> Option<&'a mut WidgetNode> {
    if node.id == target_id {
        return Some(node);
    }
    for child in &mut node.children {
        if let Some(found) = find_node_mut(child, target_id) {
            return Some(found);
        }
    }
    None
}

fn patch_text(node: &mut WidgetNode, new_text: &str, patches: &mut Vec<PropertyPatch>) {
    let old_text = node.properties.text.clone();
    if old_text.as_deref() != Some(new_text) {
        patches.push(PropertyPatch {
            widget_id: node.id.clone(),
            property_name: "text".to_string(),
            old_value: old_text,
            new_value: new_text.to_string(),
        });
        node.properties.text = Some(new_text.to_string());
    }
}

fn patch_placeholder(
    node: &mut WidgetNode,
    new_placeholder: &str,
    patches: &mut Vec<PropertyPatch>,
) {
    let old_placeholder = node.properties.placeholder.clone();
    if old_placeholder.as_deref() != Some(new_placeholder) {
        patches.push(PropertyPatch {
            widget_id: node.id.clone(),
            property_name: "placeholder".to_string(),
            old_value: old_placeholder,
            new_value: new_placeholder.to_string(),
        });
        node.properties.placeholder = Some(new_placeholder.to_string());
    }
}

fn patch_optional_color(
    node: &mut WidgetNode,
    prop_name: &str,
    new_val: Option<&str>,
    patches: &mut Vec<PropertyPatch>,
) {
    let old_val = match prop_name {
        "background_color" => node.properties.background_color.clone(),
        "border_color" => node.properties.border_color.clone(),
        "text_color" => node.properties.text_color.clone(),
        _ => None,
    };

    let needs_update = match (&old_val, new_val) {
        (Some(o), Some(n)) => o.as_str() != n,
        (None, Some(_)) => true,
        (Some(_), None) => true,
        (None, None) => false,
    };

    if needs_update {
        patches.push(PropertyPatch {
            widget_id: node.id.clone(),
            property_name: prop_name.to_string(),
            old_value: old_val,
            new_value: new_val.unwrap_or("").to_string(),
        });

        let target_option = new_val.map(|s| s.to_string());
        match prop_name {
            "background_color" => node.properties.background_color = target_option,
            "border_color" => node.properties.border_color = target_option,
            "text_color" => node.properties.text_color = target_option,
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rux_ast::widget::{EventHandler, WidgetBindings, WidgetEvents, WidgetProperties};

    fn create_test_node(id: &str, widget_type: WidgetType) -> WidgetNode {
        WidgetNode {
            id: id.to_string(),
            widget_type,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: Vec::new(),
            children: Vec::new(),
        }
    }

    fn create_test_document() -> RuxDocument {
        let sample_json = include_str!("../../../examples/sample_app.rux");
        let mut doc: RuxDocument =
            serde_json::from_str(sample_json).expect("Sample app must parse");

        let mut btn = create_test_node("btn_submit", WidgetType::Button);
        btn.properties.text = Some("Submit".to_string());
        btn.events.on_click = Some(EventHandler {
            handler_name: "on_submit".to_string(),
            message: None,
            navigate_to: None,
        });

        let mut lbl = create_test_node("lbl_status", WidgetType::Label);
        lbl.properties.text = Some("Welcome".to_string());

        let mut txt = create_test_node("txt_input", WidgetType::TextInput);
        txt.properties.placeholder = Some("Enter name".to_string());
        txt.events.on_change = Some(EventHandler {
            handler_name: "on_name_change".to_string(),
            message: None,
            navigate_to: None,
        });

        let mut chk = create_test_node("chk_agree", WidgetType::Checkbox);
        chk.properties.text = Some("Accept terms".to_string());
        chk.events.on_click = Some(EventHandler {
            handler_name: "on_agree_toggle".to_string(),
            message: None,
            navigate_to: None,
        });

        let mut root = create_test_node("root", WidgetType::VBox);
        root.children = vec![btn, lbl, txt, chk];

        doc.root = root;
        doc
    }

    #[test]
    fn test_reverse_parse_iced_button_text_change() {
        let mut doc = create_test_document();

        let iced_code = r##"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, checkbox, column, container, text, text_input};
                column![
                    button(text("Login")).on_press(UiMessage::OnSubmit),
                    text("Welcome"),
                    text_input("Enter name", &state.txt_input).on_input(UiMessage::OnNameChange),
                    checkbox("Accept terms", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
                ]
                .spacing(8.0)
                .into()
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
            .expect("Reverse parsing should succeed");

        assert_eq!(report.patched_nodes_count, 1);
        assert_eq!(report.patches.len(), 1);
        assert_eq!(report.patches[0].widget_id, "btn_submit");
        assert_eq!(report.patches[0].property_name, "text");
        assert_eq!(report.patches[0].old_value, Some("Submit".to_string()));
        assert_eq!(report.patches[0].new_value, "Login");

        assert_eq!(
            doc.root.children[0].properties.text.as_deref(),
            Some("Login")
        );
    }

    #[test]
    fn test_reverse_parse_iced_multiple_properties() {
        let mut doc = create_test_document();

        let iced_code = r##"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, checkbox, column, container, text, text_input};
                column![
                    button(text("Authenticate")).on_press(UiMessage::OnSubmit),
                    text("Dashboard Overview"),
                    text_input("Enter your email", &state.txt_input).on_input(UiMessage::OnNameChange),
                    checkbox("Keep me signed in", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
                ]
                .spacing(8.0)
                .into()
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
            .expect("Reverse parsing should succeed");

        assert_eq!(report.patched_nodes_count, 4);
        assert_eq!(
            doc.root.children[0].properties.text.as_deref(),
            Some("Authenticate")
        );
        assert_eq!(
            doc.root.children[1].properties.text.as_deref(),
            Some("Dashboard Overview")
        );
        assert_eq!(
            doc.root.children[2].properties.placeholder.as_deref(),
            Some("Enter your email")
        );
        assert_eq!(
            doc.root.children[3].properties.text.as_deref(),
            Some("Keep me signed in")
        );
    }

    #[test]
    fn test_reverse_parse_egui_button_and_labels() {
        let mut doc = create_test_document();

        let egui_code = r##"
            pub fn render_ui<H: UiHandler>(
                ui: &mut egui::Ui,
                state: &mut AppState,
                handler: &mut H,
            ) {
                ui.vertical(|ui| {
                    if ui.button("Confirm Transfer").clicked() {
                        handler.dispatch(state, UiMessage::OnSubmit);
                    }
                    ui.label("Account Balance: $1,250.00");
                    ui.checkbox(&mut state.chk_agree, "Confirm transaction integrity");
                });
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, egui_code, Some(TargetFramework::Egui))
            .expect("Reverse parsing should succeed");

        assert_eq!(report.patched_nodes_count, 3);
        assert_eq!(
            doc.root.children[0].properties.text.as_deref(),
            Some("Confirm Transfer")
        );
        assert_eq!(
            doc.root.children[1].properties.text.as_deref(),
            Some("Account Balance: $1,250.00")
        );
        assert_eq!(
            doc.root.children[3].properties.text.as_deref(),
            Some("Confirm transaction integrity")
        );
    }

    #[test]
    fn test_reverse_parse_build_view_colors_and_text() {
        let mut doc = create_test_document();

        let build_view_code = r##"
            pub fn build_view(state: &AppState) -> ViewNode {
                ViewNode {
                    id: "root",
                    widget_type: "VBox",
                    text: None,
                    background: Some("#1e1e2e"),
                    border_color: None,
                    text_color: None,
                    children: vec![
                        ViewNode {
                            id: "btn_submit",
                            widget_type: "Button",
                            text: Some("Proceed to Checkout".to_string()),
                            background: Some("#ff5500"),
                            border_color: Some("#ffffff"),
                            text_color: Some("#000000"),
                            children: vec![],
                        },
                        ViewNode {
                            id: "lbl_status",
                            widget_type: "Label",
                            text: Some("Order Ready".to_string()),
                            background: None,
                            border_color: None,
                            text_color: Some("#888888"),
                            children: vec![],
                        }
                    ],
                }
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, build_view_code, None)
            .expect("Reverse parsing should succeed");

        assert_eq!(report.patched_nodes_count, 3);

        let btn = &doc.root.children[0];
        assert_eq!(btn.properties.text.as_deref(), Some("Proceed to Checkout"));
        assert_eq!(btn.properties.background_color.as_deref(), Some("#ff5500"));
        assert_eq!(btn.properties.border_color.as_deref(), Some("#ffffff"));
        assert_eq!(btn.properties.text_color.as_deref(), Some("#000000"));

        let root = &doc.root;
        assert_eq!(root.properties.background_color.as_deref(), Some("#1e1e2e"));
    }

    #[test]
    fn test_reverse_parse_syntax_error_safety() {
        let mut doc = create_test_document();

        let broken_code = r##"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                column![
                    button(text("Broken"
        "##;

        let result = ReverseParser::patch_document(&mut doc, broken_code, Some(TargetFramework::Iced));
        assert!(result.is_err());
        assert_eq!(
            doc.root.children[0].properties.text.as_deref(),
            Some("Submit")
        );
    }

    #[test]
    fn test_reverse_parse_no_op_when_identical() {
        let mut doc = create_test_document();

        let identical_code = r##"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, checkbox, column, container, text, text_input};
                column![
                    button(text("Submit")).on_press(UiMessage::OnSubmit),
                    text("Welcome"),
                    text_input("Enter name", &state.txt_input).on_input(UiMessage::OnNameChange),
                    checkbox("Accept terms", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
                ]
                .spacing(8.0)
                .into()
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, identical_code, Some(TargetFramework::Iced))
            .expect("Reverse parsing should succeed");

        assert_eq!(report.patched_nodes_count, 0);
        assert_eq!(report.patches.len(), 0);
    }

    #[test]
    fn test_reverse_parse_iced_prepend_element() {
        let mut doc = create_test_document();
        assert_eq!(doc.root.children.len(), 4);
        assert_eq!(doc.root.children[0].id, "btn_submit");

        // User prepends a new Label before the Button in Rust code
        let iced_code = r##"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, checkbox, column, container, text, text_input};
                column![
                    text("New Header Notification"),
                    button(text("Submit")).on_press(UiMessage::OnSubmit),
                    text("Welcome"),
                    text_input("Enter name", &state.txt_input).on_input(UiMessage::OnNameChange),
                    checkbox("Accept terms", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
                ]
                .spacing(8.0)
                .into()
            }
        "##;

        let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
            .expect("Reverse parsing should succeed");

        assert_eq!(doc.root.children.len(), 5);
        // First element is newly created prepended label
        assert_eq!(doc.root.children[0].id, "lbl_1");
        assert_eq!(doc.root.children[0].properties.text.as_deref(), Some("New Header Notification"));
        assert_eq!(doc.root.children[0].widget_type, WidgetType::Label);

        // Second element is still btn_submit without being corrupted by positional index mismatch
        assert_eq!(doc.root.children[1].id, "btn_submit");
        assert_eq!(doc.root.children[1].widget_type, WidgetType::Button);
        assert_eq!(doc.root.children[1].properties.text.as_deref(), Some("Submit"));

        // Third element is lbl_status (matched via type + text "Welcome")
        assert_eq!(doc.root.children[2].id, "lbl_status");
        assert_eq!(doc.root.children[2].properties.text.as_deref(), Some("Welcome"));

        assert_eq!(report.patched_nodes_count, 1);
        assert_eq!(report.patches.len(), 2);
        assert!(report.patches.iter().any(|p| p.property_name == "created"));
        assert!(report.patches.iter().any(|p| p.property_name == "text"));
    }
}
