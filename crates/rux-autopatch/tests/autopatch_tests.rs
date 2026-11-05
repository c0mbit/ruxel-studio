use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use rux_autopatch::analyzer::{ChangeCategory, DiffAnalyzer};
use rux_autopatch::http::{HttpResponse, MockHttpTransport};
use rux_autopatch::llm::{
    extract_code_from_markdown, sanitize_zero_comments, LlmPatchEngine, LlmProvider,
};
use rux_autopatch::monitor::{clean_semver, is_newer_version, ReleaseMonitor};
use rux_autopatch::sandbox::{
    bump_patch_version, CommandOutput, MockCommandRunner, SandboxVerifier,
};
use rux_autopatch::version_config::{
    AutopatchReport, FrameworkMeta, FrameworkVersionsConfig,
};

#[test]
fn test_semver_cleaning_and_comparison() {
    assert_eq!(clean_semver("v0.13.1"), "0.13.1");
    assert_eq!(clean_semver("V1.8.0"), "1.8.0");
    assert_eq!(clean_semver("0.29.1-beta.1"), "0.29.1");
    assert_eq!(clean_semver("v2.5.0"), "2.5.0");

    assert!(is_newer_version("0.13.2", "0.13.1"));
    assert!(is_newer_version("1.0.0", "0.9.9"));
    assert!(is_newer_version("0.30.0", "0.29.1"));
    assert!(!is_newer_version("0.13.1", "0.13.1"));
    assert!(!is_newer_version("0.12.9", "0.13.0"));
    assert!(!is_newer_version("1.8.0", "1.8.1"));
}

#[test]
fn test_github_release_monitor_detection() {
    let transport = Arc::new(MockHttpTransport::new());

    let release_json = serde_json::json!({
        "tag_name": "v0.14.0",
        "name": "Iced 0.14.0",
        "body": "Major release with widget constructor updates and improved layout",
        "published_at": "2026-11-05T00:00:00Z",
        "html_url": "https://github.com/iced-rs/iced/releases/tag/v0.14.0"
    });

    transport.set_response(
        "https://api.github.com/repos/iced-rs/iced/releases/latest",
        HttpResponse::ok(serde_json::to_string(&release_json).unwrap()),
    );

    let monitor = ReleaseMonitor::new(transport, None);
    let meta = FrameworkMeta {
        repo: "iced-rs/iced".to_string(),
        current_version: "0.13.1".to_string(),
        target_crate: "iced".to_string(),
        plugin_path: "crates/rux-codegen/src/plugins/iced.rs".to_string(),
        last_checked: "2026-11-05T00:00:00Z".to_string(),
    };

    let result = monitor.check_framework("iced", &meta).unwrap();
    assert!(result.is_some());
    let release_info = result.unwrap();
    assert_eq!(release_info.version, "0.14.0");
    assert_eq!(release_info.tag_name, "v0.14.0");

    let up_to_date_meta = FrameworkMeta {
        current_version: "0.14.0".to_string(),
        ..meta
    };
    let up_to_date_result = monitor.check_framework("iced", &up_to_date_meta).unwrap();
    assert!(up_to_date_result.is_none());
}

#[test]
fn test_diff_analyzer_heuristic_classification() {
    let transport = Arc::new(MockHttpTransport::new());
    let analyzer = DiffAnalyzer::new(transport, None);

    let changelog = r#"
# Release Notes 0.14.0
- Breaking: button constructor takes new parameters for styling
- Breaking: rsx! macro updated with stricter attribute checking
- Breaking: trait Widget requires updated draw signature
- Breaking: layout Length enum now supports FillPortion
- Deprecated old animation controller in favor of spring physics
"#;

    let report = analyzer.analyze_release_notes("iced", "0.13.1", "0.14.0", changelog);
    assert_eq!(report.framework_id, "iced");
    assert_eq!(report.from_version, "0.13.1");
    assert_eq!(report.to_version, "0.14.0");

    let has_constructor = report.breaking_changes.iter().any(|c| c.category == ChangeCategory::Constructor);
    let has_macro = report.breaking_changes.iter().any(|c| c.category == ChangeCategory::Macro);
    let has_trait = report.breaking_changes.iter().any(|c| c.category == ChangeCategory::Trait);
    let has_layout = report.breaking_changes.iter().any(|c| c.category == ChangeCategory::Layout);

    assert!(has_constructor);
    assert!(has_macro);
    assert!(has_trait);
    assert!(has_layout);
}

#[test]
fn test_llm_markdown_extraction_and_zero_comments_sanitizer() {
    let raw_llm_response = concat!(
        "Here is the updated code generator plugin:\n\n```rust\nuse rux_ast::document::RuxDocument;\n\n",
        "pub struct IcedPlugin {\n    pub name: String,\n}\n\n",
        "impl IcedPlugin {\n    pub fn new() -> Self {\n        let msg = \"\x2F\x2F not a comment inside string\";\n",
        "        Self {\n            name: \"iced\".to_string(),\n        }\n    }\n}\n```\n\nThis concludes the updated code."
    );

    let extracted = extract_code_from_markdown(raw_llm_response);
    assert!(extracted.contains("pub struct IcedPlugin"));
    assert!(!extracted.starts_with("```rust"));

    let slc = "\x2F\x2F Single line comment";
    let bc = "\x2F\x2A Block comment \x2A\x2F";
    let dc = "\x2F\x2F\x2F Doc comment";
    let ac = "\x2F\x2F Another comment";
    let preserved_quote = "\"\x2F\x2F this is inside quotes and must be preserved\"";
    let code_with_comments = format!(
        "{slc}\npub struct Widget {{\n    {bc}\n    pub id: String,\n    {dc}\n    pub title: String,\n}}\n{ac}\nimpl Widget {{\n    pub fn id_str(&self) -> &str {{\n        {preserved_quote}\n    }}\n}}\n"
    );

    let sanitized = sanitize_zero_comments(&code_with_comments);
    assert!(!sanitized.contains(slc));
    assert!(!sanitized.contains(bc));
    assert!(!sanitized.contains(dc));
    assert!(!sanitized.contains(ac));
    assert!(sanitized.contains(preserved_quote));
    assert!(sanitized.contains("pub struct Widget"));
}

