use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    EventHandler, PropertyValue, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties,
    WidgetType,
};
use rux_codegen::patcher::{AstPatcher, SourcePatch, SourceSpanMap};
use rux_codegen::plugin::{CodegenOptions, TargetFramework};
use rux_codegen::plugins::iced::IcedPlugin;
use rux_codegen::reverse_parser::ReverseParser;
use rux_codegen::CodeGeneratorPlugin;

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

fn create_sample_document() -> RuxDocument {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let mut doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");

    let mut btn = create_test_node("btn_action", WidgetType::Button);
    btn.properties.text = Some(PropertyValue::Static("Submit".to_string()));
    btn.events.on_click = Some(EventHandler {
        handler_name: "on_submit".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut lbl = create_test_node("lbl_info", WidgetType::Label);
    lbl.properties.text = Some(PropertyValue::Static("Status: Ready".to_string()));

    let mut root = create_test_node("root_container", WidgetType::VBox);
    root.children = vec![btn, lbl];

    doc.root = root;
    doc
}

/// DIRECTIVE 1 TEST: Preserving `// custom comments` and exact formatting during property updates.
#[test]
fn test_preserve_comments_during_property_update() {
    let source_code = r#"// Top-level file header comment: do not delete
use iced::widget::{button, column, text};

// Function doc comment
pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
    // Audit anchor: Security critical button
    column![
        // Pre-button comment: handles secure transactions
        button(text("Submit")).on_press(UiMessage::OnSubmit),
        /* inline comment */ text("Status: Ready") // end of line comment
    ]
    .spacing(8.0)
    .into()
}
"#;

    // We patch the button text "Submit" -> "Authorize & Transfer"
    // Using AstPatcher::patch_ui_source
    let mut doc = create_sample_document();
    if let Some(btn) = doc.root.children.get_mut(0) {
        btn.properties.text = Some(PropertyValue::Static("Authorize & Transfer".to_string()));
    }

    let patched_code = AstPatcher::patch_ui_source(source_code, &doc, TargetFramework::Iced)
        .expect("Patching UI source should succeed");

    // Verify all comments are preserved intact
    assert!(
        patched_code.contains("// Top-level file header comment: do not delete"),
        "Top-level header comment must be preserved"
    );
    assert!(
        patched_code.contains("// Function doc comment"),
        "Doc comment must be preserved"
    );
    assert!(
        patched_code.contains("// Audit anchor: Security critical button"),
        "Audit anchor comment must be preserved"
    );
    assert!(
        patched_code.contains("// Pre-button comment: handles secure transactions"),
        "Pre-button comment must be preserved"
    );
    assert!(
        patched_code.contains("/* inline comment */"),
        "Inline comment must be preserved"
    );
    assert!(
        patched_code.contains("// end of line comment"),
        "End of line comment must be preserved"
    );

    // Verify the value was updated
    assert!(
        patched_code.contains("Authorize & Transfer"),
        "Patched code must contain new text value"
    );
    assert!(
        !patched_code.contains("\"Submit\""),
        "Old value must be replaced"
    );
}

/// DIRECTIVE 1 TEST: Low-level AstPatcher test for localized replacement and append
#[test]
fn test_ast_patcher_localized_replacement_and_append() {
    let original = "let a = \"old_value\"; // Important comment\nlet b = 10;";
    
    // Replace "old_value" -> "new_value"
    let patch = SourcePatch {
        range: 8..19,
        replacement: "\"new_value\"".to_string(),
    };

    let span_map = SourceSpanMap::new(original);
    let result = span_map.apply_patches(vec![patch]).unwrap();
    assert_eq!(result, "let a = \"new_value\"; // Important comment\nlet b = 10;");
}

/// DIRECTIVE 2 TEST: Distinguishing `self.counter` binding vs `"counter"` string literal
#[test]
fn test_distinguish_binding_vs_static_string() {
    // 1. Literal string in Iced
    let code_static = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, column, text};
            column![
                button(text("counter")).on_press(UiMessage::OnSubmit),
                text("Status: Ready")
            ]
            .into()
        }
    "#;

    let mut doc_static = create_sample_document();
    let report_static = ReverseParser::patch_document(&mut doc_static, code_static, Some(TargetFramework::Iced))
        .expect("Static code must parse");

    assert_eq!(report_static.patched_nodes_count, 1);
    let val_static = doc_static.root.children[0].properties.text.as_ref().unwrap();
    assert!(val_static.is_static(), "Literal string must be detected as Static");
    assert!(!val_static.is_binding(), "Literal string must NOT be detected as Binding");
    assert_eq!(val_static.as_str(), "counter");

    // 2. Field access binding in Iced: self.counter
    let code_binding = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, column, text};
            column![
                button(text(self.counter)).on_press(UiMessage::OnSubmit),
                text("Status: Ready")
            ]
            .into()
        }
    "#;

    let mut doc_binding = create_sample_document();
    let report_binding = ReverseParser::patch_document(&mut doc_binding, code_binding, Some(TargetFramework::Iced))
        .expect("Binding code must parse");

    assert_eq!(report_binding.patched_nodes_count, 1);
    let val_binding = doc_binding.root.children[0].properties.text.as_ref().unwrap();
    assert!(val_binding.is_binding(), "self.counter must be detected as Binding");
    assert!(!val_binding.is_static(), "self.counter must NOT be detected as Static");
    assert_eq!(val_binding.as_str(), "self.counter");

    // 3. Deep path binding: self.state.user_profile.name
    let code_deep_binding = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, column, text};
            column![
                button(text(self.state.user_profile.name)).on_press(UiMessage::OnSubmit),
                text("Status: Ready")
            ]
            .into()
        }
    "#;

    let mut doc_deep = create_sample_document();
    ReverseParser::patch_document(&mut doc_deep, code_deep_binding, Some(TargetFramework::Iced))
        .expect("Deep binding must parse");

    let val_deep = doc_deep.root.children[0].properties.text.as_ref().unwrap();
    assert!(val_deep.is_binding());
    assert_eq!(val_deep.as_str(), "self.state.user_profile.name");

    // 4. Roundtrip codegen check: PropertyValue::Binding generates self.counter without quotes
    let plugin = IcedPlugin::new();
    let mut doc_to_gen = create_sample_document();
    doc_to_gen.root.children[0].properties.text = Some(PropertyValue::Binding("self.counter".to_string()));
    let output = plugin.generate(&doc_to_gen, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(
        output.ui_generated_code.contains("button(text(self.counter))"),
        "Codegen must emit raw unquoted identifier for Binding: got {}",
        output.ui_generated_code
    );
}

