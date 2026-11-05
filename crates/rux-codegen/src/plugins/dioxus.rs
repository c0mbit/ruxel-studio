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
                    .unwrap_or_else(|| node.id.as_str());

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
                        .unwrap_or_else(|| node.id.as_str());
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
                    .unwrap_or_else(|| node.id.as_str());

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
                    .unwrap_or_else(|| node.id.as_str());

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
            WidgetType::Canvas3D | _ => {
                quote! {
                    div {}
                }
            }
        }
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
            pub fn AppUi<H: UiHandler + Clone + 'static>(
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
