use std::collections::BTreeMap;
use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::layout::{ContainerLayout, FlexContainer, FlexDirection, Size, WidgetLayout};
use rux_ast::widget::{EventHandler, PropertyValue, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType};
use syn::File;

use crate::controller_merge::{generate_initial_controller, merge_controller};
use crate::error::CodegenError;
use crate::events::{generate_ui_message_tokens, BoundEvent, EventPayloadType};
use crate::generator::CodegenDiagnostic;
use crate::handler::generate_ui_handler_tokens;
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, GeneratedFile, TargetFramework,
};
use crate::reverse_parser::PropertyPatch;
use crate::sanitizer::{make_ident, to_snake_case};
use crate::state::{generate_app_state_tokens, InferredField, StateType};
use crate::view::generate_widget_ids_tokens;

fn get_gap(node: &WidgetNode) -> f64 {
    if let Some(ref layout) = node.layout {
        if let Some(ContainerLayout::Flex(ref flex)) = layout.container {
            return flex.gap;
        }
    }
    8.0
}

fn get_width(node: &WidgetNode) -> Option<f64> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(w) = layout.dimensions.width {
            return Some(w);
        }
    }
    None
}

fn get_height(node: &WidgetNode) -> Option<f64> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(h) = layout.dimensions.height {
            return Some(h);
        }
    }
    None
}

pub struct SlintPlugin;

impl SlintPlugin {
    pub fn new() -> Self {
        Self
    }

    fn generate_slint_code(
        &self,
        doc: &RuxDocument,
        state_fields: &[InferredField],
        events: &[BoundEvent],
    ) -> String {
        let mut out = String::new();
        out.push_str("import { Button, CheckBox, Slider, ProgressIndicator, LineEdit, ScrollView } from \"std-widgets.slint\";\n\n");
        out.push_str("export component MainWindow inherits Window {\n");

        if let Some(w) = get_width(&doc.root) {
            out.push_str(&format!("    width: {}px;\n", w));
        } else {
            out.push_str("    width: 800px;\n");
        }

        if let Some(h) = get_height(&doc.root) {
            out.push_str(&format!("    height: {}px;\n", h));
        } else {
            out.push_str("    height: 600px;\n");
        }

        out.push_str(&format!("    title: \"{}\";\n\n", doc.metadata.app_name));

        for field in state_fields {
            let slint_type = match field.field_type {
                StateType::String | StateType::OptionString => "string",
                StateType::Bool => "bool",
                StateType::F64 => "float",
                StateType::VecString => "[string]",
            };
            let default_val = match field.field_type {
                StateType::String | StateType::OptionString => "\"\"",
                StateType::Bool => "false",
                StateType::F64 => "0.0",
                StateType::VecString => "[]",
            };
            out.push_str(&format!(
                "    in-out property <{}> {}: {};\n",
                slint_type,
                to_snake_case(&field.name),
                default_val
            ));
        }
        out.push('\n');

        let mut unique_callbacks: BTreeMap<String, &EventPayloadType> = BTreeMap::new();
        for ev in events {
            let callback_name = format!("on_{}", to_snake_case(&ev.handler_name));
            unique_callbacks.insert(callback_name, &ev.payload_type);
        }

        for (cb_name, payload) in unique_callbacks {
            match payload {
                EventPayloadType::Unit => {
                    out.push_str(&format!("    callback {}();\n", cb_name));
                }
                EventPayloadType::String => {
                    out.push_str(&format!("    callback {}(string);\n", cb_name));
                }
                EventPayloadType::Bool => {
                    out.push_str(&format!("    callback {}(bool);\n", cb_name));
                }
                EventPayloadType::F64 => {
                    out.push_str(&format!("    callback {}(float);\n", cb_name));
                }
            }
        }
        out.push('\n');

        self.generate_slint_node(&mut out, &doc.root, events, 1);

        out.push_str("}\n");
        out
    }

