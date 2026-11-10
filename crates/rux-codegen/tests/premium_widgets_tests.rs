use rux_ast::document::RuxDocument;
use rux_ast::widget::{TableColumn, WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType};
use rux_codegen::plugin::{CodeGenerator, CodegenOptions, TargetFramework};
use rux_codegen::plugins::egui::EguiPlugin;
use rux_codegen::plugins::flet::FletPlugin;
use rux_codegen::plugins::fyne::FynePlugin;
use rux_codegen::plugins::iced::IcedPlugin;
use rux_codegen::reverse_parser::ReverseParser;

fn create_sample_document(root: WidgetNode) -> RuxDocument {
    let sample_json = include_str!("../../../examples/sample_app.rux");
    let mut doc: RuxDocument = serde_json::from_str(sample_json).expect("Sample app must parse");
    doc.root = root;
    doc
}

fn create_node(id: &str, widget_type: WidgetType) -> WidgetNode {
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

#[test]
fn test_egui_codegen_datagrid() {
    let mut grid_node = create_node("my_grid", WidgetType::DataGrid);
    grid_node.properties.columns = vec![
        TableColumn {
            id: "col_1".to_string(),
            title: "Column A".to_string(),
            width: Some(100.0),
            field: Some("field_a".to_string()),
        },
        TableColumn {
            id: "col_2".to_string(),
            title: "Column B".to_string(),
            width: Some(150.0),
            field: Some("field_b".to_string()),
        },
    ];
    grid_node.properties.row_height = Some(26.0);
    grid_node.properties.total_rows = Some(500);

    let doc = create_sample_document(grid_node);
    let plugin = EguiPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("TableBuilder"));
    assert!(output.ui_generated_code.contains("Column A"));
    assert!(output.ui_generated_code.contains("Column B"));
    assert!(output.ui_generated_code.contains("body.rows"));
    assert!(output.ui_generated_code.contains("500"));
}

#[test]
fn test_egui_codegen_chart() {
    let mut chart_node = create_node("revenue_chart", WidgetType::Chart);
    chart_node.properties.text = Some("ARR Growth".into());

    let doc = create_sample_document(chart_node);
    let plugin = EguiPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("egui_plot::Plot::new"));
    assert!(output.ui_generated_code.contains("ARR Growth"));
    assert!(output.ui_generated_code.contains("plot_ui.line"));
}

#[test]
fn test_egui_codegen_treeview() {
    let mut tree_node = create_node("project_tree", WidgetType::TreeView);
    tree_node.properties.text = Some("Workspace".into());
    tree_node.children = vec![create_node("leaf_item", WidgetType::Label)];

    let doc = create_sample_document(tree_node);
    let plugin = EguiPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("egui::CollapsingHeader::new"));
    assert!(output.ui_generated_code.contains("Workspace"));
}

#[test]
fn test_iced_codegen_enterprise_widgets() {
    let mut container = create_node("root_col", WidgetType::VBox);
    let mut grid_node = create_node("table_grid", WidgetType::DataGrid);
    grid_node.properties.text = Some("Enterprise Table".into());
    let mut chart_node = create_node("analytics_chart", WidgetType::Chart);
    chart_node.properties.text = Some("Performance Series".into());
    let mut tree_node = create_node("file_tree", WidgetType::TreeView);
    tree_node.properties.text = Some("File System".into());
    let mut view3d_node = create_node("viewport", WidgetType::Viewport3D);
    view3d_node.properties.model_3d_path = Some("assets/cube.gltf".to_string());

    container.children = vec![grid_node, chart_node, tree_node, view3d_node];

    let doc = create_sample_document(container);
    let plugin = IcedPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("Virtualized DataGrid"));
    assert!(output.ui_generated_code.contains("Performance Series"));
    assert!(output.ui_generated_code.contains("File System"));
    assert!(output.ui_generated_code.contains("3D Viewport"));
    assert!(output.ui_generated_code.contains("assets/cube.gltf"));
}

#[test]
fn test_go_fyne_codegen_enterprise_widgets() {
    let mut container = create_node("root_vbox", WidgetType::VBox);
    container.children = vec![
        create_node("data_table", WidgetType::DataGrid),
        create_node("kpi_chart", WidgetType::Chart),
        create_node("outline_tree", WidgetType::TreeView),
        create_node("scene3d", WidgetType::Viewport3D),
    ];

    let doc = create_sample_document(container);
    let plugin = FynePlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("widget.NewTable"));
    assert!(output.ui_generated_code.contains("widget.NewTree"));
    assert!(output.ui_generated_code.contains("Analytical Chart"));
    assert!(output.ui_generated_code.contains("3D Viewport"));
}

#[test]
fn test_flet_codegen_enterprise_widgets() {
    let mut container = create_node("root_column", WidgetType::VBox);
    container.children = vec![
        create_node("py_datagrid", WidgetType::DataGrid),
        create_node("py_chart", WidgetType::Chart),
        create_node("py_tree", WidgetType::TreeView),
        create_node("py_3d", WidgetType::Viewport3D),
    ];

    let doc = create_sample_document(container);
    let plugin = FletPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("ft.DataTable"));
    assert!(output.ui_generated_code.contains("ft.LineChart"));
    assert!(output.ui_generated_code.contains("ft.ExpansionTile"));
    assert!(output.ui_generated_code.contains("3D Viewport"));
}

#[test]
fn test_reverse_parser_enterprise_resilience() {
    let mut container = create_node("root", WidgetType::VBox);
    let mut btn = create_node("btn_test", WidgetType::Button);
    btn.properties.text = Some("Old Name".into());
    let grid = create_node("grid_test", WidgetType::DataGrid);
    container.children = vec![btn, grid];

    let mut doc = create_sample_document(container);

    let egui_code = r#"
pub fn render_ui<H: UiHandler>(ui: &mut egui::Ui, state: &mut AppState, handler: &mut H) {
    ui.vertical(|ui| {
        let _ = ui.button("New Patched Name");
        egui_extras::TableBuilder::new(ui)
            .id_salt("grid_test")
            .striped(true)
            .header(20.0, |mut h| { h.col(|ui| { ui.label("Col"); }); })
            .body(|b| { b.rows(24.0, 10, |mut r| { r.col(|ui| { ui.label("val"); }); }); });
    });
}
"#;

    let report = ReverseParser::patch_document(&mut doc, egui_code, Some(TargetFramework::Egui)).unwrap();
    assert_eq!(report.patched_nodes_count, 1);
    assert_eq!(doc.root.children[0].properties.text.as_deref(), Some("New Patched Name"));
}
