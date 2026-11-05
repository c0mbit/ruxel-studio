use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    EventHandler, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType,
};
use rux_codegen::{
    generate_initial_controller, merge_controller, BoundEvent, CodeGenerator, CodegenOptions,
    EventCollector, EventPayloadType, PluginRegistry, StateInferenceEngine, StateType,
    TargetFramework,
};

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

fn create_minimal_doc(root: WidgetNode) -> RuxDocument {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let mut doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");
    doc.root = root;
    doc
}

#[test]
fn test_state_inference_explicit_bindings() {
    let mut root = create_test_node("root", WidgetType::VBox);

    let mut input = create_test_node("user_input", WidgetType::TextInput);
    input.bindings.value = Some("app_state.username".to_string());
    input.properties.text = Some("alex".to_string());

    let mut chk = create_test_node("chk_active", WidgetType::Checkbox);
    chk.bindings.value = Some("app_state.is_active".to_string());
    chk.properties.checked = Some(true);

    let mut sld = create_test_node("sld_volume", WidgetType::Slider);
    sld.bindings.value = Some("app_state.volume".to_string());
    sld.properties.current_value = Some(75.5);

    let mut tree = create_test_node("tree_files", WidgetType::TreeView);
    tree.bindings.items = Some("app_state.file_list".to_string());
    tree.bindings.selected = Some("app_state.selected_file".to_string());

    root.children.push(input);
    root.children.push(chk);
    root.children.push(sld);
    root.children.push(tree);

    let doc = create_minimal_doc(root);
    let fields = StateInferenceEngine::infer_document(&doc);

    assert_eq!(fields.len(), 5);

    assert_eq!(fields[0].name, "username");
    assert_eq!(fields[0].field_type, StateType::String);

    assert_eq!(fields[1].name, "is_active");
    assert_eq!(fields[1].field_type, StateType::Bool);

    assert_eq!(fields[2].name, "volume");
    assert_eq!(fields[2].field_type, StateType::F64);

    assert_eq!(fields[3].name, "file_list");
    assert_eq!(fields[3].field_type, StateType::VecString);

    assert_eq!(fields[4].name, "selected_file");
    assert_eq!(fields[4].field_type, StateType::OptionString);
}

#[test]
fn test_state_inference_implicit_controls() {
    let mut root = create_test_node("root", WidgetType::VBox);
    root.children.push(create_test_node("email_field", WidgetType::TextInput));
    root.children.push(create_test_node("remember_me", WidgetType::Checkbox));
    root.children.push(create_test_node("brightness", WidgetType::Slider));
    root.children.push(create_test_node("country_select", WidgetType::ComboBox));
    root.children.push(create_test_node("data_grid", WidgetType::TableView));

    let doc = create_minimal_doc(root);
    let fields = StateInferenceEngine::infer_document(&doc);

    assert_eq!(fields.len(), 5);
    assert_eq!(fields[0].name, "email_field");
    assert_eq!(fields[0].field_type, StateType::String);
    assert_eq!(fields[1].name, "remember_me");
    assert_eq!(fields[1].field_type, StateType::Bool);
    assert_eq!(fields[2].name, "brightness");
    assert_eq!(fields[2].field_type, StateType::F64);
    assert_eq!(fields[3].name, "country_select");
    assert_eq!(fields[3].field_type, StateType::OptionString);
    assert_eq!(fields[4].name, "data_grid");
    assert_eq!(fields[4].field_type, StateType::VecString);
}

