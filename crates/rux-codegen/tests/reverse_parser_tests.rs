use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    EventHandler, PropertyValue, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties,
    WidgetType,
};
use rux_codegen::patcher::AstPatcher;
use rux_codegen::plugin::{CodeGenerator as CodeGeneratorPlugin, CodegenOptions, TargetFramework};
use rux_codegen::plugins::dioxus::DioxusPlugin;
use rux_codegen::plugins::slint::SlintPlugin;
use rux_codegen::reverse_parser::ReverseParser;

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

fn create_test_document() -> RuxDocument {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let mut doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let mut btn = create_test_node("btn_submit", WidgetType::Button);
    btn.properties.text = Some("Submit".into());
    btn.events.on_click = Some(EventHandler {
        handler_name: "on_submit".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut lbl = create_test_node("lbl_status", WidgetType::Label);
    lbl.properties.text = Some("Welcome".into());

    let mut txt = create_test_node("txt_input", WidgetType::TextInput);
    txt.properties.placeholder = Some("Enter name".into());
    txt.events.on_change = Some(EventHandler {
        handler_name: "on_name_change".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut chk = create_test_node("chk_agree", WidgetType::Checkbox);
    chk.properties.text = Some("Accept terms".into());
    chk.events.on_click = Some(EventHandler {
        handler_name: "on_agree_toggle".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut root = create_test_node("root", WidgetType::VBox);
    root.children = vec![btn, lbl, txt, chk];

    doc.root = root;
    doc
}

#[test]
fn test_reverse_parse_iced_button_text_change() {
    let mut doc = create_test_document();

    let iced_code = r##"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, checkbox, column, container, text, text_input};
            column![
                button(text("Login")).on_press(UiMessage::OnSubmit),
                text("Welcome"),
                text_input("Enter name", &state.txt_input).on_input(UiMessage::OnNameChange),
                checkbox("Accept terms", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
            ]
            .spacing(8.0)
            .into()
        }
    "##;

    let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
        .expect("Reverse parsing should succeed");

    assert_eq!(report.patched_nodes_count, 1);
    assert_eq!(report.patches.len(), 1);
    assert_eq!(report.patches[0].widget_id, "btn_submit");
    assert_eq!(report.patches[0].property_name, "text");
    assert_eq!(report.patches[0].old_value, Some("Submit".to_string()));
    assert_eq!(report.patches[0].new_value, "Login");

    assert_eq!(
        doc.root.children[0].properties.text.as_deref(),
        Some("Login")
    );
}

#[test]
fn test_reverse_parse_iced_multiple_properties() {
    let mut doc = create_test_document();

    let iced_code = r##"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, checkbox, column, container, text, text_input};
            column![
                button(text("Authenticate")).on_press(UiMessage::OnSubmit),
                text("Dashboard Overview"),
                text_input("Enter your email", &state.txt_input).on_input(UiMessage::OnNameChange),
                checkbox("Keep me signed in", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
            ]
            .spacing(8.0)
            .into()
        }
    "##;

    let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
        .expect("Reverse parsing should succeed");

    assert_eq!(report.patched_nodes_count, 4);
    assert_eq!(
        doc.root.children[0].properties.text.as_deref(),
        Some("Authenticate")
    );
    assert_eq!(
        doc.root.children[1].properties.text.as_deref(),
        Some("Dashboard Overview")
    );
    assert_eq!(
        doc.root.children[2].properties.placeholder.as_deref(),
        Some("Enter your email")
    );
    assert_eq!(
        doc.root.children[3].properties.text.as_deref(),
        Some("Keep me signed in")
    );
}

#[test]
fn test_reverse_parse_egui_button_and_labels() {
    let mut doc = create_test_document();

    let egui_code = r##"
        pub fn render_ui<H: UiHandler>(
            ui: &mut egui::Ui,
            state: &mut AppState,
            handler: &mut H,
        ) {
            ui.vertical(|ui| {
                if ui.button("Confirm Transfer").clicked() {
                    handler.dispatch(state, UiMessage::OnSubmit);
                }
                ui.label("Account Balance: $1,250.00");
                ui.checkbox(&mut state.chk_agree, "Confirm transaction integrity");
            });
        }
    "##;

    let report = ReverseParser::patch_document(&mut doc, egui_code, Some(TargetFramework::Egui))
        .expect("Reverse parsing should succeed");

    assert_eq!(report.patched_nodes_count, 3);
    assert_eq!(
        doc.root.children[0].properties.text.as_deref(),
        Some("Confirm Transfer")
    );
    assert_eq!(
        doc.root.children[1].properties.text.as_deref(),
        Some("Account Balance: $1,250.00")
    );
    assert_eq!(
        doc.root.children[3].properties.text.as_deref(),
        Some("Confirm transaction integrity")
    );
}

#[test]
fn test_reverse_parse_build_view_colors_and_text() {
    let mut doc = create_test_document();

    let build_view_code = r##"
        pub fn build_view(state: &AppState) -> ViewNode {
            ViewNode {
                id: "root",
                widget_type: "VBox",
                text: None,
                background: Some("#1e1e2e"),
                border_color: None,
                text_color: None,
                children: vec![
                    ViewNode {
                        id: "btn_submit",
                        widget_type: "Button",
                        text: Some("Proceed to Checkout".to_string()),
                        background: Some("#ff5500"),
                        border_color: Some("#ffffff"),
                        text_color: Some("#000000"),
                        children: vec![],
                    },
                    ViewNode {
                        id: "lbl_status",
                        widget_type: "Label",
                        text: Some("Order Ready".to_string()),
                        background: None,
                        border_color: None,
                        text_color: Some("#888888"),
                        children: vec![],
                    }
                ],
            }
        }
    "##;

    let report = ReverseParser::patch_document(&mut doc, build_view_code, None)
        .expect("Reverse parsing should succeed");

    assert_eq!(report.patched_nodes_count, 3);

    let btn = &doc.root.children[0];
    assert_eq!(btn.properties.text.as_deref(), Some("Proceed to Checkout"));
    assert_eq!(btn.properties.background_color.as_deref(), Some("#ff5500"));
    assert_eq!(btn.properties.border_color.as_deref(), Some("#ffffff"));
    assert_eq!(btn.properties.text_color.as_deref(), Some("#000000"));

    let root = &doc.root;
    assert_eq!(root.properties.background_color.as_deref(), Some("#1e1e2e"));
}

#[test]
fn test_reverse_parse_syntax_error_safety() {
    let mut doc = create_test_document();

    let broken_code = r##"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            column![
                button(text("Broken"
    "##;

    let result = ReverseParser::patch_document(&mut doc, broken_code, Some(TargetFramework::Iced));
    assert!(result.is_err());
    assert_eq!(
        doc.root.children[0].properties.text.as_deref(),
        Some("Submit")
    );
}

#[test]
fn test_reverse_parse_no_op_when_identical() {
    let mut doc = create_test_document();

    let identical_code = r##"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, checkbox, column, container, text, text_input};
            column![
                button(text("Submit")).on_press(UiMessage::OnSubmit),
                text("Welcome"),
                text_input("Enter name", &state.txt_input).on_input(UiMessage::OnNameChange),
                checkbox("Accept terms", state.chk_agree).on_toggle(UiMessage::OnAgreeToggle)
            ]
            .spacing(8.0)
            .into()
        }
    "##;

    let report = ReverseParser::patch_document(&mut doc, identical_code, Some(TargetFramework::Iced))
        .expect("Reverse parsing should succeed");

    assert_eq!(report.patched_nodes_count, 0);
    assert_eq!(report.patches.len(), 0);
}

/// DIRECTIVE 1 TEST: Round-tripping a Dioxus `rsx! { div { button { "Click" } } }` block.
#[test]
fn test_dioxus_rsx_roundtrip_block() {
    let dioxus_code = r#"
        pub fn App() -> Element {
            rsx! {
                div {
                    button {
                        "Click"
                    }
                }
            }
        }
    "#;

    // 1. Reverse parse RSX syntax into universal WidgetNode tree
    let node = DioxusPlugin::reverse_parse_rsx(dioxus_code)
        .expect("Dioxus RSX block should parse successfully");

    assert_eq!(node.widget_type, WidgetType::VBox);
    assert_eq!(node.children.len(), 1);
    let btn_child = &node.children[0];
    assert_eq!(btn_child.widget_type, WidgetType::Button);
    assert_eq!(btn_child.properties.text.as_ref().unwrap().as_str(), "Click");

    // 2. Put into RuxDocument and verify roundtrip code generation
    let mut doc = create_test_document();
    doc.root = node;

    let plugin = DioxusPlugin::new();
    let codegen_output = plugin
        .generate(&doc, &[], &[], None, &CodegenOptions::default())
        .expect("Dioxus code generator should succeed");

    assert!(codegen_output.ui_generated_code.contains("rsx!"));
    assert!(codegen_output.ui_generated_code.contains("button"));
    assert!(codegen_output.ui_generated_code.contains("\"Click\""));

    // 3. Bidirectional patch: update button text in RSX and reconcile document
    let updated_dioxus_code = r#"
        pub fn App() -> Element {
            rsx! {
                div {
                    button {
                        "Authorize & Pay"
                    }
                }
            }
        }
    "#;

    let report = ReverseParser::patch_document(&mut doc, updated_dioxus_code, Some(TargetFramework::Dioxus))
        .expect("Reverse parsing updated RSX should succeed");

    assert!(report.patched_nodes_count >= 1);
    assert_eq!(
        doc.root.children[0].properties.text.as_ref().unwrap().as_str(),
        "Authorize & Pay"
    );
}

/// DIRECTIVE 2 TEST: Preserving an egui `ui.vertical(|ui| { ... })` closure sequence.
#[test]
fn test_preserve_egui_vertical_closure_sequence() {
    let egui_source = r#"// Header comment: do not overwrite
use egui::{Ui, Response};

pub fn render_ui<H: UiHandler>(
    ui: &mut egui::Ui,
    state: &mut AppState,
    handler: &mut H,
) {
    // Audit anchor: main layout container
    ui.vertical(|ui| {
        // Line-level comment before label
        ui.label("Account Balance: $1,250.00");
        /* inline comment */
        if ui.button("Confirm Transfer").clicked() {
            handler.dispatch(state, UiMessage::OnSubmit);
        }
        // Trailing closure comment
    });
}
"#;

    // 1. Patch property inside nested closure using AstPatcher without corrupting comments or closure
    let patched = AstPatcher::patch_property(
        egui_source,
        "Confirm Transfer",
        "text",
        &PropertyValue::Static("Authorize Transaction".to_string()),
    )
    .expect("AstPatcher should locate button text inside vertical closure");

    assert!(patched.contains("// Header comment: do not overwrite"));
    assert!(patched.contains("// Audit anchor: main layout container"));
    assert!(patched.contains("ui.vertical(|ui| {"));
    assert!(patched.contains("// Line-level comment before label"));
    assert!(patched.contains("/* inline comment */"));
    assert!(patched.contains("Authorize Transaction"));
    assert!(!patched.contains("\"Confirm Transfer\""));
    assert!(patched.contains("// Trailing closure comment"));

    // 2. Append new widget inside the closure using AstPatcher
    let mut new_widget = create_test_node("btn_cancel", WidgetType::Button);
    new_widget.properties.text = Some(PropertyValue::Static("Cancel".to_string()));

    let with_appended = AstPatcher::append_widget(&patched, &new_widget, TargetFramework::Egui)
        .expect("AstPatcher should append widget inside egui closure");

    assert!(with_appended.contains("ui.vertical(|ui| {"));
    assert!(with_appended.contains("let _ = ui.button(\"Cancel\");"));
    assert!(with_appended.contains("// Trailing closure comment"));
    assert!(with_appended.contains("// Header comment: do not overwrite"));
}

/// DIRECTIVE 3 TEST: Modifying a native `.slint` file structure.
#[test]
fn test_modify_native_slint_file_structure() {
    let slint_code = r#"import { Button, VerticalBox } from "std-widgets.slint";

export component MainWindow inherits Window {
    title: "Slint App";
    width: 800px;
    height: 600px;

    VerticalBox {
        Button {
            text: "Initial Action";
        }
        Rectangle {
            background: #ff0000;
            border-color: #ffffff;
            border-width: 2px;
            width: 120px;
            height: 40px;
        }
    }
}
"#;

    // 1. Dedicated reverse parsing of native Slint syntax
    let root_node = SlintPlugin::reverse_parse_slint(slint_code)
        .expect("Native Slint file should parse without syn");

    assert_eq!(root_node.widget_type, WidgetType::VBox);
    assert_eq!(root_node.children.len(), 1);
    let vbox = &root_node.children[0];
    assert_eq!(vbox.widget_type, WidgetType::VBox);
    assert_eq!(vbox.children.len(), 2);
    assert_eq!(vbox.children[0].widget_type, WidgetType::Button);
    assert_eq!(
        vbox.children[0].properties.text.as_ref().unwrap().as_str(),
        "Initial Action"
    );
    assert_eq!(vbox.children[1].widget_type, WidgetType::Rectangle);
    assert_eq!(
        vbox.children[1].properties.background_color.as_deref(),
        Some("#ff0000")
    );

    // 2. Modify Slint source code tokens
    let modified = SlintPlugin::modify_slint_source(slint_code, "Initial Action", "Confirmed Order")
        .expect("Token replacement in Slint source should succeed");
    let modified = SlintPlugin::modify_slint_source(&modified, "#ff0000", "#10b981")
        .expect("Color replacement in Slint source should succeed");

    assert!(modified.contains("text: \"Confirmed Order\";"));
    assert!(modified.contains("background: #10b981;"));

    // 3. Reverse parse modified Slint source and verify AST reconciliation
    let mut doc = create_test_document();
    doc.root = root_node;

    let report = ReverseParser::patch_document(&mut doc, &modified, Some(TargetFramework::Slint))
        .expect("Reverse parsing modified Slint file should succeed");

    assert!(report.patched_nodes_count >= 1);
    let updated_btn = &doc.root.children[0].children[0];
    assert_eq!(
        updated_btn.properties.text.as_ref().unwrap().as_str(),
        "Confirmed Order"
    );
    let updated_rect = &doc.root.children[0].children[1];
    assert_eq!(
        updated_rect.properties.background_color.as_deref(),
        Some("#10b981")
    );
}
