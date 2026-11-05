use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use serde::{Deserialize, Serialize};
use syn::File;

use crate::controller_merge::{generate_initial_controller, merge_controller};
use crate::error::CodegenError;
use crate::events::{generate_ui_message_tokens, EventCollector};
use crate::go_fyne::{generate_go_initial_controller, generate_go_ui_code, merge_go_controller};
use crate::handler::generate_ui_handler_tokens;
use crate::plugin::{CodegenOptions, CodegenOutput, PluginRegistry, TargetFramework};
use crate::state::{generate_app_state_tokens, StateInferenceEngine};
use crate::view::{generate_view_builder_tokens, generate_widget_ids_tokens};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodegenDiagnostic {
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub widget_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodegenResult {
    pub ui_generated_code: String,
    pub controller_code: String,
    pub diagnostics: Vec<CodegenDiagnostic>,
}

pub struct CodeGenerator;

impl CodeGenerator {
    pub fn generate_ui_tokens(doc: &RuxDocument) -> TokenStream {
        let fields = StateInferenceEngine::infer_document(doc);
        let events = EventCollector::collect_document(doc);

        let app_state_tokens = generate_app_state_tokens(&fields);
        let ui_message_tokens = generate_ui_message_tokens(&events);
        let ui_handler_tokens = generate_ui_handler_tokens(&events);
        let widget_ids_tokens = generate_widget_ids_tokens(doc);
        let view_builder_tokens = generate_view_builder_tokens(doc);

        quote! {
            #app_state_tokens
            #ui_message_tokens
            #ui_handler_tokens
            #widget_ids_tokens
            #view_builder_tokens
        }
    }

    pub fn generate_ui_code(doc: &RuxDocument) -> Result<String, CodegenError> {
        let tokens = Self::generate_ui_tokens(doc);
        let file: File = syn::parse2(tokens)
            .map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;
        Ok(prettyplease::unparse(&file))
    }

    pub fn generate_all(
        doc: &RuxDocument,
        existing_controller: Option<&str>,
    ) -> Result<CodegenResult, CodegenError> {
        let mut diagnostics: Vec<CodegenDiagnostic> = Vec::new();

        let ui_generated_code = Self::generate_ui_code(doc)?;

        let events = EventCollector::collect_document(doc);
        let controller_code = match existing_controller {
            Some(existing) if !existing.trim().is_empty() => {
                match merge_controller(existing, &events) {
                    Ok(merged) => merged,
                    Err(err) => {
                        diagnostics.push(CodegenDiagnostic {
                            level: "warning".to_string(),
                            message: format!("Failed to merge existing controller: {}. Falling back to scaffold.", err),
                            widget_id: None,
                        });
                        generate_initial_controller(&events)
                    }
                }
            }
            _ => generate_initial_controller(&events),
        };

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated ui_generated.rs ({} bytes) and controller.rs ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        Ok(CodegenResult {
            ui_generated_code,
            controller_code,
            diagnostics,
        })
    }

    pub fn generate_all_go(
        doc: &RuxDocument,
        existing_controller: Option<&str>,
    ) -> Result<CodegenResult, CodegenError> {
        let mut diagnostics: Vec<CodegenDiagnostic> = Vec::new();

        let ui_generated_code = generate_go_ui_code(doc)?;

        let events = EventCollector::collect_document(doc);
        let controller_code = match existing_controller {
            Some(existing) if !existing.trim().is_empty() => {
                match merge_go_controller(existing, &events) {
                    Ok(merged) => merged,
                    Err(err) => {
                        diagnostics.push(CodegenDiagnostic {
                            level: "warning".to_string(),
                            message: format!("Failed to merge existing Go controller: {}. Falling back to scaffold.", err),
                            widget_id: None,
                        });
                        generate_go_initial_controller(&events)
                    }
                }
            }
            _ => generate_go_initial_controller(&events),
        };

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated ui_generated.go ({} bytes) and controller.go ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        Ok(CodegenResult {
            ui_generated_code,
            controller_code,
            diagnostics,
        })
    }

    pub fn generate_for_framework(
        doc: &RuxDocument,
        framework: TargetFramework,
        existing_controller: Option<&str>,
        options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError> {
        let registry = PluginRegistry::new();
        registry.generate(framework, doc, existing_controller, options)
    }
}
