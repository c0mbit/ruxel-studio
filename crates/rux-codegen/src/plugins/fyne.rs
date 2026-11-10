use rux_ast::document::RuxDocument;

use crate::error::CodegenError;
use crate::events::BoundEvent;
use crate::generator::CodegenDiagnostic;
use crate::go_fyne::{
    generate_go_initial_controller, generate_go_ui_code, merge_go_controller,
};
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, TargetFramework,
};
use crate::state::InferredField;

pub struct FynePlugin;

impl FynePlugin {
    pub fn new() -> Self {
        Self
    }
}

impl Default for FynePlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeGenerator for FynePlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Fyne
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Fyne,
            framework_name: "Go Fyne".to_string(),
            version: "v2.5".to_string(),
            language: "go".to_string(),
            description: "Cross-platform GUI in Go based on Material Design with layout containers and widgets.".to_string(),
            ui_filename: "ui_generated.go".to_string(),
            controller_filename: "controller.go".to_string(),
        }
    }

    fn generate(
        &self,
        doc: &RuxDocument,
        _state_fields: &[InferredField],
        events: &[BoundEvent],
        existing_controller: Option<&str>,
        _options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError> {
        let ui_generated_code = generate_go_ui_code(doc)?;

        let mut diagnostics = Vec::new();
        let controller_code = match existing_controller {
            Some(existing) if !existing.trim().is_empty() => {
                match merge_go_controller(existing, events) {
                    Ok(merged) => merged,
                    Err(err) => {
                        diagnostics.push(CodegenDiagnostic {
                            level: "warning".to_string(),
                            message: format!("Failed to merge existing Go controller: {}. Falling back to scaffold.", err),
                            widget_id: None,
                        });
                        generate_go_initial_controller(events)
                    }
                }
            }
            _ => generate_go_initial_controller(events),
        };

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated Go Fyne v2.5 UI ({} bytes) and controller ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        let theme_file = crate::view::generate_theme_file(doc, TargetFramework::Fyne);
        let mut auxiliary_files = vec![theme_file];
        let mut i18n_files = crate::view::generate_localization_files(doc);
        auxiliary_files.append(&mut i18n_files);

        let default_proj = rux_ast::project::RuxProject::new(&doc.metadata.app_name, "main");
        let router_file = crate::router::RouterGenerator::generate_router_file(
            &default_proj,
            TargetFramework::Fyne,
        );
        auxiliary_files.push(router_file);

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.go".to_string(),
            ui_generated_code,
            controller_filename: "controller.go".to_string(),
            controller_code,
            auxiliary_files,
            diagnostics,
            target_framework: TargetFramework::Fyne,
            framework_version: "v2.5".to_string(),
        })
    }
}

