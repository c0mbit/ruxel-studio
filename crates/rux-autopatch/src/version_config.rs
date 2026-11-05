use std::collections::HashMap;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::error::AutopatchError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FrameworkMeta {
    pub repo: String,
    pub current_version: String,
    pub target_crate: String,
    pub plugin_path: String,
    pub last_checked: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutopatchReport {
    pub framework_id: String,
    pub from_version: String,
    pub to_version: String,
    pub timestamp: String,
    pub status: String,
    pub attempts: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkVersionsConfig {
    pub frameworks: HashMap<String, FrameworkMeta>,
    pub last_sync: String,
    #[serde(default)]
    pub recent_reports: Vec<AutopatchReport>,
}

impl FrameworkVersionsConfig {
    pub fn load_from_path(path: &Path) -> Result<Self, AutopatchError> {
        let content = fs::read_to_string(path)?;
        let config: Self = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn save_to_path(&self, path: &Path) -> Result<(), AutopatchError> {
        let content = serde_json::to_string_pretty(self)?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn update_framework_version(&mut self, framework_id: &str, new_version: &str, timestamp: &str) {
        if let Some(meta) = self.frameworks.get_mut(framework_id) {
            meta.current_version = new_version.to_string();
            meta.last_checked = timestamp.to_string();
        }
        self.last_sync = timestamp.to_string();
    }

    pub fn record_report(&mut self, report: AutopatchReport) {
        self.recent_reports.insert(0, report);
        if self.recent_reports.len() > 50 {
            self.recent_reports.truncate(50);
        }
    }
}