#[test]
fn test_self_healing_compiler_loop_broken_attempt1_healed_attempt2() {
    let temp_dir = std::env::temp_dir().join("rux_autopatch_test_sandbox");
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    let plugin_dir = temp_dir.join("plugins");
    fs::create_dir_all(&plugin_dir).unwrap();
    let plugin_file = plugin_dir.join("iced.rs");
    fs::write(&plugin_file, "pub fn original_generator() -> bool { true }\n").unwrap();

    let check_responses = vec![
        CommandOutput {
            success: false,
            exit_code: 1,
            stdout: String::new(),
            stderr: "error[E0425]: cannot find function `old_widget_fn` in this scope\n  --> crates/rux-codegen/src/plugins/iced.rs:10:5".to_string(),
        },
        CommandOutput {
            success: true,
            exit_code: 0,
            stdout: "Finished dev target(s) in 0.10s".to_string(),
            stderr: String::new(),
        },
    ];

    let test_responses = vec![
        CommandOutput {
            success: true,
            exit_code: 0,
            stdout: "test result: ok. 16 passed".to_string(),
            stderr: String::new(),
        },
    ];

    let runner = Arc::new(MockCommandRunner::new(check_responses, test_responses));

    let transport = Arc::new(MockHttpTransport::new());
    transport.add_handler(|_method, _url, _body| {
        let healed_code_json = serde_json::json!({
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": "```rust\npub fn healed_widget_fn() -> bool { true }\n```"
                            }
                        ]
                    }
                }
            ]
        });
        Ok(HttpResponse::ok(serde_json::to_string(&healed_code_json).unwrap()))
    });

    let llm_engine = Arc::new(LlmPatchEngine::new(
        LlmProvider::Gemini,
        "AIzaTestKeyMock".to_string(),
        Some("gemini-1.5-pro".to_string()),
        transport,
    ));

    let sandbox = SandboxVerifier::new(temp_dir.clone(), runner, llm_engine, 5);

    let initial_broken_code = "pub fn old_widget_fn() -> bool { false }\n";
    let rel_path = Path::new("plugins/iced.rs");

    let result = sandbox.verify_and_heal(initial_broken_code, "iced", rel_path).unwrap();

    assert_eq!(result.attempts_used, 2);
    assert!(result.healed_code.contains("pub fn healed_widget_fn"));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_version_bump_patch_logic() {
    assert_eq!(bump_patch_version("0.1.0"), "0.1.1");
    assert_eq!(bump_patch_version("1.2.3"), "1.2.4");
    assert_eq!(bump_patch_version("0.24.9"), "0.24.10");
    assert_eq!(bump_patch_version("2.5.0"), "2.5.1");
}

#[test]
fn test_version_config_persistence_and_reporting() {
    let temp_dir = std::env::temp_dir().join("rux_autopatch_test_config");
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).unwrap();

    let config_path = temp_dir.join("framework_versions.json");

    let mut frameworks = HashMap::new();
    frameworks.insert(
        "iced".to_string(),
        FrameworkMeta {
            repo: "iced-rs/iced".to_string(),
            current_version: "0.13.1".to_string(),
            target_crate: "iced".to_string(),
            plugin_path: "crates/rux-codegen/src/plugins/iced.rs".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
    );

    let config = FrameworkVersionsConfig {
        frameworks,
        last_sync: "2026-11-05T00:00:00Z".to_string(),
        recent_reports: Vec::new(),
    };

    config.save_to_path(&config_path).unwrap();

    let mut loaded = FrameworkVersionsConfig::load_from_path(&config_path).unwrap();
    assert_eq!(loaded.frameworks.get("iced").unwrap().current_version, "0.13.1");

    loaded.update_framework_version("iced", "0.14.0", "2026-11-05T22:00:00Z");
    loaded.record_report(AutopatchReport {
        framework_id: "iced".to_string(),
        from_version: "0.13.1".to_string(),
        to_version: "0.14.0".to_string(),
        timestamp: "2026-11-05T22:00:00Z".to_string(),
        status: "synced".to_string(),
        attempts: 2,
        error_message: None,
    });

    loaded.save_to_path(&config_path).unwrap();

    let reloaded = FrameworkVersionsConfig::load_from_path(&config_path).unwrap();
    assert_eq!(reloaded.frameworks.get("iced").unwrap().current_version, "0.14.0");
    assert_eq!(reloaded.recent_reports.len(), 1);
    assert_eq!(reloaded.recent_reports[0].attempts, 2);

    let _ = fs::remove_dir_all(&temp_dir);
}
