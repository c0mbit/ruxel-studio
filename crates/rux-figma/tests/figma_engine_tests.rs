use std::collections::HashMap;
use std::sync::Arc;

use rux_ast::layout::{ContainerLayout, FlexDirection, JustifyContent};
use rux_ast::widget::WidgetType;
use rux_figma::client::{FigmaClient, MockHttpTransport};
use rux_figma::engine::{FigmaEngine, FigmaImportEngineParams};
use rux_figma::geometry::GeometryResolver;
use rux_figma::models::{
    FigmaBoundingBox, FigmaColor, FigmaNode, FigmaPaint, FigmaTypeStyle,
};

#[test]
fn test_parse_figma_url_variants() {
    let url_standard = "https://www.figma.com/file/aBcDeFgHiJk/Design-System?node-id=10%3A20";
    let (key, node) = FigmaClient::parse_figma_url(url_standard).unwrap();
    assert_eq!(key, "aBcDeFgHiJk");
    assert_eq!(node, Some("10:20".to_string()));

    let url_design = "https://www.figma.com/design/XYZ987654321/App-Layout?node-id=123-456";
    let (key_design, node_design) = FigmaClient::parse_figma_url(url_design).unwrap();
    assert_eq!(key_design, "XYZ987654321");
    assert_eq!(node_design, Some("123:456".to_string()));

    let raw_key = "PureFileKey12345";
    let (key_raw, node_raw) = FigmaClient::parse_figma_url(raw_key).unwrap();
    assert_eq!(key_raw, "PureFileKey12345");
    assert_eq!(node_raw, None);
}

#[test]
fn test_geometry_resolver_auto_layout() {
    let resolver = GeometryResolver::new();

    let node_row = FigmaNode {
        id: "1:2".to_string(),
        name: "Navbar".to_string(),
        node_type: "FRAME".to_string(),
        visible: true,
        children: Vec::new(),
        absolute_bounding_box: Some(FigmaBoundingBox {
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 64.0,
        }),
        layout_mode: Some("HORIZONTAL".to_string()),
        primary_axis_sizing_mode: Some("FIXED".to_string()),
        counter_axis_sizing_mode: Some("AUTO".to_string()),
        primary_axis_align_items: Some("SPACE_BETWEEN".to_string()),
        counter_axis_align_items: Some("CENTER".to_string()),
        padding_left: Some(24.0),
        padding_right: Some(24.0),
        padding_top: Some(12.0),
        padding_bottom: Some(12.0),
        item_spacing: Some(16.0),
        layout_grow: None,
        layout_align: None,
        fills: Vec::new(),
        strokes: Vec::new(),
        stroke_weight: None,
        corner_radius: None,
        rectangle_corner_radii: None,
        effects: Vec::new(),
        opacity: None,
        characters: None,
        style: None,
        component_id: None,
    };

    let layout = resolver.resolve_node_layout(&node_row);
    assert_eq!(layout.spacing.padding.left, 24.0);
    assert_eq!(layout.spacing.padding.top, 12.0);

    match layout.container.unwrap() {
        ContainerLayout::Flex(flex) => {
            assert_eq!(flex.direction, FlexDirection::Row);
            assert_eq!(flex.gap, 16.0);
            assert_eq!(flex.justify_content, JustifyContent::SpaceBetween);
        }
        _ => panic!("Expected Flex container layout"),
    }
}