#[test]
fn test_event_collection_and_payload_typing() {
    let mut root = create_test_node("root", WidgetType::VBox);

    let mut btn = create_test_node("btn_submit", WidgetType::Button);
    btn.events.on_click = Some(EventHandler {
        handler_name: "on_submit_click".to_string(),
        message: Some("SubmitForm".to_string()),
        navigate_to: None,
    });

    let mut input = create_test_node("txt_search", WidgetType::TextInput);
    input.events.on_change = Some(EventHandler {
        handler_name: "on_query_change".to_string(),
        message: Some("QueryChanged".to_string()),
        navigate_to: None,
    });

    let mut chk = create_test_node("chk_agree", WidgetType::Checkbox);
    chk.events.on_change = Some(EventHandler {
        handler_name: "on_agree_change".to_string(),
        message: Some("AgreeToggled".to_string()),
        navigate_to: None,
    });

    let mut sld = create_test_node("sld_zoom", WidgetType::Slider);
    sld.events.on_change = Some(EventHandler {
        handler_name: "on_zoom_change".to_string(),
        message: Some("ZoomChanged".to_string()),
        navigate_to: None,
    });

    root.children.push(btn);
    root.children.push(input);
    root.children.push(chk);
    root.children.push(sld);

    let doc = create_minimal_doc(root);
    let events = EventCollector::collect_document(&doc);

    assert_eq!(events.len(), 4);

    assert_eq!(events[0].message_variant, "SubmitForm");
    assert_eq!(events[0].handler_name, "on_submit_click");
    assert_eq!(events[0].payload_type, EventPayloadType::Unit);

    assert_eq!(events[1].message_variant, "QueryChanged");
    assert_eq!(events[1].handler_name, "on_query_change");
    assert_eq!(events[1].payload_type, EventPayloadType::String);

    assert_eq!(events[2].message_variant, "AgreeToggled");
    assert_eq!(events[2].handler_name, "on_agree_change");
    assert_eq!(events[2].payload_type, EventPayloadType::Bool);

    assert_eq!(events[3].message_variant, "ZoomChanged");
    assert_eq!(events[3].handler_name, "on_zoom_change");
    assert_eq!(events[3].payload_type, EventPayloadType::F64);
}

#[test]
fn test_generate_initial_controller_compilation() {
    let events = vec![
        BoundEvent {
            message_variant: "SaveDocument".to_string(),
            handler_name: "on_save_click".to_string(),
            payload_type: EventPayloadType::Unit,
            widget_id: "btn_save".to_string(),
            event_kind: "on_click".to_string(),
        },
        BoundEvent {
            message_variant: "SearchQueryChanged".to_string(),
            handler_name: "on_search_query_change".to_string(),
            payload_type: EventPayloadType::String,
            widget_id: "txt_search".to_string(),
            event_kind: "on_change".to_string(),
        },
    ];

    let code = generate_initial_controller(&events);
    let parsed: Result<syn::File, _> = syn::parse_file(&code);
    assert!(parsed.is_ok(), "Initial controller must parse into valid syn::File");
    assert!(code.contains("pub struct Controller"));
    assert!(code.contains("impl UiHandler for Controller"));
    assert!(code.contains("fn on_save_click"));
    assert!(code.contains("fn on_search_query_change"));
}

#[test]
fn test_non_destructive_controller_merge() {
    let existing_source = r#"
use super::ui_generated::{AppState, UiHandler, UiMessage};

pub struct Controller {
    pub custom_counter: usize,
    pub custom_name: String,
}

impl Controller {
    pub fn new() -> Self {
        Self {
            custom_counter: 42,
            custom_name: "test".to_string(),
        }
    }

    pub fn custom_helper(&self) -> bool {
        self.custom_counter > 0
    }
}

impl UiHandler for Controller {
    fn on_save_click(&mut self, state: &mut AppState) {
        self.custom_counter += 1;
        state.status = "saved".to_string();
    }
}
"#;

    let events = vec![
        BoundEvent {
            message_variant: "SaveDocument".to_string(),
            handler_name: "on_save_click".to_string(),
            payload_type: EventPayloadType::Unit,
            widget_id: "btn_save".to_string(),
            event_kind: "on_click".to_string(),
        },
        BoundEvent {
            message_variant: "SearchQueryChanged".to_string(),
            handler_name: "on_search_query_change".to_string(),
            payload_type: EventPayloadType::String,
            widget_id: "txt_search".to_string(),
            event_kind: "on_change".to_string(),
        },
    ];

    let merged = merge_controller(existing_source, &events).expect("Merge must succeed");
    let parsed: Result<syn::File, _> = syn::parse_file(&merged);
    assert!(parsed.is_ok(), "Merged code must parse into valid syn::File");

    assert!(merged.contains("pub custom_counter: usize"));
    assert!(merged.contains("pub custom_name: String"));
    assert!(merged.contains("pub fn custom_helper"));
    assert!(merged.contains("self.custom_counter += 1"));
    assert!(merged.contains("state.status = \"saved\".to_string()"));
    assert!(merged.contains("fn on_search_query_change"));
}