    fn generate_slint_node(
        &self,
        out: &mut String,
        node: &WidgetNode,
        events: &[BoundEvent],
        indent_level: usize,
    ) {
        let indent = "    ".repeat(indent_level);

        match node.widget_type {
            WidgetType::VBox | WidgetType::AnchorPane | WidgetType::BorderPane | WidgetType::Grid | WidgetType::TabPane | WidgetType::SplitPane | WidgetType::Accordion => {
                out.push_str(&format!("{}VerticalBox {{\n", indent));
                let gap = get_gap(node);
                out.push_str(&format!("{}    spacing: {}px;\n", indent, gap));
                for child in &node.children {
                    self.generate_slint_node(out, child, events, indent_level + 1);
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::HBox => {
                out.push_str(&format!("{}HorizontalBox {{\n", indent));
                let gap = get_gap(node);
                out.push_str(&format!("{}    spacing: {}px;\n", indent, gap));
                for child in &node.children {
                    self.generate_slint_node(out, child, events, indent_level + 1);
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::ScrollPane => {
                out.push_str(&format!("{}ScrollView {{\n", indent));
                out.push_str(&format!("{}    VerticalBox {{\n", indent));
                for child in &node.children {
                    self.generate_slint_node(out, child, events, indent_level + 2);
                }
                out.push_str(&format!("{}    }}\n", indent));
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Button => {
                out.push_str(&format!("{}Button {{\n", indent));
                let txt = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());
                out.push_str(&format!("{}    text: \"{}\";\n", indent, txt));

                let on_click = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_click");

                if let Some(ev) = on_click {
                    let cb_name = format!("on_{}", to_snake_case(&ev.handler_name));
                    out.push_str(&format!("{}    clicked => {{ root.{}(); }}\n", indent, cb_name));
                }

                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Label => {
                out.push_str(&format!("{}Text {{\n", indent));
                if let Some(binding) = &node.bindings.value {
                    let prop_name = to_snake_case(binding);
                    out.push_str(&format!("{}    text: root.{};\n", indent, prop_name));
                } else {
                    let txt = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    out.push_str(&format!("{}    text: \"{}\";\n", indent, txt));
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::TextInput => {
                out.push_str(&format!("{}LineEdit {{\n", indent));
                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!("{}    text <=> root.{};\n", indent, prop_name));

                let on_change = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_input")
                });

                if let Some(ev) = on_change {
                    let cb_name = format!("on_{}", to_snake_case(&ev.handler_name));
                    out.push_str(&format!("{}    edited(val) => {{ root.{}(val); }}\n", indent, cb_name));
                }

                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Checkbox => {
                out.push_str(&format!("{}CheckBox {{\n", indent));
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());
                out.push_str(&format!("{}    text: \"{}\";\n", indent, label));

                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!("{}    checked <=> root.{};\n", indent, prop_name));

                let on_toggle = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_click")
                });

                if let Some(ev) = on_toggle {
                    let cb_name = format!("on_{}", to_snake_case(&ev.handler_name));
                    out.push_str(&format!(
                        "{}    toggled => {{ root.{}(self.checked); }}\n",
                        indent, cb_name
                    ));
                }

                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Slider => {
                out.push_str(&format!("{}Slider {{\n", indent));
                let min = node.properties.min_value.unwrap_or(0.0);
                let max = node.properties.max_value.unwrap_or(100.0);
                out.push_str(&format!("{}    minimum: {:.1};\n", indent, min));
                out.push_str(&format!("{}    maximum: {:.1};\n", indent, max));

                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!("{}    value <=> root.{};\n", indent, prop_name));

                let on_change = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_change");

                if let Some(ev) = on_change {
                    let cb_name = format!("on_{}", to_snake_case(&ev.handler_name));
                    out.push_str(&format!("{}    changed(val) => {{ root.{}(val); }}\n", indent, cb_name));
                }

                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::ProgressBar => {
                out.push_str(&format!("{}ProgressIndicator {{\n", indent));
                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!("{}    progress: root.{};\n", indent, prop_name));
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::RadioButton | WidgetType::ComboBox => {
                out.push_str(&format!("{}Button {{\n", indent));
                let txt = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());
                out.push_str(&format!("{}    text: \"{}\";\n", indent, txt));
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Rectangle => {
                out.push_str(&format!("{}Rectangle {{\n", indent));
                if let Some(ref bg) = node.properties.background_color {
                    out.push_str(&format!("{}    background: {};\n", indent, bg));
                }
                if let Some(ref bc) = node.properties.border_color {
                    out.push_str(&format!("{}    border-color: {};\n", indent, bc));
                }
                if let Some(bw) = node.properties.border_width {
                    out.push_str(&format!("{}    border-width: {}px;\n", indent, bw));
                }
                if let Some(cr) = node.properties.corner_radius {
                    out.push_str(&format!("{}    border-radius: {}px;\n", indent, cr));
                }
                if let Some(w) = get_width(node) {
                    out.push_str(&format!("{}    width: {}px;\n", indent, w));
                }
                if let Some(h) = get_height(node) {
                    out.push_str(&format!("{}    height: {}px;\n", indent, h));
                }
                for child in &node.children {
                    self.generate_slint_node(out, child, events, indent_level + 1);
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::CustomComponent => {
                let comp_name = node.properties.custom_type.as_deref().unwrap_or("CustomComponent");
                out.push_str(&format!("{}{} {{\n", indent, comp_name));
                for child in &node.children {
                    self.generate_slint_node(out, child, events, indent_level + 1);
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Image => {
                out.push_str(&format!("{}Image {{\n", indent));
                let img_path = node
                    .properties
                    .image_path
                    .as_deref()
                    .unwrap_or("assets/image.png");
                out.push_str(&format!("{}    source: @image-url(\"{}\");\n", indent, img_path));
                if let Some(w) = get_width(node) {
                    out.push_str(&format!("{}    width: {}px;\n", indent, w));
                }
                if let Some(h) = get_height(node) {
                    out.push_str(&format!("{}    height: {}px;\n", indent, h));
                }
                out.push_str(&format!("{}}}\n", indent));
            }
            _ => {
                out.push_str(&format!("{}Rectangle {{\n", indent));
                out.push_str(&format!("{}    background: #18181b;\n", indent));
                out.push_str(&format!("{}}}\n", indent));
            }
        }
    }

    fn generate_wiring_tokens(
        &self,
        state_fields: &[InferredField],
        events: &[BoundEvent],
    ) -> TokenStream {
        let prop_inits = state_fields.iter().map(|f| {
            let ident = make_ident(&to_snake_case(&f.name));
            let setter = make_ident(&format!("set_{}", to_snake_case(&f.name)));
            match f.field_type {
                StateType::String | StateType::OptionString => {
                    quote! {
                        window.#setter(state.borrow().#ident.clone().into());
                    }
                }
                StateType::Bool => {
                    quote! {
                        window.#setter(state.borrow().#ident);
                    }
                }
                StateType::F64 => {
                    quote! {
                        window.#setter(state.borrow().#ident as f32);
                    }
                }
                StateType::VecString => {
                    quote! {}
                }
            }
        });

        let mut unique_callbacks: BTreeMap<String, &BoundEvent> = BTreeMap::new();
        for ev in events {
            let cb_name = format!("on_{}", to_snake_case(&ev.handler_name));
            unique_callbacks.insert(cb_name, ev);
        }

        let cb_wirings = unique_callbacks.iter().map(|(cb_name, ev)| {
            let cb_setter = make_ident(cb_name);
            let msg_variant = make_ident(&ev.message_variant);

            match ev.payload_type {
                EventPayloadType::Unit => {
                    quote! {
                        {
                            let handler = handler.clone();
                            let state = state.clone();
                            window.#cb_setter(move || {
                                handler.borrow_mut().dispatch(&mut *state.borrow_mut(), UiMessage::#msg_variant);
                            });
                        }
                    }
                }
                EventPayloadType::String => {
                    quote! {
                        {
                            let handler = handler.clone();
                            let state = state.clone();
                            window.#cb_setter(move |val| {
                                handler.borrow_mut().dispatch(&mut *state.borrow_mut(), UiMessage::#msg_variant(val.to_string()));
                            });
                        }
                    }
                }
                EventPayloadType::Bool => {
                    quote! {
                        {
                            let handler = handler.clone();
                            let state = state.clone();
                            window.#cb_setter(move |val| {
                                handler.borrow_mut().dispatch(&mut *state.borrow_mut(), UiMessage::#msg_variant(val));
                            });
                        }
                    }
                }
                EventPayloadType::F64 => {
                    quote! {
                        {
                            let handler = handler.clone();
                            let state = state.clone();
                            window.#cb_setter(move |val| {
                                handler.borrow_mut().dispatch(&mut *state.borrow_mut(), UiMessage::#msg_variant(val as f64));
                            });
                        }
                    }
                }
            }
        });

        quote! {
            pub fn setup_ui<H: UiHandler + 'static>(
                window: &MainWindow,
                state: std::rc::Rc<std::cell::RefCell<AppState>>,
                handler: std::rc::Rc<std::cell::RefCell<H>>,
            ) {
                #(#prop_inits)*
                #(#cb_wirings)*
            }
        }
    }
}

impl Default for SlintPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeGenerator for SlintPlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Slint
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Slint,
            framework_name: "Slint".to_string(),
            version: "1.8".to_string(),
            language: "rust".to_string(),
            description: "Declarative GUI toolkit for native desktop and embedded applications with Slint markup.".to_string(),
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
        let slint_content = self.generate_slint_code(doc, state_fields, events);

