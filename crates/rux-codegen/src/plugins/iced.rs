use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::layout::{ContainerLayout, Size};
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

fn get_gap(node: &WidgetNode) -> f32 {
    if let Some(ref layout) = node.layout {
        if let Some(ContainerLayout::Flex(ref flex)) = layout.container {
            return flex.gap as f32;
        }
    }
    8.0
}

fn get_width(node: &WidgetNode) -> Option<f32> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(w) = layout.dimensions.width {
            return Some(w as f32);
        }
    }
    None
}

fn get_height(node: &WidgetNode) -> Option<f32> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(h) = layout.dimensions.height {
            return Some(h as f32);
        }
    }
    None
}

fn get_padding(node: &WidgetNode) -> Option<[f32; 4]> {
    if let Some(ref layout) = node.layout {
        let p = &layout.spacing.padding;
        if p.top > 0.0 || p.right > 0.0 || p.bottom > 0.0 || p.left > 0.0 {
            return Some([p.top as f32, p.right as f32, p.bottom as f32, p.left as f32]);
        }
    }
    None
}

pub struct IcedPlugin;

impl IcedPlugin {
    pub fn new() -> Self {
        Self
    }

    fn generate_widget_expr(&self, node: &WidgetNode, events: &[BoundEvent]) -> TokenStream {
        let child_exprs: Vec<TokenStream> = node
            .children
            .iter()
            .map(|child| self.generate_widget_expr(child, events))
            .collect();

        let base_expr = match node.widget_type {
            WidgetType::VBox => {
                let spacing = get_gap(node);
                quote! {
                    column![
                        #(#child_exprs.into()),*
                    ]
                    .spacing(#spacing)
                }
            }
            WidgetType::HBox => {
                let spacing = get_gap(node);
                quote! {
                    row![
                        #(#child_exprs.into()),*
                    ]
                    .spacing(#spacing)
                }
            }
            WidgetType::ScrollPane => {
                quote! {
                    scrollable(
                        column![
                            #(#child_exprs.into()),*
                        ]
                        .spacing(8.0)
                    )
                }
            }
            WidgetType::AnchorPane | WidgetType::BorderPane | WidgetType::Grid | WidgetType::TabPane | WidgetType::SplitPane | WidgetType::Accordion => {
                quote! {
                    container(
                        column![
                            #(#child_exprs.into()),*
                        ]
                        .spacing(8.0)
                    )
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

                let btn_core = if let Some(target_screen) = nav_target {
                    let screen_ident = make_ident(&to_pascal_case(target_screen));
                    quote! {
                        button(text(#btn_text_expr)).on_press(UiMessage::Navigate(AppScreen::#screen_ident))
                    }
                } else if let Some(ev) = on_press_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        button(text(#btn_text_expr)).on_press(UiMessage::#msg_variant)
                    }
                } else {
                    quote! {
                        button(text(#btn_text_expr))
                    }
                };

                if let Some(aria) = &node.properties.aria_label {
                    quote!(#btn_core.explain(#aria))
                } else {
                    btn_core
                }
            }
            WidgetType::Label => {
                let lbl_core = if let Some(binding) = &node.bindings.value {
                    let field_ident = make_ident(&to_snake_case(binding));
                    quote! {
                        text(format!("{}", state.#field_ident))
                    }
                } else if let Some(key) = &node.properties.text_key {
                    quote! {
                        text(t!(#key))
                    }
                } else {
                    let lbl_text = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or_else(|| node.id.as_str());
                    quote! {
                        text(#lbl_text)
                    }
                };

                if let Some(aria) = &node.properties.aria_label {
                    quote!(#lbl_core.explain(#aria))
                } else {
                    lbl_core
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
                    image(image::Handle::from_memory(include_bytes!(#img_path)))
                }
            }
            WidgetType::TextInput => {
                let placeholder = node
                    .properties
                    .placeholder
                    .as_deref()
                    .or(node.properties.text.as_deref())
                    .unwrap_or("");

                let val_expr = if let Some(binding) = &node.bindings.value {
                    let field_ident = make_ident(&to_snake_case(binding));
                    quote!(&state.#field_ident)
                } else {
                    let fallback_ident = make_ident(&to_snake_case(&node.id));
                    quote!(&state.#fallback_ident)
                };

                let on_input_handler = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_input")
                });

                if let Some(ev) = on_input_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        text_input(#placeholder, #val_expr).on_input(UiMessage::#msg_variant)
                    }
                } else {
                    quote! {
                        text_input(#placeholder, #val_expr)
                    }
                }
            }
            WidgetType::Checkbox => {
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or_else(|| node.id.as_str());

                let val_expr = if let Some(binding) = &node.bindings.value {
                    let field_ident = make_ident(&to_snake_case(binding));
                    quote!(state.#field_ident)
                } else {
                    let fallback_ident = make_ident(&to_snake_case(&node.id));
                    quote!(state.#fallback_ident)
                };

                let on_toggle_handler = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_click")
                });

                if let Some(ev) = on_toggle_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        checkbox(#label, #val_expr).on_toggle(UiMessage::#msg_variant)
                    }
                } else {
                    quote! {
                        checkbox(#label, #val_expr)
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
                        radio(#label, state.#field_ident, Some(state.#field_ident), |_| UiMessage::#msg_variant)
                    }
                } else {
                    quote! {
                        radio(#label, state.#field_ident, Some(state.#field_ident), |_| UiMessage::#field_ident)
                    }
                }
            }
            WidgetType::Slider => {
                let min = node.properties.min_value.unwrap_or(0.0) as f32;
                let max = node.properties.max_value.unwrap_or(100.0) as f32;

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
                        slider(#min..=#max, state.#field_ident as f32, |val| UiMessage::#msg_variant(val as f64))
                    }
                } else {
                    quote! {
                        slider(#min..=#max, state.#field_ident as f32, |_| UiMessage::#field_ident)
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
                    progress_bar(0.0..=1.0, state.#field_ident as f32)
                }
            }
            WidgetType::ComboBox => {
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

                if let Some(ev) = on_change_handler {
                    let msg_variant = make_ident(&ev.message_variant);
                    quote! {
                        pick_list(&state.#items_ident[..], state.#selected_ident.clone(), UiMessage::#msg_variant)
                    }
                } else {
                    quote! {
                        pick_list(&state.#items_ident[..], state.#selected_ident.clone(), UiMessage::#selected_ident)
                    }
                }
            }
            WidgetType::DataGrid => {
                let table_id = &node.id;
                let header_title = node.properties.text.as_deref().unwrap_or(table_id.as_str());
                let row_height = node.properties.row_height.unwrap_or(28.0) as f32;
                quote! {
                    container(
                        scrollable(
                            column![
                                row![
                                    text(#header_title).size(13),
                                    text("[Virtualized DataGrid: 100,000 Rows]").size(11)
                                ].spacing(8.0),
                                container(
                                    column![
                                        row![text("ID").size(11), text("Name").size(11), text("Status").size(11)].spacing(12.0),
                                        row![text("#001").size(11), text("Alpha Record").size(11), text("Active").size(11)].spacing(12.0),
                                        row![text("#002").size(11), text("Beta Record").size(11), text("Active").size(11)].spacing(12.0)
                                    ].spacing(4.0)
                                ).padding(6.0)
                            ].spacing(6.0)
                        )
                    ).width(Length::Fill).height(Length::Fixed(#row_height * 6.0))
                }
            }
            WidgetType::Chart | WidgetType::LineChart | WidgetType::BarChart | WidgetType::PieChart | WidgetType::ScatterChart => {
                let chart_title = node.properties.text.as_deref().unwrap_or("Analytical Chart");
                quote! {
                    container(
                        column![
                            text(#chart_title).size(13),
                            container(
                                text("Chart Series [ARR, Margin]")
                            )
                            .width(Length::Fill)
                            .height(Length::Fixed(180.0))
                            .center_x(Length::Fill)
                            .center_y(Length::Fill)
                        ].spacing(6.0)
                    ).padding(8.0)
                }
            }
            WidgetType::TreeView => {
                let header_text = node.properties.text.as_deref().unwrap_or_else(|| node.id.as_str());
                quote! {
                    column![
                        row![text("▼"), text(#header_text).size(13)].spacing(4.0),
                        container(
                            column![
                                #(#child_exprs.into()),*
                            ].spacing(4.0)
                        ).padding([0.0, 0.0, 0.0, 16.0])
                    ].spacing(4.0)
                }
            }
            WidgetType::Viewport3D | WidgetType::Canvas3D => {
                let model_path = node.properties.model_3d_path.as_deref().unwrap_or("assets/model.gltf");
                quote! {
                    container(
                        column![
                            text(format!("3D Viewport [{}]", #model_path)).size(12),
                            text("Camera FOV: 60° | Shading: PBR").size(10)
                        ].spacing(4.0)
                    ).width(Length::Fill).height(Length::Fixed(200.0)).center_x(Length::Fill).center_y(Length::Fill)
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
                        container(
                            image(image::Handle::from_memory(include_bytes!(#img_path)))
                        )
                    }
                } else {
                    let node_id = node.id.as_str();
                    quote! {
                        container(text(#node_id)).width(Length::Fill).height(Length::Fill)
                    }
                }
            }
        };

        let mut modifiers = Vec::new();

        if let Some(w) = get_width(node) {
            modifiers.push(quote!(.width(Length::Fixed(#w))));
        }

        if let Some(h) = get_height(node) {
            modifiers.push(quote!(.height(Length::Fixed(#h))));
        }

        if let Some([p_top, p_right, p_bottom, p_left]) = get_padding(node) {
            modifiers.push(quote!(.padding([#p_top, #p_right, #p_bottom, #p_left])));
        }

        quote! {
            #base_expr #(#modifiers)*
        }
    }
}

impl CodeGenerator for IcedPlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Iced
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Iced,
            framework_name: "Iced".to_string(),
            version: "0.13".to_string(),
            language: "rust".to_string(),
            description: "Cross-platform GUI library for Rust focused on simplicity and type-safety with Elm architecture.".to_string(),
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

        let root_expr = self.generate_widget_expr(&doc.root, events);

        let view_tokens = quote! {
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, checkbox, column, container, pick_list, progress_bar, radio, row, scrollable, slider, text, text_input};
                use iced::{Alignment, Length};

                #root_expr.into()
            }
        };

        let file_tokens = quote! {
            use serde::{Deserialize, Serialize};

            #app_state_tokens
            #ui_message_tokens
            #ui_handler_tokens
            #widget_ids_tokens
            #view_tokens
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
                "Successfully generated Iced 0.13 UI ({} bytes) and controller ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        let theme_file = crate::view::generate_theme_file(doc, TargetFramework::Iced);
        let mut auxiliary_files = vec![theme_file];
        let mut i18n_files = crate::view::generate_localization_files(doc);
        auxiliary_files.append(&mut i18n_files);

        let default_proj = rux_ast::project::RuxProject::new(&doc.metadata.app_name, "main");
        let router_file = crate::router::RouterGenerator::generate_router_file(
            &default_proj,
            TargetFramework::Iced,
        );
        auxiliary_files.push(router_file);

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.rs".to_string(),
            ui_generated_code,
            controller_filename: "controller.rs".to_string(),
            controller_code,
            auxiliary_files,
            diagnostics,
            target_framework: TargetFramework::Iced,
            framework_version: "0.13".to_string(),
        })
    }
}