/// DIRECTIVE 3 TEST: Control Flow Survival (ExprIf, ExprMatch, closures)
#[test]
fn test_control_flow_survival_if_and_match() {
    let code_with_if = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, column, text};
            column![
                if state.is_logged_in {
                    button(text("Logout")).on_press(UiMessage::OnSubmit)
                } else {
                    button(text("Login")).on_press(UiMessage::OnSubmit)
                }
            ]
            .into()
        }
    "#;

    let mut doc = create_sample_document();
    let report = ReverseParser::patch_document(&mut doc, code_with_if, Some(TargetFramework::Iced))
        .expect("If expression must parse without panic");

    assert!(report.patched_nodes_count >= 1);
    let first_child = &doc.root.children[0];
    assert_eq!(first_child.widget_type, WidgetType::ConditionalNode);
    assert!(first_child.properties.condition.is_some());
    let cond = first_child.properties.condition.as_ref().unwrap();
    assert!(cond.contains("if") && cond.contains("state") && cond.contains("is_logged_in"));
    // Inner branches should be parsed as children
    assert!(!first_child.children.is_empty(), "Conditional node must contain inner branch children");
}

/// DIRECTIVE 4 TEST: Custom/Generic Widget Fallback
#[test]
fn test_custom_unknown_widget_fallback() {
    let code_with_custom = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            use iced::widget::{button, column, text};
            column![
                button(text("Submit")).on_press(UiMessage::OnSubmit),
                UnknownWidget::build("alpha", 42, true),
                CustomAvatar::render(&state.user_avatar)
            ]
            .into()
        }
    "#;

    let mut doc = create_sample_document();
    let _report = ReverseParser::patch_document(&mut doc, code_with_custom, Some(TargetFramework::Iced))
        .expect("Unknown widgets must not panic or error");

    // The two unknown widgets should be appended/mapped as GenericWidget
    let children = &doc.root.children;
    assert!(
        children.len() >= 3,
        "Doc must have at least 3 children, found {}",
        children.len()
    );

    let generic1 = &children[1];
    assert_eq!(generic1.widget_type, WidgetType::GenericWidget);
    assert_eq!(
        generic1.properties.custom_type.as_deref(),
        Some("UnknownWidget::build")
    );
    let raw_args = generic1.properties.raw_args.as_ref().unwrap();
    assert!(raw_args.contains("\"alpha\"") && raw_args.contains("42"));

    let generic2 = &children[2];
    assert_eq!(generic2.widget_type, WidgetType::GenericWidget);
    assert_eq!(
        generic2.properties.custom_type.as_deref(),
        Some("CustomAvatar::render")
    );

    // Verify round-trip codegen produces valid iced tokens for GenericWidget
    let plugin = IcedPlugin::new();
    let gen_output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(
        gen_output.ui_generated_code.contains("UnknownWidget::build"),
        "Generated code must preserve custom widget call: {}",
        gen_output.ui_generated_code
    );
}