        let app_state_tokens = generate_app_state_tokens(state_fields);
        let ui_message_tokens = generate_ui_message_tokens(events);
        let ui_handler_tokens = generate_ui_handler_tokens(events);
        let widget_ids_tokens = generate_widget_ids_tokens(doc);
        let wiring_tokens = self.generate_wiring_tokens(state_fields, events);

        let file_tokens = quote! {
            use serde::{Deserialize, Serialize};

            slint::include_modules!();

            #app_state_tokens
            #ui_message_tokens
            #ui_handler_tokens
            #widget_ids_tokens
            #wiring_tokens
        };

        let syntax_file: File = syn::parse2(file_tokens)
            .map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;
        let ui_generated_code = prettyplease::unparse(&syntax_file);

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

        let auxiliary_files = vec![GeneratedFile {
            filename: "ui_generated.slint".to_string(),
            content: slint_content,
            file_type: "slint".to_string(),
        }];

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated Slint 1.8 markup and host code ({} bytes)",
                ui_generated_code.len()
            ),
            widget_id: None,
        });

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.rs".to_string(),
            ui_generated_code,
            controller_filename: "controller.rs".to_string(),
            controller_code,
            auxiliary_files,
            diagnostics,
            target_framework: TargetFramework::Slint,
            framework_version: "1.8".to_string(),
        })
    }
}

