use std::fs;
use std::path::PathBuf;

use rux_ast::document::RuxDocument;
use rux_ast::validator::DocumentValidator;
use rux_codegen::generator::CodeGenerator;
use rux_codegen::reverse_parser::ReverseParser;
use rux_codegen::{CodegenOptions, TargetFramework};

#[test]
fn test_examples_library_documents_validate_and_generate_clean_code() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir.parent().unwrap().parent().unwrap();
    let examples_dir = workspace_root.join("examples");

    let example_cases = vec![
        ("iced_todo_app", TargetFramework::Iced),
        ("dioxus_dashboard", TargetFramework::Dioxus),
        ("egui_settings_panel", TargetFramework::Egui),
    ];

    for (folder_name, framework) in example_cases {
        let app_rux_path = examples_dir.join(folder_name).join("app.rux");
        assert!(
            app_rux_path.exists(),
            "Example {} must contain an app.rux document at {:?}",
            folder_name,
            app_rux_path
        );

        let content = fs::read_to_string(&app_rux_path)
            .unwrap_or_else(|e| panic!("Failed to read {:?}: {}", app_rux_path, e));

        let mut doc = RuxDocument::from_json(&content)
            .unwrap_or_else(|e| panic!("Failed to deserialize {:?}: {}", app_rux_path, e));

        // 1. AST Validation
        let validator = DocumentValidator::new();
        let validation_res = validator.validate_json(&content);
        assert!(
            validation_res.is_ok(),
            "Example {} failed validation: {:?}",
            folder_name,
            validation_res.err()
        );

        // 2. Code Generation
        let options = CodegenOptions::default();
        let output = CodeGenerator::generate_for_framework(&doc, framework, None, &options)
            .unwrap_or_else(|e| panic!("Codegen failed for {} with framework {:?}: {}", folder_name, framework, e));

        assert_eq!(output.target_framework, framework);
        assert!(!output.ui_generated_code.is_empty());
        assert!(!output.controller_code.is_empty());

        // 3. Syn Parse Validation (ensure generated code is valid Rust syntax)
        let parsed_ui: Result<syn::File, _> = syn::parse_file(&output.ui_generated_code);
        assert!(
            parsed_ui.is_ok(),
            "Generated ui_generated.rs for {} must parse cleanly as Rust syntax: {:?}",
            folder_name,
            parsed_ui.err()
        );

        let parsed_ctrl: Result<syn::File, _> = syn::parse_file(&output.controller_code);
        assert!(
            parsed_ctrl.is_ok(),
            "Generated controller.rs for {} must parse cleanly as Rust syntax: {:?}",
            folder_name,
            parsed_ctrl.err()
        );

        // 4. Reverse Parser Roundtrip Verification
        let patch_res = ReverseParser::patch_document(&mut doc, &output.ui_generated_code, Some(framework));
        assert!(
            patch_res.is_ok(),
            "Reverse parser must successfully roundtrip code for {}: {:?}",
            folder_name,
            patch_res.err()
        );

        // 5. Ensure example src directory contains generated files
        let src_dir = examples_dir.join(folder_name).join("src");
        fs::create_dir_all(&src_dir).expect("create src dir");
        let ui_file = src_dir.join(&output.ui_generated_filename);
        let ctrl_file = src_dir.join(&output.controller_filename);
        if !ui_file.exists() {
            fs::write(&ui_file, &output.ui_generated_code).expect("write ui_generated.rs");
        }
        if !ctrl_file.exists() {
            fs::write(&ctrl_file, &output.controller_code).expect("write controller.rs");
        }
    }
}
