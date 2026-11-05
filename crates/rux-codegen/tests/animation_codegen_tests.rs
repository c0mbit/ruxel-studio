use rux_ast::document::RuxDocument;
use rux_ast::widget::{
    AnimatedProperty, AnimationDefinition, AnimationTrigger, InterpolationCurve, WidgetBindings,
    WidgetEvents, WidgetNode, WidgetProperties, WidgetType,
};
use rux_codegen::plugin::{CodeGenerator, CodegenOptions, TargetFramework};
use rux_codegen::plugins::egui::EguiPlugin;
use rux_codegen::plugins::flet::FletPlugin;
use rux_codegen::plugins::fyne::FynePlugin;
use rux_codegen::plugins::iced::IcedPlugin;
use rux_codegen::view::generate_theme_file;

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
fn test_egui_animation_state_tracking() {
    let mut btn = create_node("anim_btn", WidgetType::Button);
    btn.properties.text = Some("Animated Action".to_string());
    btn.animations = vec![
        AnimationDefinition {
            id: "fade_in".to_string(),
            trigger: AnimationTrigger::OnMount,
            property: AnimatedProperty::Opacity,
            from_value: serde_json::json!(0.0),
            to_value: serde_json::json!(1.0),
            duration_ms: 600.0,
            delay_ms: Some(50.0),
            curve: InterpolationCurve::EaseInOut,
            spring_stiffness: None,
            spring_damping: None,
            iterations: Some(1),
            auto_reverse: None,
        },
        AnimationDefinition {
            id: "spring_scale".to_string(),
            trigger: AnimationTrigger::OnHover,
            property: AnimatedProperty::Scale,
            from_value: serde_json::json!(1.0),
            to_value: serde_json::json!(1.15),
            duration_ms: 300.0,
            delay_ms: None,
            curve: InterpolationCurve::Spring,
            spring_stiffness: Some(220.0),
            spring_damping: Some(14.0),
            iterations: None,
            auto_reverse: Some(true),
        },
    ];

    let doc = create_sample_document(btn);
    let plugin = EguiPlugin::new();
    let output = plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();

    assert!(output.ui_generated_code.contains("animate_value_with_time"));
    assert!(output.ui_generated_code.contains("anim_btn_fade_in"));
    assert!(output.ui_generated_code.contains("anim_btn_spring_scale"));
    assert!(output.ui_generated_code.contains("0.6f32"));
    assert!(output.ui_generated_code.contains("0.3f32"));
}

#[test]
fn test_multi_framework_theme_file_codegen() {
    let doc = create_sample_document(create_node("root", WidgetType::VBox));

    let rust_theme = generate_theme_file(&doc, TargetFramework::Egui);
    assert_eq!(rust_theme.filename, "theme.rs");
    assert!(rust_theme.content.contains("pub struct AppTheme"));
    assert!(rust_theme.content.contains("pub struct ColorPalette"));
    assert!(rust_theme.content.contains("pub struct ShapeRadii"));
    assert!(rust_theme.content.contains("pub const THEME: AppTheme"));
    assert!(rust_theme.content.contains("pub fn active_palette"));

    let go_theme = generate_theme_file(&doc, TargetFramework::Fyne);
    assert_eq!(go_theme.filename, "theme.go");
    assert!(go_theme.content.contains("type AppTheme struct"));
    assert!(go_theme.content.contains("type ColorPalette struct"));
    assert!(go_theme.content.contains("var Theme = AppTheme{"));
    assert!(go_theme.content.contains("func (t *AppTheme) ActivePalette()"));

    let py_theme = generate_theme_file(&doc, TargetFramework::Flet);
    assert_eq!(py_theme.filename, "theme.py");
    assert!(py_theme.content.contains("@dataclass\nclass AppTheme:"));
    assert!(py_theme.content.contains("THEME = AppTheme("));
}

#[test]
fn test_auxiliary_files_exported_across_plugins() {
    let doc = create_sample_document(create_node("root", WidgetType::VBox));

    let egui_plugin = EguiPlugin::new();
    let egui_out = egui_plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(egui_out.auxiliary_files.iter().any(|f| f.filename == "theme.rs"));

    let iced_plugin = IcedPlugin::new();
    let iced_out = iced_plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(iced_out.auxiliary_files.iter().any(|f| f.filename == "theme.rs"));

    let fyne_plugin = FynePlugin::new();
    let fyne_out = fyne_plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(fyne_out.auxiliary_files.iter().any(|f| f.filename == "theme.go"));

    let flet_plugin = FletPlugin::new();
    let flet_out = flet_plugin.generate(&doc, &[], &[], None, &CodegenOptions::default()).unwrap();
    assert!(flet_out.auxiliary_files.iter().any(|f| f.filename == "theme.py"));
}

#[test]
fn test_animation_ast_roundtrip() {
    let anim = AnimationDefinition {
        id: "spring_bounce".to_string(),
        trigger: AnimationTrigger::StateChange,
        property: AnimatedProperty::TranslationY,
        from_value: serde_json::json!(-50.0),
        to_value: serde_json::json!(0.0),
        duration_ms: 750.0,
        delay_ms: Some(100.0),
        curve: InterpolationCurve::Spring,
        spring_stiffness: Some(300.0),
        spring_damping: Some(18.0),
        iterations: Some(1),
        auto_reverse: Some(false),
    };

    let serialized = serde_json::to_string(&anim).unwrap();
    let deserialized: AnimationDefinition = serde_json::from_str(&serialized).unwrap();

    assert_eq!(deserialized.id, "spring_bounce");
    assert_eq!(deserialized.trigger, AnimationTrigger::StateChange);
    assert_eq!(deserialized.property, AnimatedProperty::TranslationY);
    assert_eq!(deserialized.curve, InterpolationCurve::Spring);
    assert_eq!(deserialized.spring_stiffness, Some(300.0));
    assert_eq!(deserialized.spring_damping, Some(18.0));
}

