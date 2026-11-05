use std::sync::Arc;
use serde::Deserialize;
use crate::error::AutopatchError;
use crate::http::HttpTransport;
use crate::version_config::{FrameworkMeta, FrameworkVersionsConfig};

#[derive(Debug, Clone, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub published_at: Option<String>,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub version: String,
    pub body: String,
    pub published_at: String,
    pub html_url: String,
}

#[derive(Debug, Clone)]
pub struct FrameworkUpdateCandidate {
    pub framework_id: String,
    pub meta: FrameworkMeta,
    pub latest_release: ReleaseInfo,
}

pub struct ReleaseMonitor {
    transport: Arc<dyn HttpTransport>,
    github_token: Option<String>,
}

impl ReleaseMonitor {
    pub fn new(transport: Arc<dyn HttpTransport>, github_token: Option<String>) -> Self {
        Self {
            transport,
            github_token,
        }
    }

    pub fn check_framework(
        &self,
        _framework_id: &str,
        meta: &FrameworkMeta,
    ) -> Result<Option<ReleaseInfo>, AutopatchError> {
        let url = format!("https://api.github.com/repos/{}/releases/latest", meta.repo);
        let mut headers = vec![
            ("User-Agent", "rux-autopatch"),
            ("Accept", "application/vnd.github.v3+json"),
        ];

        let auth_header;
        if let Some(token) = &self.github_token {
            auth_header = format!("Bearer {}", token);
            headers.push(("Authorization", &auth_header));
        }

        let response = self.transport.get(&url, &headers)?;
        if response.status_code == 404 {
            return Ok(None);
        }
        if response.status_code != 200 {
            return Err(AutopatchError::GitHub(format!(
                "GitHub API responded with status {}: {}",
                response.status_code, response.body
            )));
        }

        let release: GitHubRelease = serde_json::from_str(&response.body)?;
        let clean_version = clean_semver(&release.tag_name);

        if is_newer_version(&clean_version, &clean_semver(&meta.current_version)) {
            Ok(Some(ReleaseInfo {
                tag_name: release.tag_name,
                version: clean_version,
                body: release.body.unwrap_or_default(),
                published_at: release.published_at.unwrap_or_default(),
                html_url: release.html_url.unwrap_or_default(),
            }))
        } else {
            Ok(None)
        }
    }

    pub fn check_all(
        &self,
        config: &FrameworkVersionsConfig,
    ) -> Result<Vec<FrameworkUpdateCandidate>, AutopatchError> {
        let mut updates = Vec::new();
        for (framework_id, meta) in &config.frameworks {
            if let Some(latest_release) = self.check_framework(framework_id, meta)? {
                updates.push(FrameworkUpdateCandidate {
                    framework_id: framework_id.clone(),
                    meta: meta.clone(),
                    latest_release,
                });
            }
        }
        updates.sort_by(|a, b| a.framework_id.cmp(&b.framework_id));
        Ok(updates)
    }
}

pub fn clean_semver(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = if let Some(stripped) = trimmed.strip_prefix('v') {
        stripped
    } else if let Some(stripped) = trimmed.strip_prefix('V') {
        stripped
    } else {
        trimmed
    };
    stripped.split('-').next().unwrap_or(stripped).to_string()
}

pub fn parse_version_numbers(version: &str) -> Vec<u64> {
    version
        .split('.')
        .filter_map(|segment| segment.parse::<u64>().ok())
        .collect()
}

pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    let cand_nums = parse_version_numbers(candidate);
    let curr_nums = parse_version_numbers(current);

    let max_len = cand_nums.len().max(curr_nums.len());
    for i in 0..max_len {
        let c_val = cand_nums.get(i).copied().unwrap_or(0);
        let cur_val = curr_nums.get(i).copied().unwrap_or(0);
        if c_val > cur_val {
            return true;
        }
        if c_val < cur_val {
            return false;
        }
    }
    false
}
