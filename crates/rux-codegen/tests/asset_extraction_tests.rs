use rux_ast::document::RuxDocument;
use rux_ast::widget::{WidgetNode, WidgetProperties, WidgetType};
use rux_codegen::plugins::dioxus::DioxusPlugin;
use rux_codegen::plugins::slint::SlintPlugin;
use rux_codegen::reverse_parser::ReverseParser;
use rux_codegen::TargetFramework;

fn create_test_doc_with_root(root: WidgetNode) -> RuxDocument {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let mut doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");
    doc.root = root;
    doc
}

#[test]
fn test_extract_iced_image_paths() {
    let iced_code = r#"
        pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
            column![
                iced::widget::image("assets/logo.png"),
                image("assets/banner.jpg"),
                image(image::Handle::from_path("assets/icons/star.svg"))
            ]
            .into()
        }
    "#;

    let root = WidgetNode {
        id: "root".to_string(),
        widget_type: WidgetType::VBox,
        slot: None,
        properties: WidgetProperties::default(),
        layout: None,
        events: rux_ast::widget::WidgetEvents::default(),
        bindings: rux_ast::widget::WidgetBindings::default(),
        animations: Vec::new(),
        children: vec![
            WidgetNode {
                id: "img_logo".to_string(),
                widget_type: WidgetType::Image,
                slot: None,
                properties: WidgetProperties {
                    image_path: Some("assets/old_logo.png".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
            WidgetNode {
                id: "img_banner".to_string(),
                widget_type: WidgetType::Image,
                slot: None,
                properties: WidgetProperties {
                    image_path: Some("assets/old_banner.jpg".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
            WidgetNode {
                id: "img_icon".to_string(),
                widget_type: WidgetType::Image,
                slot: None,
                properties: WidgetProperties {
                    image_path: Some("assets/old_icon.svg".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
        ],
    };

    let mut doc = create_test_doc_with_root(root);
    let report = ReverseParser::patch_document(&mut doc, iced_code, Some(TargetFramework::Iced))
        .expect("Iced reverse parsing should extract image paths successfully");

    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/logo.png"));
    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/banner.jpg"));
    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/icons/star.svg"));

    assert_eq!(doc.root.children[0].properties.image_path.as_deref(), Some("assets/logo.png"));
    assert_eq!(doc.root.children[1].properties.image_path.as_deref(), Some("assets/banner.jpg"));
    assert_eq!(doc.root.children[2].properties.image_path.as_deref(), Some("assets/icons/star.svg"));
}

#[test]
fn test_extract_egui_image_paths() {
    let egui_code = r#"
        pub fn render_ui<H: UiHandler>(ui: &mut egui::Ui, state: &AppState, handler: &H) {
            ui.vertical(|ui| {
                ui.image("assets/logo.png");
                ui.add(egui::Image::new("assets/header.jpg"));
            });
        }
    "#;

    let mut doc = create_test_doc_with_root(WidgetNode {
        id: "root".to_string(),
        widget_type: WidgetType::VBox,
        slot: None,
        properties: WidgetProperties::default(),
        layout: None,
        events: rux_ast::widget::WidgetEvents::default(),
        bindings: rux_ast::widget::WidgetBindings::default(),
        animations: Vec::new(),
        children: vec![
            WidgetNode {
                id: "img_1".to_string(),
                widget_type: WidgetType::Image,
                slot: None,
                properties: WidgetProperties {
                    image_path: Some("assets/placeholder.png".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
            WidgetNode {
                id: "img_2".to_string(),
                widget_type: WidgetType::Image,
                slot: None,
                properties: WidgetProperties {
                    image_path: Some("assets/old_header.jpg".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: rux_ast::widget::WidgetEvents::default(),
                bindings: rux_ast::widget::WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
        ],
    });

    let report = ReverseParser::patch_document(&mut doc, egui_code, Some(TargetFramework::Egui))
        .expect("egui reverse parsing should extract image paths successfully");

    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/logo.png"));
    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/header.jpg"));

    assert_eq!(doc.root.children[0].properties.image_path.as_deref(), Some("assets/logo.png"));
    assert_eq!(doc.root.children[1].properties.image_path.as_deref(), Some("assets/header.jpg"));
}

#[test]
fn test_extract_slint_image_paths() {
    let slint_code = r#"
export component MainWindow inherits Window {
    VerticalBox {
        Image {
            source: @image-url("assets/logo.png");
            width: 200px;
            height: 150px;
        }
        Image {
            source: @image-url('assets/icons/star.svg');
            width: 32px;
            height: 32px;
        }
    }
}
"#;

    let root_node = SlintPlugin::reverse_parse_slint(slint_code)
        .expect("Native Slint file should parse images without syn");

    assert_eq!(root_node.widget_type, WidgetType::VBox);
    let vbox = &root_node.children[0];
    assert_eq!(vbox.children.len(), 2);
    assert_eq!(vbox.children[0].widget_type, WidgetType::Image);
    assert_eq!(vbox.children[0].properties.image_path.as_deref(), Some("assets/logo.png"));
    assert_eq!(vbox.children[1].widget_type, WidgetType::Image);
    assert_eq!(vbox.children[1].properties.image_path.as_deref(), Some("assets/icons/star.svg"));

    // Verify Slint patching roundtrip
    let mut doc = create_test_doc_with_root(root_node.clone());
    let modified = slint_code.replace("assets/logo.png", "assets/brand/new_logo.png");
    let report = ReverseParser::patch_document(&mut doc, &modified, Some(TargetFramework::Slint))
        .expect("Slint patching should update image_path");

    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/brand/new_logo.png"));
    assert_eq!(doc.root.children[0].children[0].properties.image_path.as_deref(), Some("assets/brand/new_logo.png"));
}

#[test]
fn test_extract_dioxus_image_paths() {
    let dioxus_code = r#"
        rsx! {
            div {
                img {
                    src: "assets/logo.png"
                }
                img {
                    src: "./assets/images/avatar.jpg"
                }
            }
        }
    "#;

    let root_node = DioxusPlugin::reverse_parse_rsx(dioxus_code)
        .expect("Dioxus RSX should parse img elements");

    assert_eq!(root_node.widget_type, WidgetType::VBox);
    assert_eq!(root_node.children.len(), 2);
    assert_eq!(root_node.children[0].widget_type, WidgetType::Image);
    assert_eq!(root_node.children[0].properties.image_path.as_deref(), Some("assets/logo.png"));
    assert_eq!(root_node.children[1].widget_type, WidgetType::Image);
    assert_eq!(root_node.children[1].properties.image_path.as_deref(), Some("assets/images/avatar.jpg"));

    // Verify Dioxus patching roundtrip
    let mut doc = create_test_doc_with_root(root_node);
    let updated_dioxus = dioxus_code.replace("assets/logo.png", "assets/hero.png");
    let report = ReverseParser::patch_document(&mut doc, &updated_dioxus, Some(TargetFramework::Dioxus))
        .expect("Dioxus patching should update image_path");

    assert!(report.patches.iter().any(|p| p.property_name == "image_path" && p.new_value == "assets/hero.png"));
    assert_eq!(doc.root.children[0].properties.image_path.as_deref(), Some("assets/hero.png"));
}
