use std::collections::BTreeMap;
use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::layout::{ContainerLayout, Size};
use rux_ast::widget::{WidgetNode, WidgetType};
use syn::File;

use crate::controller_merge::{generate_initial_controller, merge_controller};
use crate::error::CodegenError;
use crate::events::{generate_ui_message_tokens, BoundEvent, EventPayloadType};
use crate::generator::CodegenDiagnostic;
use crate::handler::generate_ui_handler_tokens;
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, GeneratedFile, TargetFramework,
};
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
                    .unwrap_or_else(|| node.id.as_str());
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
                        .unwrap_or_else(|| node.id.as_str());
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
                    .unwrap_or_else(|| node.id.as_str());
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
                    .unwrap_or_else(|| node.id.as_str());
                out.push_str(&format!("{}    text: \"{}\";\n", indent, txt));
                out.push_str(&format!("{}}}\n", indent));
            }
            WidgetType::Canvas3D | _ => {
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
                        diagnostics.push(CodegenDiagnostic {
                            level: "warning".to_string(),
                            message: format!("Failed to merge existing controller: {}. Falling back to scaffold.", err),
                            widget_id: None,
                        });
                        generate_initial_controller(events)
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
