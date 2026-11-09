use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
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
use crate::sanitizer::{make_ident, to_pascal_case, to_snake_case};
use crate::state::{generate_app_state_tokens, InferredField};
use crate::view::generate_widget_ids_tokens;

pub struct EguiPlugin;

impl EguiPlugin {
    pub fn new() -> Self {
        Self
    }

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
                        .unwrap_or_else(|| node.id.as_str());
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

                let btn_response = if let Some(target_screen) = nav_target {
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
                };

                btn_response
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
                        .unwrap_or_else(|| node.id.as_str());
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
                    .unwrap_or_else(|| node.id.as_str());

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
                    .unwrap_or_else(|| node.id.as_str());

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
                let header_text = node.properties.text.as_deref().unwrap_or_else(|| node.id.as_str());
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
