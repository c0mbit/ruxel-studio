use std::sync::Arc;
use serde::{Deserialize, Serialize};
use crate::error::AutopatchError;
use crate::http::HttpTransport;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeCategory {
    Constructor,
    Macro,
    Trait,
    Layout,
    Dependency,
    General,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BreakingChange {
    pub category: ChangeCategory,
    pub symbol: String,
    pub summary: String,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffAnalysisReport {
    pub framework_id: String,
    pub from_version: String,
    pub to_version: String,
    pub breaking_changes: Vec<BreakingChange>,
    pub raw_changelog: String,
}

pub struct DiffAnalyzer {
    transport: Arc<dyn HttpTransport>,
    github_token: Option<String>,
}

impl DiffAnalyzer {
    pub fn new(transport: Arc<dyn HttpTransport>, github_token: Option<String>) -> Self {
        Self {
            transport,
            github_token,
        }
    }

    pub fn analyze_release_notes(
        &self,
        framework_id: &str,
        from_version: &str,
        to_version: &str,
        notes: &str,
    ) -> DiffAnalysisReport {
        let mut breaking_changes = Vec::new();
        let lines: Vec<&str> = notes.lines().collect();

        for line in &lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let lower = trimmed.to_lowercase();
            let is_breaking = lower.contains("breaking")
                || lower.contains("deprecated")
                || lower.contains("removed")
                || lower.contains("renamed")
                || lower.contains("signature change")
                || lower.contains("migration");

            if let Some(constructor_change) = Self::detect_constructor_change(trimmed) {
                breaking_changes.push(constructor_change);
            } else if let Some(macro_change) = Self::detect_macro_change(trimmed) {
                breaking_changes.push(macro_change);
            } else if let Some(trait_change) = Self::detect_trait_change(trimmed) {
                breaking_changes.push(trait_change);
            } else if let Some(layout_change) = Self::detect_layout_change(trimmed) {
                breaking_changes.push(layout_change);
            } else if is_breaking {
                breaking_changes.push(BreakingChange {
                    category: ChangeCategory::General,
                    symbol: "general".to_string(),
                    summary: trimmed.to_string(),
                    snippet: None,
                });
            }
        }

        DiffAnalysisReport {
            framework_id: framework_id.to_string(),
            from_version: from_version.to_string(),
            to_version: to_version.to_string(),
            breaking_changes,
            raw_changelog: notes.to_string(),
        }
    }

    pub fn fetch_and_analyze(
        &self,
        framework_id: &str,
        repo: &str,
        from_version: &str,
        to_version: &str,
        release_notes: Option<&str>,
    ) -> Result<DiffAnalysisReport, AutopatchError> {
        let notes_content = match release_notes {
            Some(notes) if !notes.trim().is_empty() => notes.to_string(),
            _ => self.fetch_compare_diff(repo, from_version, to_version)?,
        };

        Ok(self.analyze_release_notes(framework_id, from_version, to_version, &notes_content))
    }

    fn fetch_compare_diff(
        &self,
        repo: &str,
        from_version: &str,
        to_version: &str,
    ) -> Result<String, AutopatchError> {
        let url = format!(
            "https://api.github.com/repos/{}/compare/v{}...v{}",
            repo, from_version, to_version
        );

        let mut headers = vec![
            ("User-Agent", "rux-autopatch"),
            ("Accept", "application/vnd.github.v3+json"),
        ];

        let auth_header;
        if let Some(token) = &self.github_token {
            auth_header = format!("Bearer {}", token);
            headers.push(("Authorization", &auth_header));
        }

        match self.transport.get(&url, &headers) {
            Ok(resp) if resp.status_code == 200 => Ok(resp.body),
            _ => {
                let alt_url = format!(
                    "https://api.github.com/repos/{}/compare/{}...{}",
                    repo, from_version, to_version
                );
                match self.transport.get(&alt_url, &headers) {
                    Ok(resp) if resp.status_code == 200 => Ok(resp.body),
                    _ => Ok(String::new()),
                }
            }
        }
    }

    fn detect_constructor_change(line: &str) -> Option<BreakingChange> {
        let symbols = [
            "button",
            "text",
            "text_input",
            "text_edit",
            "checkbox",
            "slider",
            "container",
            "column",
            "row",
            "scrollable",
            "pick_list",
            "radio",
            "table",
            "data_grid",
            "chart",
        ];

        let lower = line.to_lowercase();
        for &sym in &symbols {
            if lower.contains(sym) && (lower.contains("new") || lower.contains("signature") || lower.contains("argument") || lower.contains("parameter") || lower.contains("takes")) {
                return Some(BreakingChange {
                    category: ChangeCategory::Constructor,
                    symbol: sym.to_string(),
                    summary: line.to_string(),
                    snippet: None,
                });
            }
        }
        None
    }

    fn detect_macro_change(line: &str) -> Option<BreakingChange> {
        let lower = line.to_lowercase();
        if lower.contains("rsx!") || lower.contains("view!") || lower.contains("widget!") || lower.contains("html!") {
            let symbol = if lower.contains("rsx!") {
                "rsx!".to_string()
            } else if lower.contains("view!") {
                "view!".to_string()
            } else {
                "macro".to_string()
            };

            return Some(BreakingChange {
                category: ChangeCategory::Macro,
                symbol,
                summary: line.to_string(),
                snippet: None,
            });
        }
        None
    }

    fn detect_trait_change(line: &str) -> Option<BreakingChange> {
        let lower = line.to_lowercase();
        let traits = ["widget", "application", "element", "view", "component", "app"];
        for &t in &traits {
            if lower.contains(&format!("trait {}", t)) || lower.contains(&format!("impl {}", t)) || lower.contains(&format!("{} trait", t)) {
                return Some(BreakingChange {
                    category: ChangeCategory::Trait,
                    symbol: t.to_string(),
                    summary: line.to_string(),
                    snippet: None,
                });
            }
        }
        None
    }

    fn detect_layout_change(line: &str) -> Option<BreakingChange> {
        let lower = line.to_lowercase();
        let layout_keywords = ["length", "padding", "spacing", "alignment", "align_items", "justify_content"];
        for &k in &layout_keywords {
            if lower.contains(k) {
                return Some(BreakingChange {
                    category: ChangeCategory::Layout,
                    symbol: k.to_string(),
                    summary: line.to_string(),
                    snippet: None,
                });
            }
        }
        None
    }
}