#[test]
fn test_full_codegen_pipeline_sample_app() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let result = CodeGenerator::generate_all(&doc, None).expect("Codegen must succeed");

    assert!(!result.ui_generated_code.is_empty());
    assert!(!result.controller_code.is_empty());

    let parsed_ui: Result<syn::File, _> = syn::parse_file(&result.ui_generated_code);
    assert!(parsed_ui.is_ok(), "ui_generated.rs must parse into valid syn::File");

    let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&result.controller_code);
    assert!(parsed_ctrl.is_ok(), "controller.rs must parse into valid syn::File");

    assert!(result.ui_generated_code.contains("pub struct AppState"));
    assert!(result.ui_generated_code.contains("pub search_query: String"));
    assert!(result.ui_generated_code.contains("pub project_tree_nodes: Vec<String>"));
    assert!(result.ui_generated_code.contains("pub enum UiMessage"));
    assert!(result.ui_generated_code.contains("SearchQueryChanged(String)"));
    assert!(result.ui_generated_code.contains("BuildTriggered"));
    assert!(result.ui_generated_code.contains("pub trait UiHandler"));
    assert!(result.ui_generated_code.contains("fn dispatch(&mut self, state: &mut AppState, message: UiMessage)"));
    assert!(result.ui_generated_code.contains("pub struct WidgetIds"));
    assert!(result.ui_generated_code.contains("pub fn build_view(state: &AppState) -> ViewNode"));

    assert!(!result.ui_generated_code.contains("//"));
    assert!(!result.controller_code.contains("//"));
}

#[test]
fn test_go_fyne_codegen_pipeline_sample_app() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let result = CodeGenerator::generate_all_go(&doc, None).expect("Go codegen must succeed");

    assert!(!result.ui_generated_code.is_empty());
    assert!(!result.controller_code.is_empty());

    assert!(result.ui_generated_code.contains("package main"));
    assert!(result.ui_generated_code.contains("type AppState struct"));
    assert!(result.ui_generated_code.contains("type UiHandler interface"));
    assert!(result.ui_generated_code.contains("func BuildView(window fyne.Window, state *AppState, handler UiHandler) fyne.CanvasObject"));
    assert!(result.controller_code.contains("package main"));
    assert!(result.controller_code.contains("type Controller struct"));
    assert!(result.controller_code.contains("func (c *Controller) Dispatch(state *AppState, msg UiMessage)"));

    assert!(!result.ui_generated_code.contains("//"));
    assert!(!result.controller_code.contains("//"));
}

#[test]
fn test_theme_token_codegen_in_view() {
    let mut root = create_test_node("header", WidgetType::HBox);
    root.properties.background_color = Some("theme:primary".to_string());
    root.properties.border_color = Some("theme:outline".to_string());
    root.properties.text_color = Some("theme:on_primary".to_string());

    let doc = create_minimal_doc(root);
    let result = CodeGenerator::generate_all(&doc, None).expect("Codegen must succeed");

    assert!(result.ui_generated_code.contains("background: Some(\"theme:primary\")"));
    assert!(result.ui_generated_code.contains("border_color: Some(\"theme:outline\")"));
    assert!(result.ui_generated_code.contains("text_color: Some(\"theme:on_primary\")"));
}

