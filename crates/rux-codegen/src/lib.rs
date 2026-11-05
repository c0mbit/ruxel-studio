pub mod controller_merge;
pub mod error;
pub mod events;
pub mod generator;
pub mod go_fyne;
pub mod handler;
pub mod plugin;
pub mod plugins;
pub mod reverse_parser;
pub mod router;
pub mod sanitizer;
pub mod state;
pub mod view;

pub use controller_merge::{generate_initial_controller, merge_controller};
pub use error::CodegenError;
pub use events::{BoundEvent, EventCollector, EventPayloadType};
pub use generator::{CodeGenerator, CodegenDiagnostic, CodegenResult};
pub use go_fyne::{generate_go_initial_controller, generate_go_ui_code, merge_go_controller};
pub use plugin::{
    CodeGenerator as CodeGeneratorPlugin, CodegenOptions, CodegenOutput, FrameworkProfile,
    GeneratedFile, PluginRegistry, TargetFramework,
};
pub use reverse_parser::{PropertyPatch, ReverseParser, ReverseParserReport};
pub use router::RouterGenerator;
pub use state::{InferredField, StateInferenceEngine, StateType};
pub use view::generate_localization_files;
