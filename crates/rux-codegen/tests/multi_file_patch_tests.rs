use std::collections::BTreeMap;
use std::fs;
use rux_ast::document::{ComponentDefinition, RuxDocument};
use rux_ast::widget::{PropertyValue, WidgetNode, WidgetProperties, WidgetType};
use rux_codegen::patcher::{
    resolve_widget_file_path, resolve_widget_owner, AstPatcher, WidgetLocation,
};
use rux_codegen::plugin::TargetFramework;

fn create_sample_component_doc() -> RuxDocument {
    let mut doc = RuxDocument::default();
    doc.root = WidgetNode {
        id: "root_container".to_string(),
        widget_type: WidgetType::VBox,
        slot: None,
        properties: WidgetProperties::default(),
        layout: None,
        events: Default::default(),
        bindings: Default::default(),
        animations: Vec::new(),
        children: vec![
            WidgetNode {
                id: "main_title".to_string(),
                widget_type: WidgetType::Label,
                slot: None,
                properties: WidgetProperties {
                    text: Some(PropertyValue::Static("Main Dashboard".to_string())),
                    ..Default::default()
                },
                layout: None,
                events: Default::default(),
                bindings: Default::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
            WidgetNode {
                id: "custom_header_inst".to_string(),
                widget_type: WidgetType::CustomComponent,
                slot: None,
                properties: WidgetProperties {
                    custom_type: Some("CustomHeader".to_string()),
                    raw_args: Some("CustomHeader::new()".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: Default::default(),
                bindings: Default::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
        ],
    };

    let header_node = WidgetNode {
        id: "header_box".to_string(),
        widget_type: WidgetType::HBox,
        slot: None,
        properties: WidgetProperties::default(),
        layout: None,
        events: Default::default(),
        bindings: Default::default(),
        animations: Vec::new(),
        children: vec![
            WidgetNode {
                id: "header_title".to_string(),
                widget_type: WidgetType::Label,
                slot: None,
                properties: WidgetProperties {
                    text: Some(PropertyValue::Static("Original Header Title".to_string())),
                    ..Default::default()
                },
                layout: None,
                events: Default::default(),
                bindings: Default::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
            WidgetNode {
                id: "header_btn_logout".to_string(),
                widget_type: WidgetType::Button,
                slot: None,
                properties: WidgetProperties {
                    text: Some(PropertyValue::Static("Logout".to_string())),
                    style: Some("danger".to_string()),
                    ..Default::default()
                },
                layout: None,
                events: Default::default(),
                bindings: Default::default(),
                animations: Vec::new(),
                children: Vec::new(),
            },
        ],
    };

    let mut components = BTreeMap::new();
    components.insert(
        "CustomHeader".to_string(),
        ComponentDefinition {
            name: "CustomHeader".to_string(),
            root: header_node,
            file_path: Some("src/components/custom_header.rs".to_string()),
        },
    );
    doc.components = components;
    doc
}

#[test]
fn test_widget_owner_resolution_root_vs_component() {
    let doc = create_sample_component_doc();

    // 1. Root container belongs to MainDocument
    let owner_root = resolve_widget_owner(&doc, "root_container").expect("root_container exists");
    assert_eq!(owner_root, WidgetLocation::MainDocument);

    let owner_title = resolve_widget_owner(&doc, "main_title").expect("main_title exists");
    assert_eq!(owner_title, WidgetLocation::MainDocument);

    // 2. Component children belong to Component
    let owner_header = resolve_widget_owner(&doc, "header_box").expect("header_box exists");
    match owner_header {
        WidgetLocation::Component { name, file_path } => {
            assert_eq!(name, "CustomHeader");
            assert_eq!(file_path, Some("src/components/custom_header.rs".to_string()));
        }
        _ => panic!("Expected WidgetLocation::Component"),
    }

    let owner_btn = resolve_widget_owner(&doc, "header_btn_logout").expect("header_btn_logout exists");
    match owner_btn {
        WidgetLocation::Component { name, .. } => {
            assert_eq!(name, "CustomHeader");
        }
        _ => panic!("Expected WidgetLocation::Component"),
    }

    // 3. Nonexistent widget
    assert!(resolve_widget_owner(&doc, "nonexistent_widget").is_none());
}

#[test]
fn test_cross_file_component_patching_safety() {
    let temp_dir = std::env::temp_dir().join(format!("rux_test_multifile_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir_all(temp_dir.join("src").join("components")).unwrap();

    let ui_generated_path = temp_dir.join("src").join("ui_generated.rs");
    let initial_ui_generated_code = r#"// Auto-generated UI by Ruxel Studio
pub mod components;
pub use components::*;

use iced::widget::{column, text};
use iced::Element;

pub fn view<'a>() -> Element<'a, ()> {
    column![
        text("Main Dashboard"),
        CustomHeader::view(),
    ].into()
}
"#;
    fs::write(&ui_generated_path, initial_ui_generated_code).unwrap();

    let custom_header_path = temp_dir.join("src").join("components").join("custom_header.rs");
    let initial_custom_header_code = r#"//! Custom Header Component
use iced::widget::{row, text, button};
use iced::Element;

pub struct CustomHeader;

impl CustomHeader {
    /// Renders the component view
    pub fn view<'a>() -> Element<'a, ()> {
        row![
            text("Original Header Title"),
            button(text("Logout")),
        ].into()
    }
}
"#;
    fs::write(&custom_header_path, initial_custom_header_code).unwrap();

    let doc = create_sample_component_doc();

    // 1. Resolve file path for the component widget
    let file_path = resolve_widget_file_path(&temp_dir, &doc, "header_title", TargetFramework::Iced)
        .expect("Should resolve component file path");
    assert_eq!(file_path, custom_header_path);

    // 2. Perform cross-file patch on header_title
    let report = AstPatcher::patch_multi_file(
        &temp_dir,
        &doc,
        "header_title",
        "text",
        &PropertyValue::Static("Enterprise Cloud Console".to_string()),
        TargetFramework::Iced,
    ).expect("Multi-file patch should succeed");

    assert!(report.applied_cleanly);
    assert_eq!(report.target_file, custom_header_path);
    assert!(report.patched_source.contains("text(\"Enterprise Cloud Console\")"));

    // Write the patched source back to disk as daemon does
    fs::write(&report.target_file, &report.patched_source).unwrap();

    // 3. Verify that src/ui_generated.rs is 100% UNTOUCHED
    let ui_generated_after = fs::read_to_string(&ui_generated_path).unwrap();
    assert_eq!(ui_generated_after, initial_ui_generated_code, "ui_generated.rs module declarations must remain untouched");

    // 4. Verify that comments and impl methods in custom_header.rs are preserved
    let custom_header_after = fs::read_to_string(&custom_header_path).unwrap();
    assert!(custom_header_after.contains("//! Custom Header Component"));
    assert!(custom_header_after.contains("/// Renders the component view"));
    assert!(custom_header_after.contains("impl CustomHeader"));
    assert!(custom_header_after.contains("text(\"Enterprise Cloud Console\")"));
    assert!(custom_header_after.contains("button(text(\"Logout\"))"));

    // Clean up
    let _ = fs::remove_dir_all(&temp_dir);
}