#[test]
fn test_plugin_registry_discovery() {
    let registry = PluginRegistry::default();
    let profiles = registry.available_profiles();
    assert_eq!(profiles.len(), 6);

    let iced = registry.get(TargetFramework::Iced).expect("Iced plugin must be registered");
    assert_eq!(iced.profile().version, "0.13");
    assert_eq!(iced.profile().language, "rust");

    let egui = registry.get(TargetFramework::Egui).expect("Egui plugin must be registered");
    assert_eq!(egui.profile().version, "0.29");
    assert_eq!(egui.profile().language, "rust");

    let slint = registry.get(TargetFramework::Slint).expect("Slint plugin must be registered");
    assert_eq!(slint.profile().version, "1.8");
    assert_eq!(slint.profile().language, "rust");

    let dioxus = registry.get(TargetFramework::Dioxus).expect("Dioxus plugin must be registered");
    assert_eq!(dioxus.profile().version, "0.5");
    assert_eq!(dioxus.profile().language, "rust");

    let fyne = registry.get(TargetFramework::Fyne).expect("Fyne plugin must be registered");
    assert_eq!(fyne.profile().version, "v2.5");
    assert_eq!(fyne.profile().language, "go");

    let flet = registry.get(TargetFramework::Flet).expect("Flet plugin must be registered");
    assert_eq!(flet.profile().version, "0.24");
    assert_eq!(flet.profile().language, "python");
}