#[test]
fn test_geometry_resolver_freeform_row_clustering() {
    let resolver = GeometryResolver::new();

    let parent_box = FigmaBoundingBox {
        x: 0.0,
        y: 0.0,
        width: 1000.0,
        height: 600.0,
    };

    let item_1 = (
        rux_ast::widget::WidgetNode {
            id: "btn1".to_string(),
            widget_type: WidgetType::Button,
            slot: None,
            properties: Default::default(),
            layout: None,
            events: Default::default(),
            bindings: Default::default(),
            animations: Vec::new(),
            children: Vec::new(),
        },
        FigmaBoundingBox {
            x: 50.0,
            y: 100.0,
            width: 120.0,
            height: 40.0,
        },
    );

    let item_2 = (
        rux_ast::widget::WidgetNode {
            id: "btn2".to_string(),
            widget_type: WidgetType::Button,
            slot: None,
            properties: Default::default(),
            layout: None,
            events: Default::default(),
            bindings: Default::default(),
            animations: Vec::new(),
            children: Vec::new(),
        },
        FigmaBoundingBox {
            x: 190.0,
            y: 102.0,
            width: 120.0,
            height: 40.0,
        },
    );

    let item_3 = (
        rux_ast::widget::WidgetNode {
            id: "txt1".to_string(),
            widget_type: WidgetType::TextInput,
            slot: None,
            properties: Default::default(),
            layout: None,
            events: Default::default(),
            bindings: Default::default(),
            animations: Vec::new(),
            children: Vec::new(),
        },
        FigmaBoundingBox {
            x: 50.0,
            y: 200.0,
            width: 300.0,
            height: 44.0,
        },
    );

    let clustered = resolver.resolve_freeform_children(&parent_box, vec![item_1, item_2, item_3]);

    assert_eq!(clustered.len(), 2);
    assert_eq!(clustered[0].widget_type, WidgetType::HBox);
    assert_eq!(clustered[0].children.len(), 2);
    assert_eq!(clustered[1].widget_type, WidgetType::TextInput);
}

#[test]
fn test_heuristic_classifier_button_and_input() {
    let engine = FigmaEngine::new();

    let text_child = FigmaNode {
        id: "2:1".to_string(),
        name: "Label".to_string(),
        node_type: "TEXT".to_string(),
        visible: true,
        children: Vec::new(),
        absolute_bounding_box: Some(FigmaBoundingBox {
            x: 60.0,
            y: 110.0,
            width: 80.0,
            height: 20.0,
        }),
        layout_mode: None,
        primary_axis_sizing_mode: None,
        counter_axis_sizing_mode: None,
        primary_axis_align_items: None,
        counter_axis_align_items: None,
        padding_left: None,
        padding_right: None,
        padding_top: None,
        padding_bottom: None,
        item_spacing: None,
        layout_grow: None,
        layout_align: None,
        fills: vec![FigmaPaint {
            paint_type: "SOLID".to_string(),
            visible: true,
            opacity: None,
            color: Some(FigmaColor {
                r: 1.0,
                g: 1.0,
                b: 1.0,
                a: 1.0,
            }),
            blend_mode: None,
        }],
        strokes: Vec::new(),
        stroke_weight: None,
        corner_radius: None,
        rectangle_corner_radii: None,
        effects: Vec::new(),
        opacity: None,
        characters: Some("Save Changes".to_string()),
        style: Some(FigmaTypeStyle {
            font_family: "Inter".to_string(),
            font_weight: 600.0,
            font_size: 14.0,
            text_align_horizontal: Some("CENTER".to_string()),
            text_align_vertical: None,
            letter_spacing: None,
            line_height_px: None,
            italic: false,
        }),
        component_id: None,
    };

    let button_frame = FigmaNode {
        id: "2:0".to_string(),
        name: "btn_primary".to_string(),
        node_type: "FRAME".to_string(),
        visible: true,
        children: vec![text_child],
        absolute_bounding_box: Some(FigmaBoundingBox {
            x: 50.0,
            y: 100.0,
            width: 140.0,
            height: 44.0,
        }),
        layout_mode: Some("HORIZONTAL".to_string()),
        primary_axis_sizing_mode: Some("FIXED".to_string()),
        counter_axis_sizing_mode: Some("FIXED".to_string()),
        primary_axis_align_items: Some("CENTER".to_string()),
        counter_axis_align_items: Some("CENTER".to_string()),
        padding_left: Some(16.0),
        padding_right: Some(16.0),
        padding_top: Some(12.0),
        padding_bottom: Some(12.0),
        item_spacing: Some(8.0),
        layout_grow: None,
        layout_align: None,
        fills: vec![FigmaPaint {
            paint_type: "SOLID".to_string(),
            visible: true,
            opacity: None,
            color: Some(FigmaColor {
                r: 0.1,
                g: 0.5,
                b: 0.9,
                a: 1.0,
            }),
            blend_mode: None,
        }],
        strokes: Vec::new(),
        stroke_weight: None,
        corner_radius: Some(8.0),
        rectangle_corner_radii: None,
        effects: Vec::new(),
        opacity: None,
        characters: None,
        style: None,
        component_id: None,
    };

    let mut counter = 0;
    let dummy_assets = rux_figma::downloader::DownloadedAssetsReport {
        registry: Default::default(),
        downloaded_files: Vec::new(),
        node_icon_map: HashMap::new(),
    };

    let converted = engine.convert_node_recursive(&button_frame, &dummy_assets, &mut counter);
    assert_eq!(converted.widget_type, WidgetType::Button);
    assert_eq!(converted.properties.text, Some("Save Changes".to_string()));
    assert_eq!(converted.properties.corner_radius, Some(8.0));
    assert!(converted.children.is_empty());
}

