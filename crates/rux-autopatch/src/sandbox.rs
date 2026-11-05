use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use crate::error::AutopatchError;
use crate::llm::LlmPatchEngine;
use crate::version_config::{AutopatchReport, FrameworkVersionsConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandOutput {
    pub success: bool,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub trait CommandRunner: Send + Sync {
    fn run_cargo_check(&self, workspace_root: &Path) -> Result<CommandOutput, AutopatchError>;
    fn run_cargo_test(&self, workspace_root: &Path, test_target: &str) -> Result<CommandOutput, AutopatchError>;
}

pub struct DefaultCommandRunner;

impl DefaultCommandRunner {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DefaultCommandRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl CommandRunner for DefaultCommandRunner {
    fn run_cargo_check(&self, workspace_root: &Path) -> Result<CommandOutput, AutopatchError> {
        let output = Command::new("cargo")
            .arg("check")
            .arg("-p")
            .arg("rux-codegen")
            .current_dir(workspace_root)
            .output()?;

        let success = output.status.success();
        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(CommandOutput {
            success,
            exit_code,
            stdout,
            stderr,
        })
    }

    fn run_cargo_test(&self, workspace_root: &Path, test_target: &str) -> Result<CommandOutput, AutopatchError> {
        let mut cmd = Command::new("cargo");
        cmd.arg("test")
            .arg("-p")
            .arg("rux-codegen")
            .current_dir(workspace_root);

        if !test_target.is_empty() {
            cmd.arg("--test").arg(test_target);
        }

        let output = cmd.output()?;
        let success = output.status.success();
        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(CommandOutput {
            success,
            exit_code,
            stdout,
            stderr,
        })
    }
}

pub struct MockCommandRunner {
    check_responses: Mutex<Vec<CommandOutput>>,
    test_responses: Mutex<Vec<CommandOutput>>,
}

impl MockCommandRunner {
    pub fn new(
        check_responses: Vec<CommandOutput>,
        test_responses: Vec<CommandOutput>,
    ) -> Self {
        Self {
            check_responses: Mutex::new(check_responses),
            test_responses: Mutex::new(test_responses),
        }
    }
}

impl CommandRunner for MockCommandRunner {
    fn run_cargo_check(&self, _workspace_root: &Path) -> Result<CommandOutput, AutopatchError> {
        let mut responses = self.check_responses.lock().unwrap();
        if !responses.is_empty() {
            Ok(responses.remove(0))
        } else {
            Ok(CommandOutput {
                success: true,
                exit_code: 0,
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }

    fn run_cargo_test(&self, _workspace_root: &Path, _test_target: &str) -> Result<CommandOutput, AutopatchError> {
        let mut responses = self.test_responses.lock().unwrap();
        if !responses.is_empty() {
            Ok(responses.remove(0))
        } else {
            Ok(CommandOutput {
                success: true,
                exit_code: 0,
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }
}

#[derive(Debug, Clone)]
pub struct HealResult {
    pub healed_code: String,
    pub attempts_used: usize,
    pub test_output: String,
}

pub struct SandboxVerifier {
    workspace_root: PathBuf,
    runner: Arc<dyn CommandRunner>,
    llm_engine: Arc<LlmPatchEngine>,
    max_retries: usize,
}

impl SandboxVerifier {
    pub fn new(
        workspace_root: PathBuf,
        runner: Arc<dyn CommandRunner>,
        llm_engine: Arc<LlmPatchEngine>,
        max_retries: usize,
    ) -> Self {
        Self {
            workspace_root,
            runner,
            llm_engine,
            max_retries,
        }
    }

    pub fn mock_test_target_for_framework(framework_id: &str) -> &'static str {
        match framework_id {
            "iced" | "egui" | "slint" | "dioxus" => "codegen_test",
            "fyne" => "codegen_test",
            "flet" => "codegen_test",
            _ => "codegen_test",
        }
    }

    pub fn verify_and_heal(
        &self,
        initial_candidate_code: &str,
        framework_id: &str,
        plugin_rel_path: &Path,
    ) -> Result<HealResult, AutopatchError> {
        let full_plugin_path = self.workspace_root.join(plugin_rel_path);
        let original_code = fs::read_to_string(&full_plugin_path)?;

        let mut current_candidate = initial_candidate_code.to_string();
        let mut attempts = 0;
        let test_target = Self::mock_test_target_for_framework(framework_id);

        let mut last_error = String::new();

        while attempts < self.max_retries {
            attempts += 1;

            fs::write(&full_plugin_path, &current_candidate)?;

            let check_output = self.runner.run_cargo_check(&self.workspace_root)?;
            if !check_output.success {
                last_error = format!("cargo check failed:\n{}", check_output.stderr);
                if attempts < self.max_retries {
                    current_candidate = self.llm_engine.request_fix(
                        &current_candidate,
                        &check_output.stderr,
                        attempts,
                        framework_id,
                    )?;
                    continue;
                } else {
                    fs::write(&full_plugin_path, &original_code)?;
                    return Err(AutopatchError::SelfHealingExhausted {
                        retries: attempts,
                        last_error,
                    });
                }
            }

            let test_output = self.runner.run_cargo_test(&self.workspace_root, test_target)?;
            if !test_output.success {
                last_error = format!("cargo test failed:\n{}", test_output.stderr);
                if attempts < self.max_retries {
                    current_candidate = self.llm_engine.request_fix(
                        &current_candidate,
                        &test_output.stderr,
                        attempts,
                        framework_id,
                    )?;
                    continue;
                } else {
                    fs::write(&full_plugin_path, &original_code)?;
                    return Err(AutopatchError::SelfHealingExhausted {
                        retries: attempts,
                        last_error,
                    });
                }
            }

            return Ok(HealResult {
                healed_code: current_candidate,
                attempts_used: attempts,
                test_output: test_output.stdout,
            });
        }

        fs::write(&full_plugin_path, &original_code)?;
        Err(AutopatchError::SelfHealingExhausted {
            retries: attempts,
            last_error,
        })
    }

    pub fn promote_patch(
        &self,
        framework_id: &str,
        new_version: &str,
        healed_code: &str,
        plugin_rel_path: &Path,
        config_path: &Path,
        attempts: usize,
    ) -> Result<String, AutopatchError> {
        let full_plugin_path = self.workspace_root.join(plugin_rel_path);
        let temp_path = full_plugin_path.with_extension("tmp");
        fs::write(&temp_path, healed_code)?;
        fs::rename(&temp_path, &full_plugin_path)?;

        let mut config = FrameworkVersionsConfig::load_from_path(config_path)?;
        let current_meta = config.frameworks.get(framework_id).cloned();
        let from_version = current_meta
            .map(|m| m.current_version)
            .unwrap_or_else(|| "0.0.0".to_string());

        let timestamp = "2026-11-05T22:00:00Z";
        config.update_framework_version(framework_id, new_version, timestamp);
        config.record_report(AutopatchReport {
            framework_id: framework_id.to_string(),
            from_version,
            to_version: new_version.to_string(),
            timestamp: timestamp.to_string(),
            status: "synced".to_string(),
            attempts,
            error_message: None,
        });
        config.save_to_path(config_path)?;

        let bumped_version = bump_workspace_versions(&self.workspace_root)?;
        Ok(bumped_version)
    }
}

pub fn bump_patch_version(current: &str) -> String {
    let parts: Vec<&str> = current.trim().split('.').collect();
    if parts.len() == 3 {
        if let (Ok(major), Ok(minor), Ok(patch)) = (
            parts[0].parse::<u64>(),
            parts[1].parse::<u64>(),
            parts[2].parse::<u64>(),
        ) {
            return format!("{}.{}.{}", major, minor, patch + 1);
        }
    }
    format!("{}.1", current.trim())
}

pub fn bump_workspace_versions(workspace_root: &Path) -> Result<String, AutopatchError> {
    let cargo_toml_path = workspace_root.join("Cargo.toml");
    let cargo_content = fs::read_to_string(&cargo_toml_path)?;

    let mut new_version = "0.1.1".to_string();
    let mut updated_cargo = String::new();
    let mut in_workspace_package = false;

    for line in cargo_content.lines() {
        if line.trim() == "[workspace.package]" {
            in_workspace_package = true;
            updated_cargo.push_str(line);
            updated_cargo.push('\n');
            continue;
        }

        if in_workspace_package && line.trim().starts_with("version = ") {
            let parts: Vec<&str> = line.split('=').collect();
            if parts.len() == 2 {
                let current_raw = parts[1].trim().trim_matches('"');
                new_version = bump_patch_version(current_raw);
                updated_cargo.push_str(&format!("version = \"{}\"\n", new_version));
                in_workspace_package = false;
                continue;
            }
        }

        if in_workspace_package && line.trim().starts_with('[') {
            in_workspace_package = false;
        }

        updated_cargo.push_str(line);
        updated_cargo.push('\n');
    }

    fs::write(&cargo_toml_path, updated_cargo)?;

    let pkg_json_path = workspace_root.join("package.json");
    if pkg_json_path.exists() {
        let pkg_content = fs::read_to_string(&pkg_json_path)?;
        let mut pkg_val: serde_json::Value = serde_json::from_str(&pkg_content)?;
        pkg_val["version"] = serde_json::Value::String(new_version.clone());
        let updated_pkg = serde_json::to_string_pretty(&pkg_val)?;
        fs::write(&pkg_json_path, updated_pkg)?;
    }

    Ok(new_version)
}