#[test]
fn test_iced_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Iced, None, &options)
        .expect("Iced codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.rs");
    assert_eq!(output.controller_filename, "controller.rs");
    assert_eq!(output.target_framework, TargetFramework::Iced);
    assert_eq!(output.framework_version, "0.13");

    let parsed_ui: Result<syn::File, _> = syn::parse_file(&output.ui_generated_code);
    assert!(parsed_ui.is_ok(), "Iced ui_generated.rs must parse as syn::File");

    let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&output.controller_code);
    assert!(parsed_ctrl.is_ok(), "Iced controller.rs must parse as syn::File");

    assert!(output.ui_generated_code.contains("pub struct AppState"));
    assert!(output.ui_generated_code.contains("pub enum UiMessage"));
    assert!(output.ui_generated_code.contains("pub trait UiHandler"));
    assert!(output.ui_generated_code.contains("iced::widget::"));
    assert!(output.ui_generated_code.contains("iced::Element<'a, UiMessage>"));
    assert!(output.ui_generated_code.contains("pub fn view"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
}

#[test]
fn test_egui_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Egui, None, &options)
        .expect("Egui codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.rs");
    assert_eq!(output.controller_filename, "controller.rs");
    assert_eq!(output.target_framework, TargetFramework::Egui);
    assert_eq!(output.framework_version, "0.29");

    let parsed_ui: Result<syn::File, _> = syn::parse_file(&output.ui_generated_code);
    assert!(parsed_ui.is_ok(), "Egui ui_generated.rs must parse as syn::File");

    let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&output.controller_code);
    assert!(parsed_ctrl.is_ok(), "Egui controller.rs must parse as syn::File");

    assert!(output.ui_generated_code.contains("pub struct AppState"));
    assert!(output.ui_generated_code.contains("pub enum UiMessage"));
    assert!(output.ui_generated_code.contains("pub trait UiHandler"));
    assert!(output.ui_generated_code.contains("pub fn render_ui<H: UiHandler>"));
    assert!(output.ui_generated_code.contains("ui.vertical"));
    assert!(output.ui_generated_code.contains("ui.horizontal"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
}

#[test]
fn test_slint_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Slint, None, &options)
        .expect("Slint codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.rs");
    assert_eq!(output.controller_filename, "controller.rs");
    assert_eq!(output.target_framework, TargetFramework::Slint);
    assert_eq!(output.framework_version, "1.8");

    assert_eq!(output.auxiliary_files.len(), 1);
    assert_eq!(output.auxiliary_files[0].filename, "ui_generated.slint");
    assert!(output.auxiliary_files[0].content.contains("export component MainWindow inherits Window"));
    assert!(output.auxiliary_files[0].content.contains("VerticalBox"));

    let parsed_ui: Result<syn::File, _> = syn::parse_file(&output.ui_generated_code);
    assert!(parsed_ui.is_ok(), "Slint ui_generated.rs must parse as syn::File");

    let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&output.controller_code);
    assert!(parsed_ctrl.is_ok(), "Slint controller.rs must parse as syn::File");

    assert!(output.ui_generated_code.contains("pub struct AppState"));
    assert!(output.ui_generated_code.contains("pub enum UiMessage"));
    assert!(output.ui_generated_code.contains("pub trait UiHandler"));
    assert!(output.ui_generated_code.contains("pub fn setup_ui"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
    assert!(!output.auxiliary_files[0].content.contains("//"));
}

#[test]
fn test_dioxus_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Dioxus, None, &options)
        .expect("Dioxus codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.rs");
    assert_eq!(output.controller_filename, "controller.rs");
    assert_eq!(output.target_framework, TargetFramework::Dioxus);
    assert_eq!(output.framework_version, "0.5");

    let parsed_ui: Result<syn::File, _> = syn::parse_file(&output.ui_generated_code);
    assert!(parsed_ui.is_ok(), "Dioxus ui_generated.rs must parse as syn::File");

    let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&output.controller_code);
    assert!(parsed_ctrl.is_ok(), "Dioxus controller.rs must parse as syn::File");

    assert!(output.ui_generated_code.contains("pub struct AppState"));
    assert!(output.ui_generated_code.contains("pub enum UiMessage"));
    assert!(output.ui_generated_code.contains("pub trait UiHandler"));
    assert!(output.ui_generated_code.contains("pub fn AppUi"));
    assert!(output.ui_generated_code.contains("rsx!"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
}

#[test]
fn test_fyne_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Fyne, None, &options)
        .expect("Fyne codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.go");
    assert_eq!(output.controller_filename, "controller.go");
    assert_eq!(output.target_framework, TargetFramework::Fyne);
    assert_eq!(output.framework_version, "v2.5");

    assert!(output.ui_generated_code.contains("package main"));
    assert!(output.ui_generated_code.contains("type AppState struct"));
    assert!(output.ui_generated_code.contains("type UiHandler interface"));
    assert!(output.ui_generated_code.contains("func BuildView(window fyne.Window, state *AppState, handler UiHandler) fyne.CanvasObject"));

    assert!(output.controller_code.contains("package main"));
    assert!(output.controller_code.contains("type Controller struct"));
    assert!(output.controller_code.contains("func (c *Controller) Dispatch(state *AppState, msg UiMessage)"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
}

#[test]
fn test_flet_plugin_generation() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Flet, None, &options)
        .expect("Flet codegen must succeed");

    assert_eq!(output.ui_generated_filename, "ui_generated.py");
    assert_eq!(output.controller_filename, "controller.py");
    assert_eq!(output.target_framework, TargetFramework::Flet);
    assert_eq!(output.framework_version, "0.24");

    assert!(output.ui_generated_code.contains("import flet as ft"));
    assert!(output.ui_generated_code.contains("@dataclass\nclass AppState:"));
    assert!(output.ui_generated_code.contains("class UiMessage(Enum):"));
    assert!(output.ui_generated_code.contains("class UiHandler(Protocol):"));
    assert!(output.ui_generated_code.contains("def build_view(page: ft.Page, state: AppState, handler: UiHandler) -> ft.Control:"));

    assert!(output.controller_code.contains("class Controller"));
    assert!(output.controller_code.contains("def dispatch(self, state: AppState, message: UiMessage, payload: Any = None) -> None:"));

    assert!(!output.ui_generated_code.contains("//"));
    assert!(!output.controller_code.contains("//"));
}

#[test]
fn test_flet_controller_non_destructive_merge() {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let existing_py = r#"from __future__ import annotations
from ui_generated import AppState, UiHandler, UiMessage

class Controller:
    def __init__(self):
        self.custom_counter = 100

    def custom_method(self) -> int:
        return self.custom_counter * 2
"#;

    let options = CodegenOptions::default();
    let output = CodeGenerator::generate_for_framework(
        &doc,
        TargetFramework::Flet,
        Some(existing_py),
        &options,
    )
    .expect("Flet codegen with merge must succeed");

    assert!(output.controller_code.contains("self.custom_counter = 100"));
    assert!(output.controller_code.contains("def custom_method(self) -> int:"));
    assert!(output.controller_code.contains("return self.custom_counter * 2"));
    assert!(output.controller_code.contains("def on_"));

    assert!(!output.controller_code.contains("//"));
}