#[test]
fn test_full_pipeline_mock_import() {
    let mock_transport = Arc::new(MockHttpTransport::new());

    let figma_json = r##"{
        "name": "Dashboard Frame",
        "lastModified": "2026-11-05T12:00:00Z",
        "thumbnailUrl": null,
        "nodes": {
            "1:10": {
                "document": {
                    "id": "1:10",
                    "name": "Main Dashboard",
                    "type": "FRAME",
                    "visible": true,
                    "children": [
                        {
                            "id": "1:11",
                            "name": "#button Submit",
                            "type": "FRAME",
                            "visible": true,
                            "children": [
                                {
                                    "id": "1:12",
                                    "name": "Text",
                                    "type": "TEXT",
                                    "visible": true,
                                    "children": [],
                                    "characters": "Submit Form",
                                    "style": {
                                        "fontFamily": "Roboto",
                                        "fontWeight": 700,
                                        "fontSize": 16
                                    }
                                }
                            ],
                            "absoluteBoundingBox": { "x": 100, "y": 100, "width": 120, "height": 40 },
                            "cornerRadius": 6
                        },
                        {
                            "id": "1:13",
                            "name": "Input Username",
                            "type": "FRAME",
                            "visible": true,
                            "children": [
                                {
                                    "id": "1:14",
                                    "name": "Placeholder",
                                    "type": "TEXT",
                                    "visible": true,
                                    "children": [],
                                    "characters": "Enter username...",
                                    "style": {
                                        "fontFamily": "Roboto",
                                        "fontWeight": 400,
                                        "fontSize": 14
                                    }
                                }
                            ],
                            "absoluteBoundingBox": { "x": 100, "y": 160, "width": 240, "height": 40 }
                        }
                    ],
                    "absoluteBoundingBox": { "x": 0, "y": 0, "width": 1200, "height": 800 },
                    "layoutMode": "VERTICAL",
                    "itemSpacing": 20,
                    "paddingLeft": 32,
                    "paddingRight": 32,
                    "paddingTop": 32,
                    "paddingBottom": 32
                }
            }
        }
    }"##;

    mock_transport.set_response(
        "https://api.figma.com/v1/files/TestKey123/nodes?ids=1:10",
        figma_json.as_bytes().to_vec(),
    );

    let engine = FigmaEngine::new();
    let result = engine
        .import(FigmaImportEngineParams {
            token: "figd_mock_token".to_string(),
            file_key_or_url: "TestKey123",
            node_id: Some("1:10"),
            project_dir: None,
            custom_transport: Some(mock_transport),
        })
        .unwrap();

    assert_eq!(result.document.window.title, "Main Dashboard");
    assert_eq!(result.imported_node_count, 3);
    assert_eq!(result.document.root.widget_type, WidgetType::VBox);
    assert_eq!(result.document.root.children.len(), 2);
    assert_eq!(result.document.root.children[0].widget_type, WidgetType::Button);
    assert_eq!(
        result.document.root.children[0].properties.text,
        Some("Submit Form".to_string())
    );
    assert_eq!(
        result.document.root.children[1].widget_type,
        WidgetType::TextInput
    );
    assert_eq!(
        result.document.root.children[1].properties.placeholder,
        Some("Enter username...".to_string())
    );
}
