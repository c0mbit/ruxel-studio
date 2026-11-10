use std::collections::HashMap;
use rux_ast::document::RuxDocument;
use serde::{Deserialize, Serialize};

use crate::error::CodegenError;
use crate::events::{BoundEvent, EventCollector};
use crate::generator::CodegenDiagnostic;
use crate::state::{InferredField, StateInferenceEngine};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetFramework {
    Iced,
    Egui,
    Slint,
    Dioxus,
    Fyne,
    Flet,
}

impl TargetFramework {
    pub const ALL: &'static [TargetFramework] = &[
        TargetFramework::Iced,
        TargetFramework::Egui,
        TargetFramework::Slint,
        TargetFramework::Dioxus,
        TargetFramework::Fyne,
        TargetFramework::Flet,
    ];

    pub fn id(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "iced",
            TargetFramework::Egui => "egui",
            TargetFramework::Slint => "slint",
            TargetFramework::Dioxus => "dioxus",
            TargetFramework::Fyne => "fyne",
            TargetFramework::Flet => "flet",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "Iced",
            TargetFramework::Egui => "egui",
            TargetFramework::Slint => "Slint",
            TargetFramework::Dioxus => "Dioxus",
            TargetFramework::Fyne => "Go (Fyne)",
            TargetFramework::Flet => "Python (Flet)",
        }
    }

    pub fn version(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "0.13",
            TargetFramework::Egui => "0.29",
            TargetFramework::Slint => "1.8",
            TargetFramework::Dioxus => "0.5",
            TargetFramework::Fyne => "v2.5",
            TargetFramework::Flet => "0.24",
        }
    }

    pub fn language(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "rust",
            TargetFramework::Egui => "rust",
            TargetFramework::Slint => "rust",
            TargetFramework::Dioxus => "rust",
            TargetFramework::Fyne => "go",
            TargetFramework::Flet => "python",
        }
    }

    pub fn default_ui_filename(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "ui_generated.rs",
            TargetFramework::Egui => "ui_generated.rs",
            TargetFramework::Slint => "ui_generated.rs",
            TargetFramework::Dioxus => "ui_generated.rs",
            TargetFramework::Fyne => "ui_generated.go",
            TargetFramework::Flet => "ui_generated.py",
        }
    }

    pub fn default_controller_filename(&self) -> &'static str {
        match self {
            TargetFramework::Iced => "controller.rs",
            TargetFramework::Egui => "controller.rs",
            TargetFramework::Slint => "controller.rs",
            TargetFramework::Dioxus => "controller.rs",
            TargetFramework::Fyne => "controller.go",
            TargetFramework::Flet => "controller.py",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<TargetFramework> {
        let normalized = s.trim().to_lowercase();
        match normalized.as_str() {
            "iced" => Some(TargetFramework::Iced),
            "egui" => Some(TargetFramework::Egui),
            "slint" => Some(TargetFramework::Slint),
            "dioxus" => Some(TargetFramework::Dioxus),
            "fyne" | "go" | "go-fyne" | "go_fyne" => Some(TargetFramework::Fyne),
            "flet" | "python" | "python-flet" | "python_flet" => Some(TargetFramework::Flet),
            "rust" => Some(TargetFramework::Iced),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkProfile {
    pub target_framework: TargetFramework,
    pub framework_name: String,
    pub version: String,
    pub language: String,
    pub description: String,
    pub ui_filename: String,
    pub controller_filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeneratedFile {
    pub filename: String,
    pub content: String,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodegenOptions {
    pub target_framework: Option<TargetFramework>,
    pub custom_ui_filename: Option<String>,
    pub custom_controller_filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_ui_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodegenOutput {
    pub ui_generated_filename: String,
    pub ui_generated_code: String,
    pub controller_filename: String,
    pub controller_code: String,
    pub auxiliary_files: Vec<GeneratedFile>,
    pub diagnostics: Vec<CodegenDiagnostic>,
    pub target_framework: TargetFramework,
    pub framework_version: String,
}

pub trait CodeGenerator: Send + Sync {
    fn target_framework(&self) -> TargetFramework;
    fn profile(&self) -> FrameworkProfile;
    fn generate(
        &self,
        doc: &RuxDocument,
        state_fields: &[InferredField],
        events: &[BoundEvent],
        existing_controller: Option<&str>,
        options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError>;
}

pub struct PluginRegistry {
    plugins: HashMap<TargetFramework, Box<dyn CodeGenerator>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            plugins: HashMap::new(),
        };
        registry.register_defaults();
        registry
    }

    fn register_defaults(&mut self) {
        use crate::plugins::{
            dioxus::DioxusPlugin, egui::EguiPlugin, flet::FletPlugin, fyne::FynePlugin,
            iced::IcedPlugin, slint::SlintPlugin,
        };

        self.register(Box::new(IcedPlugin::new()));
        self.register(Box::new(EguiPlugin::new()));
        self.register(Box::new(SlintPlugin::new()));
        self.register(Box::new(DioxusPlugin::new()));
        self.register(Box::new(FynePlugin::new()));
        self.register(Box::new(FletPlugin::new()));
    }

    pub fn register(&mut self, plugin: Box<dyn CodeGenerator>) {
        self.plugins.insert(plugin.target_framework(), plugin);
    }

    pub fn get(&self, framework: TargetFramework) -> Option<&dyn CodeGenerator> {
        self.plugins.get(&framework).map(|p| p.as_ref())
    }

    pub fn available_profiles(&self) -> Vec<FrameworkProfile> {
        TargetFramework::ALL
            .iter()
            .filter_map(|fw| self.get(*fw).map(|p| p.profile()))
            .collect()
    }

    pub fn generate(
        &self,
        framework: TargetFramework,
        doc: &RuxDocument,
        existing_controller: Option<&str>,
        options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError> {
        let plugin = self.get(framework).ok_or_else(|| {
            CodegenError::AstError(format!(
                "No plugin registered for target framework {:?}",
                framework
            ))
        })?;

        let state_fields = StateInferenceEngine::infer_document(doc);
        let events = EventCollector::collect_document(doc);

        plugin.generate(doc, &state_fields, &events, existing_controller, options)
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::new()
    }
}

