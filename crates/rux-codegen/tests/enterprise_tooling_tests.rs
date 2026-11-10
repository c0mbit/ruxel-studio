use std::collections::BTreeMap;
use rux_ast::document::{I18nConfig, RuxDocument};
use rux_ast::project::RuxProject;
use rux_ast::widget::{WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType};
use rux_codegen::{
    generate_localization_files, CodeGenerator, CodegenOptions, RouterGenerator, TargetFramework,
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
fn test_asset_macro_generation_iced_and_egui() {
    let mut root = create_test_node("root", WidgetType::VBox);
    let mut img = create_test_node("hero_image", WidgetType::Image);
    img.properties.image_path = Some("assets/hero.png".to_string());
    img.properties.image_alias = Some("hero_img".to_string());
    root.children.push(img);

    let doc = create_minimal_doc(root);
    let options = CodegenOptions::default();

    let iced_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Iced, None, &options)
        .expect("Iced codegen must succeed");
    assert!(iced_output.ui_generated_code.contains(r#"include_bytes!("assets/hero.png")"#));
    assert!(iced_output.ui_generated_code.contains("image(image::Handle::from_memory("));

    let egui_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Egui, None, &options)
        .expect("egui codegen must succeed");
    assert!(egui_output.ui_generated_code.contains(r#"include_bytes!("assets/hero.png")"#));
    assert!(egui_output.ui_generated_code.contains("egui::Image::from_bytes"));
}

#[test]
fn test_asset_macro_generation_fyne_and_flet() {
    let mut root = create_test_node("root", WidgetType::VBox);
    let mut img = create_test_node("logo_icon", WidgetType::Image);
    img.properties.image_path = Some("assets/logo.png".to_string());
    img.properties.image_alias = Some("logo".to_string());
    root.children.push(img);

    let doc = create_minimal_doc(root);
    let options = CodegenOptions::default();

    let fyne_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Fyne, None, &options)
        .expect("Fyne codegen must succeed");
    assert!(fyne_output.ui_generated_code.contains(r#"//go:embed assets/logo.png"#));
    assert!(fyne_output.ui_generated_code.contains("canvas.NewImageFromResource"));

    let flet_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Flet, None, &options)
        .expect("Flet codegen must succeed");
    assert!(flet_output.ui_generated_code.contains(r#"ft.Image(src="assets/logo.png")"#));
}

#[test]
fn test_localization_ftl_and_json_file_generation() {
    let root = create_test_node("root", WidgetType::VBox);
    let mut doc = create_minimal_doc(root);

    let mut en_map = BTreeMap::new();
    en_map.insert("login_title".to_string(), "Sign In".to_string());
    en_map.insert("welcome_msg".to_string(), "Welcome to Ruxel".to_string());

    let mut cs_map = BTreeMap::new();
    cs_map.insert("login_title".to_string(), "Přihlásit se".to_string());
    cs_map.insert("welcome_msg".to_string(), "Vítejte v Ruxelu".to_string());

    let mut locales = BTreeMap::new();
    locales.insert("en-US".to_string(), en_map);
    locales.insert("cs-CZ".to_string(), cs_map);

    doc.i18n = Some(I18nConfig {
        default_locale: "en-US".to_string(),
        locales,
    });

    let files = generate_localization_files(&doc);
    assert_eq!(files.len(), 4);

    let en_ftl = files.iter().find(|f| f.filename == "locales/en-US.ftl").expect("en-US.ftl must exist");
    assert!(en_ftl.content.contains("login_title = Sign In"));
    assert!(en_ftl.content.contains("welcome_msg = Welcome to Ruxel"));

    let cs_ftl = files.iter().find(|f| f.filename == "locales/cs-CZ.ftl").expect("cs-CZ.ftl must exist");
    assert!(cs_ftl.content.contains("login_title = Přihlásit se"));
    assert!(cs_ftl.content.contains("welcome_msg = Vítejte v Ruxelu"));

    let en_json = files.iter().find(|f| f.filename == "locales/en-US.json").expect("en-US.json must exist");
    let parsed_en: BTreeMap<String, String> = serde_json::from_str(&en_json.content).expect("Valid JSON");
    assert_eq!(parsed_en.get("login_title"), Some(&"Sign In".to_string()));

    let cs_json = files.iter().find(|f| f.filename == "locales/cs-CZ.json").expect("cs-CZ.json must exist");
    let parsed_cs: BTreeMap<String, String> = serde_json::from_str(&cs_json.content).expect("Valid JSON");
    assert_eq!(parsed_cs.get("login_title"), Some(&"Přihlásit se".to_string()));
}

#[test]
fn test_localization_macro_injection_in_views() {
    let mut root = create_test_node("root", WidgetType::VBox);
    let mut btn = create_test_node("submit_btn", WidgetType::Button);
    btn.properties.text = Some("Submit".into());
    btn.properties.text_key = Some("action_submit".to_string());
    root.children.push(btn);

    let doc = create_minimal_doc(root);
    let options = CodegenOptions::default();

    let iced_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Iced, None, &options)
        .expect("Iced codegen must succeed");
    assert!(iced_output.ui_generated_code.contains(r#"t!("action_submit")"#));

    let egui_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Egui, None, &options)
        .expect("egui codegen must succeed");
    assert!(egui_output.ui_generated_code.contains(r#"t!("action_submit")"#));

    let fyne_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Fyne, None, &options)
        .expect("Fyne codegen must succeed");
    assert!(fyne_output.ui_generated_code.contains(r#"i18n.Get("action_submit")"#));

    let flet_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Flet, None, &options)
        .expect("Flet codegen must succeed");
    assert!(flet_output.ui_generated_code.contains(r#"i18n.get("action_submit")"#));
}

#[test]
fn test_accessibility_attribute_bindings() {
    let mut root = create_test_node("root", WidgetType::VBox);
    let mut btn = create_test_node("pay_btn", WidgetType::Button);
    btn.properties.text = Some("Checkout".into());
    btn.properties.aria_label = Some("Complete your purchase".to_string());
    root.children.push(btn);

    let doc = create_minimal_doc(root);
    let options = CodegenOptions::default();

    let iced_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Iced, None, &options)
        .expect("Iced codegen must succeed");
    assert!(iced_output.ui_generated_code.contains(r#".explain("Complete your purchase")"#));

    let egui_output = CodeGenerator::generate_for_framework(&doc, TargetFramework::Egui, None, &options)
        .expect("egui codegen must succeed");
    assert!(egui_output.ui_generated_code.contains("egui::WidgetInfo::labeled"));
    assert!(egui_output.ui_generated_code.contains(r#""Complete your purchase""#));
}

#[test]
fn test_router_code_generation_multi_screen() {
    let mut project = RuxProject::new("MultiScreenEnterprise", "home_screen");
    project.add_screen("home_screen", "HomeScreen", "screens/home.rux", true);
    project.add_screen("profile_screen", "ProfileScreen", "screens/profile.rux", false);
    project.add_screen("settings_screen", "SettingsScreen", "screens/settings.rux", false);

    let rust_router = RouterGenerator::generate_router_file(&project, TargetFramework::Iced);
    assert_eq!(rust_router.filename, "router.rs");
    assert!(rust_router.content.contains("pub enum AppScreen"));
    assert!(rust_router.content.contains("HomeScreen,"));
    assert!(rust_router.content.contains("ProfileScreen,"));
    assert!(rust_router.content.contains("SettingsScreen,"));
    assert!(rust_router.content.contains("pub struct NavigationStack"));
    assert!(rust_router.content.contains("pub fn push(&mut self, target: AppScreen)"));
    assert!(rust_router.content.contains("pub fn pop(&mut self) -> bool"));
    assert!(rust_router.content.contains("AppScreen::HomeScreen"));

    let go_router = RouterGenerator::generate_router_file(&project, TargetFramework::Fyne);
    assert_eq!(go_router.filename, "router.go");
    assert!(go_router.content.contains("type AppScreen string"));
    assert!(go_router.content.contains(r#"ScreenHomeScreen AppScreen = "home_screen""#));
    assert!(go_router.content.contains(r#"ScreenProfileScreen AppScreen = "profile_screen""#));
    assert!(go_router.content.contains("type Router struct"));
    assert!(go_router.content.contains("func (r *Router) Navigate(screen AppScreen)"));

    let flet_router = RouterGenerator::generate_router_file(&project, TargetFramework::Flet);
    assert_eq!(flet_router.filename, "router.py");
    assert!(flet_router.content.contains("class AppRouter:"));
    assert!(flet_router.content.contains("def navigate(self, screen: str):"));
}