impl SlintPlugin {
    pub fn reverse_parse_slint(code: &str) -> Result<WidgetNode, CodegenError> {
        let parser = SlintParser::new(code);
        let root_elem = parser.parse()?;
        let mut counter = 0;
        Ok(slint_element_to_widget_node(&root_elem, &mut counter))
    }

    pub fn patch_slint_document(
        doc: &mut RuxDocument,
        code: &str,
        patches: &mut Vec<PropertyPatch>,
    ) -> Result<(), CodegenError> {
        let parsed_tree = Self::reverse_parse_slint(code)?;
        Self::reconcile_slint_node(&mut doc.root, &parsed_tree, patches);
        Ok(())
    }

    pub fn modify_slint_source(
        slint_source: &str,
        target_token: &str,
        replacement: &str,
    ) -> Result<String, CodegenError> {
        if let Some(pos) = slint_source.find(target_token) {
            let mut result = slint_source.to_string();
            result.replace_range(pos..pos + target_token.len(), replacement);
            Ok(result)
        } else {
            Err(CodegenError::WidgetNotFound(format!(
                "Token '{}' not found in Slint source",
                target_token
            )))
        }
    }

    fn reconcile_slint_node(
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

        if let Some(ref new_bg) = parsed.properties.background_color {
            if target.properties.background_color.as_ref() != Some(new_bg) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "background_color".to_string(),
                    old_value: target.properties.background_color.clone(),
                    new_value: new_bg.clone(),
                });
                target.properties.background_color = Some(new_bg.clone());
            }
        }

        if let Some(ref new_bc) = parsed.properties.border_color {
            if target.properties.border_color.as_ref() != Some(new_bc) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "border_color".to_string(),
                    old_value: target.properties.border_color.clone(),
                    new_value: new_bc.clone(),
                });
                target.properties.border_color = Some(new_bc.clone());
            }
        }

        if let Some(bw) = parsed.properties.border_width {
            if target.properties.border_width != Some(bw) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "border_width".to_string(),
                    old_value: target.properties.border_width.map(|v| v.to_string()),
                    new_value: bw.to_string(),
                });
                target.properties.border_width = Some(bw);
            }
        }

        if let Some(cr) = parsed.properties.corner_radius {
            if target.properties.corner_radius != Some(cr) {
                patches.push(PropertyPatch {
                    widget_id: target.id.clone(),
                    property_name: "corner_radius".to_string(),
                    old_value: target.properties.corner_radius.map(|v| v.to_string()),
                    new_value: cr.to_string(),
                });
                target.properties.corner_radius = Some(cr);
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

        if target.children.is_empty() && !parsed.children.is_empty() {
            target.children = parsed.children.clone();
            patches.push(PropertyPatch {
                widget_id: target.id.clone(),
                property_name: "children".to_string(),
                old_value: None,
                new_value: format!("{} children", parsed.children.len()),
            });
        } else {
            let min_len = target.children.len().min(parsed.children.len());
            for i in 0..min_len {
                Self::reconcile_slint_node(&mut target.children[i], &parsed.children[i], patches);
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
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SlintElement {
    pub tag: String,
    pub properties: BTreeMap<String, String>,
    pub callbacks: BTreeMap<String, String>,
    pub children: Vec<SlintElement>,
}

pub struct SlintParser<'a> {
    chars: Vec<(usize, char)>,
    pos: usize,
    _phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a> SlintParser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            chars: input.char_indices().collect(),
            pos: 0,
            _phantom: std::marker::PhantomData,
        }
    }

    fn skip_whitespace_and_comments(&mut self) {
        while self.pos < self.chars.len() {
            let (_, c) = self.chars[self.pos];
            if c.is_whitespace() {
                self.pos += 1;
            } else if c == '/' && self.pos + 1 < self.chars.len() {
                let (_, next) = self.chars[self.pos + 1];
                if next == '/' {
                    self.pos += 2;
                    while self.pos < self.chars.len() && self.chars[self.pos].1 != '\n' {
                        self.pos += 1;
                    }
                } else if next == '*' {
                    self.pos += 2;
                    while self.pos + 1 < self.chars.len() {
                        if self.chars[self.pos].1 == '*' && self.chars[self.pos + 1].1 == '/' {
                            self.pos += 2;
                            break;
                        }
                        self.pos += 1;
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).map(|(_, c)| *c)
    }

    fn consume_char(&mut self) -> Option<char> {
        if self.pos < self.chars.len() {
            let (_, c) = self.chars[self.pos];
            self.pos += 1;
            Some(c)
        } else {
            None
        }
    }

    fn read_ident(&mut self) -> String {
        let mut ident = String::new();
        while let Some(c) = self.peek() {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                ident.push(c);
                self.pos += 1;
            } else {
                break;
            }
        }
        ident
    }

    pub fn parse(mut self) -> Result<SlintElement, CodegenError> {
        self.skip_whitespace_and_comments();
        while self.pos < self.chars.len() {
            self.skip_whitespace_and_comments();
            if self.pos >= self.chars.len() {
                break;
            }
            let start = self.pos;
            let word = self.read_ident();
            if word == "import" {
                while self.pos < self.chars.len() && self.chars[self.pos].1 != ';' {
                    self.pos += 1;
                }
                if self.pos < self.chars.len() {
                    self.pos += 1;
                }
            } else {
                self.pos = start;
                break;
            }
        }

        self.skip_whitespace_and_comments();
        self.parse_element()
    }

    fn parse_element(&mut self) -> Result<SlintElement, CodegenError> {
        self.skip_whitespace_and_comments();
        let mut tag = self.read_ident();

        if tag == "export" {
            self.skip_whitespace_and_comments();
            let next_word = self.read_ident();
            if next_word == "component" {
                self.skip_whitespace_and_comments();
                let comp_name = self.read_ident();
                self.skip_whitespace_and_comments();
                let peek_word = self.read_ident();
                if peek_word == "inherits" {
                    self.skip_whitespace_and_comments();
                    let _base = self.read_ident();
                }
                tag = comp_name;
            } else {
                tag = next_word;
            }
        } else if tag == "component" {
            self.skip_whitespace_and_comments();
            let comp_name = self.read_ident();
            self.skip_whitespace_and_comments();
            let peek_word = self.read_ident();
            if peek_word == "inherits" {
                self.skip_whitespace_and_comments();
                let _base = self.read_ident();
            }
            tag = comp_name;
        }

        self.skip_whitespace_and_comments();
        if self.consume_char() != Some('{') {
            return Err(CodegenError::SynParseError(format!(
                "Expected '{{' after element tag '{}'",
                tag
            )));
        }

        let mut properties = BTreeMap::new();
        let mut callbacks = BTreeMap::new();
        let mut children = Vec::new();

        loop {
            self.skip_whitespace_and_comments();
            if self.pos >= self.chars.len() {
                return Err(CodegenError::SynParseError(format!(
                    "Unclosed element block for '{}'",
                    tag
                )));
            }

            if self.peek() == Some('}') {
                self.pos += 1;
                break;
            }

            let word_start = self.pos;
            let word = self.read_ident();

            if word.is_empty() {
                self.pos += 1;
                continue;
            }

            if word == "callback" {
                self.skip_whitespace_and_comments();
                let cb_name = self.read_ident();
                while self.pos < self.chars.len() && self.chars[self.pos].1 != ';' {
                    self.pos += 1;
                }
                if self.pos < self.chars.len() {
                    self.pos += 1;
                }
                callbacks.insert(cb_name, String::new());
                continue;
            }

            if word == "in-out" || word == "in" || word == "out" || word == "property" {
                while self.pos < self.chars.len() && self.chars[self.pos].1 != ';' {
                    self.pos += 1;
                }
                if self.pos < self.chars.len() {
                    self.pos += 1;
                }
                continue;
            }

            self.skip_whitespace_and_comments();
            match self.peek() {
                Some('{') => {
                    self.pos = word_start;
                    let child = self.parse_element()?;
                    children.push(child);
                }
                Some('=') => {
                    self.pos += 1;
                    if self.peek() == Some('>') {
                        self.pos += 1;
                    }
                    self.skip_whitespace_and_comments();
                    let handler = if self.peek() == Some('{') {
                        self.pos += 1;
                        let mut depth = 1;
                        let mut h = String::new();
                        while self.pos < self.chars.len() {
                            let c = self.consume_char().unwrap();
                            if c == '{' {
                                depth += 1;
                            } else if c == '}' {
                                depth -= 1;
                                if depth == 0 {
                                    break;
                                }
                            }
                            h.push(c);
                        }
                        h
                    } else {
                        let mut h = String::new();
                        while self.pos < self.chars.len() && self.chars[self.pos].1 != ';' {
                            h.push(self.consume_char().unwrap());
                        }
                        if self.peek() == Some(';') {
                            self.pos += 1;
                        }
                        h
                    };
                    callbacks.insert(word, handler);
                }
                Some(':') => {
                    self.pos += 1;
                    self.skip_whitespace_and_comments();
                    let mut val = String::new();
                    while self.pos < self.chars.len()
                        && self.chars[self.pos].1 != ';'
                        && self.chars[self.pos].1 != '}'
                    {
                        val.push(self.consume_char().unwrap());
                    }
                    if self.peek() == Some(';') {
                        self.pos += 1;
                    }
                    properties.insert(word, val.trim().to_string());
                }
                Some('<') => {
                    self.pos += 1;
                    if self.peek() == Some('=') {
                        self.pos += 1;
                        if self.peek() == Some('>') {
                            self.pos += 1;
                        }
                    }
                    self.skip_whitespace_and_comments();
                    let mut val = String::new();
                    while self.pos < self.chars.len()
                        && self.chars[self.pos].1 != ';'
                        && self.chars[self.pos].1 != '}'
                    {
                        val.push(self.consume_char().unwrap());
                    }
                    if self.peek() == Some(';') {
                        self.pos += 1;
                    }
                    properties.insert(word, val.trim().to_string());
                }
                _ => {
                    self.pos += 1;
                }
            }
        }

        Ok(SlintElement {
            tag,
            properties,
            callbacks,
            children,
        })
    }
}

fn parse_px_or_number(s: &str) -> Option<f64> {
    let trimmed = s.trim();
    let num_part = trimmed.strip_suffix("px").unwrap_or(trimmed).trim();
    num_part.parse::<f64>().ok()
}

pub fn slint_element_to_widget_node(elem: &SlintElement, counter: &mut usize) -> WidgetNode {
    *counter += 1;
    let node_id = format!("{}_{}", elem.tag.to_lowercase(), counter);
    let mut properties = WidgetProperties::default();
    let mut bindings = WidgetBindings::default();
    let mut events = WidgetEvents::default();

    if let Some(text) = elem.properties.get("text") {
        let clean_text = text.trim();
        if clean_text.starts_with('"') && clean_text.ends_with('"') && clean_text.len() >= 2 {
            properties.text = Some(PropertyValue::Static(
                clean_text[1..clean_text.len() - 1].to_string(),
            ));
        } else if let Some(stripped) = clean_text.strip_prefix("root.") {
            bindings.value = Some(stripped.to_string());
        } else {
            properties.text = Some(PropertyValue::Binding(clean_text.to_string()));
        }
    }
    if let Some(source) = elem.properties.get("source").or_else(|| elem.properties.get("image_path")) {
        let clean_source = rux_ast::asset::normalize_image_path(source);
        properties.image_path = Some(clean_source);
    }
    if let Some(bg) = elem.properties.get("background") {
        properties.background_color = Some(bg.trim().to_string());
    }
    if let Some(bc) = elem.properties.get("border-color") {
        properties.border_color = Some(bc.trim().to_string());
    }
    if let Some(bw) = elem.properties.get("border-width") {
        properties.border_width = parse_px_or_number(bw);
    }
    if let Some(br) = elem.properties.get("border-radius") {
        properties.corner_radius = parse_px_or_number(br);
    }
    if let Some(val) = elem.properties.get("value") {
        if let Some(stripped) = val.strip_prefix("root.") {
            bindings.value = Some(stripped.to_string());
        }
    }
    if let Some(min) = elem.properties.get("minimum") {
        properties.min_value = min.trim().parse::<f64>().ok();
    }
    if let Some(max) = elem.properties.get("maximum") {
        properties.max_value = max.trim().parse::<f64>().ok();
    }
    if let Some(p) = elem.properties.get("progress") {
        if let Some(stripped) = p.strip_prefix("root.") {
            bindings.value = Some(stripped.to_string());
        }
    }
    if let Some(fs) = elem.properties.get("font-size") {
        properties.font_size = parse_px_or_number(fs);
    }
    if let Some(c) = elem.properties.get("color") {
        properties.text_color = Some(c.trim().to_string());
    }

    if elem.callbacks.contains_key("clicked") {
        events.on_click = Some(EventHandler {
            handler_name: "on_click".to_string(),
            message: None,
            navigate_to: None,
        });
    }

    let mut layout = None;
    let width_opt = elem
        .properties
        .get("width")
        .and_then(|w| parse_px_or_number(w));
    let height_opt = elem
        .properties
        .get("height")
        .and_then(|h| parse_px_or_number(h));
    let spacing_opt = elem
        .properties
        .get("spacing")
        .and_then(|s| parse_px_or_number(s));

    if width_opt.is_some() || height_opt.is_some() || spacing_opt.is_some() {
        let mut widget_layout = WidgetLayout::default();
        if let Some(w) = width_opt {
            widget_layout.dimensions.width = Size::Fixed(w);
        }
        if let Some(h) = height_opt {
            widget_layout.dimensions.height = Size::Fixed(h);
        }
        if let Some(sp) = spacing_opt {
            widget_layout.container = Some(ContainerLayout::Flex(FlexContainer {
                direction: FlexDirection::Column,
                gap: sp,
                ..Default::default()
            }));
        }
        layout = Some(widget_layout);
    }

    let widget_type = match elem.tag.as_str() {
        "VerticalBox" | "Window" | "MainWindow" => WidgetType::VBox,
        "HorizontalBox" => WidgetType::HBox,
        "ScrollView" => WidgetType::ScrollPane,
        "Button" => WidgetType::Button,
        "Text" => WidgetType::Label,
        "LineEdit" => WidgetType::TextInput,
        "CheckBox" => WidgetType::Checkbox,
        "Slider" => WidgetType::Slider,
        "ProgressIndicator" => WidgetType::ProgressBar,
        "Rectangle" => WidgetType::Rectangle,
        "Image" => WidgetType::Image,
        other => {
            properties.custom_type = Some(other.to_string());
            WidgetType::GenericWidget
        }
    };

    let children = elem
        .children
        .iter()
        .map(|c| slint_element_to_widget_node(c, counter))
        .collect();

    WidgetNode {
        id: node_id,
        widget_type,
        slot: None,
        properties,
        layout,
        events,
        bindings,
        animations: Vec::new(),
        children,
    }
}
