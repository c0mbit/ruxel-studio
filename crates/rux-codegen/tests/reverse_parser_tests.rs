use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    EventHandler, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType,
};
use rux_codegen::plugin::TargetFramework;
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
    btn.properties.text = Some("Submit".to_string());
    btn.events.on_click = Some(EventHandler {
        handler_name: "on_submit".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut lbl = create_test_node("lbl_status", WidgetType::Label);
    lbl.properties.text = Some("Welcome".to_string());

    let mut txt = create_test_node("txt_input", WidgetType::TextInput);
    txt.properties.placeholder = Some("Enter name".to_string());
    txt.events.on_change = Some(EventHandler {
        handler_name: "on_name_change".to_string(),
        message: None,
        navigate_to: None,
    });

    let mut chk = create_test_node("chk_agree", WidgetType::Checkbox);
    chk.properties.text = Some("Accept terms".to_string());
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
