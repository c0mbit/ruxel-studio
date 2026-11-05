use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::error::FigmaError;
use crate::models::{FigmaImagesResponse, FigmaNodesResponse};

pub trait HttpTransport: Send + Sync {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, FigmaError>;
    fn download_to_file(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        destination: &Path,
    ) -> Result<(), FigmaError>;
}

pub struct CurlHttpTransport {
    executable: String,
}

impl Default for CurlHttpTransport {
    fn default() -> Self {
        let binary_name = if cfg!(windows) { "curl.exe" } else { "curl" };
        Self {
            executable: binary_name.to_string(),
        }
    }
}

impl CurlHttpTransport {
    pub fn new() -> Self {
        Self::default()
    }
}

impl HttpTransport for CurlHttpTransport {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Vec<u8>, FigmaError> {
        let mut cmd = Command::new(&self.executable);
        cmd.arg("-s")
            .arg("-S")
            .arg("--location")
            .arg("-w")
            .arg("\n%{http_code}")
            .arg(url);

        for (header_name, header_value) in headers {
            cmd.arg("-H").arg(format!("{}: {}", header_name, header_value));
        }

        let output = cmd.output().map_err(|e| {
            FigmaError::Transport(format!("Failed to execute {}: {}", self.executable, e))
        })?;

        let raw_stdout = output.stdout;
        let stdout_str = String::from_utf8_lossy(&raw_stdout);

        let mut lines: Vec<&str> = stdout_str.lines().collect();
        let status_str = lines.pop().unwrap_or("0");
        let status_code: u32 = status_str.trim().parse().unwrap_or(0);

        let body_str = lines.join("\n");
        let body_bytes = body_str.into_bytes();

        if (200..300).contains(&status_code) {
            Ok(body_bytes)
        } else {
            let error_msg = if !output.stderr.is_empty() {
                String::from_utf8_lossy(&output.stderr).to_string()
            } else {
                String::from_utf8_lossy(&body_bytes).to_string()
            };
            Err(FigmaError::ApiStatus {
                status: status_code,
                message: error_msg,
            })
        }
    }

    fn download_to_file(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        destination: &Path,
    ) -> Result<(), FigmaError> {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut cmd = Command::new(&self.executable);
        cmd.arg("-s")
            .arg("-S")
            .arg("--location")
            .arg("-o")
            .arg(destination)
            .arg("-w")
            .arg("%{http_code}")
            .arg(url);

        for (header_name, header_value) in headers {
            cmd.arg("-H").arg(format!("{}: {}", header_name, header_value));
        }

        let output = cmd.output().map_err(|e| {
            FigmaError::Transport(format!("Failed to execute {}: {}", self.executable, e))
        })?;

        let status_str = String::from_utf8_lossy(&output.stdout);
        let status_code: u32 = status_str.trim().parse().unwrap_or(0);

        if (200..300).contains(&status_code) {
            Ok(())
        } else {
            let error_msg = String::from_utf8_lossy(&output.stderr).to_string();
            Err(FigmaError::ApiStatus {
                status: status_code,
                message: error_msg,
            })
        }
    }
}

pub struct MockHttpTransport {
    responses: Mutex<HashMap<String, Vec<u8>>>,
}

impl Default for MockHttpTransport {
    fn default() -> Self {
        Self {
            responses: Mutex::new(HashMap::new()),
        }
    }
}

impl MockHttpTransport {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_response(&self, url: impl Into<String>, body: impl Into<Vec<u8>>) {
        let mut map = self.responses.lock().unwrap();
        map.insert(url.into(), body.into());
    }
}

impl HttpTransport for MockHttpTransport {
    fn get(&self, url: &str, _headers: &[(&str, &str)]) -> Result<Vec<u8>, FigmaError> {
        let map = self.responses.lock().unwrap();
        if let Some(body) = map.get(url) {
            Ok(body.clone())
        } else {
            Err(FigmaError::ApiStatus {
                status: 404,
                message: format!("Mock URL '{}' not found in test registry", url),
            })
        }
    }

    fn download_to_file(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        destination: &Path,
    ) -> Result<(), FigmaError> {
        let data = self.get(url, headers)?;
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(destination, data)?;
        Ok(())
    }
}

pub struct FigmaClient {
    token: String,
    transport: Arc<dyn HttpTransport>,
}

impl FigmaClient {
    pub fn new(token: String) -> Self {
        Self {
            token,
            transport: Arc::new(CurlHttpTransport::new()),
        }
    }

    pub fn with_transport(token: String, transport: Arc<dyn HttpTransport>) -> Self {
        Self { token, transport }
    }

    pub fn parse_figma_url(raw_url: &str) -> Result<(String, Option<String>), FigmaError> {
        let clean = raw_url.trim();
        if !clean.contains("figma.com") {
            if !clean.contains('/') && !clean.contains('?') && !clean.is_empty() {
                return Ok((clean.to_string(), None));
            }
            return Err(FigmaError::InvalidUrl(format!(
                "String '{}' is not a valid Figma URL or file key",
                raw_url
            )));
        }

        let without_protocol = if let Some(stripped) = clean.strip_prefix("https://") {
            stripped
        } else if let Some(stripped) = clean.strip_prefix("http://") {
            stripped
        } else {
            clean
        };

        let parts: Vec<&str> = without_protocol.split('?').collect();
        let path = parts[0];
        let query = parts.get(1).copied().unwrap_or("");

        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut file_key: Option<String> = None;

        for (idx, seg) in segments.iter().enumerate() {
            if (*seg == "file" || *seg == "design" || *seg == "proto") && idx + 1 < segments.len() {
                file_key = Some(segments[idx + 1].to_string());
                break;
            }
        }

        let final_file_key = file_key.ok_or_else(|| {
            FigmaError::InvalidUrl(format!("Could not extract file key from URL '{}'", raw_url))
        })?;

        let mut node_id: Option<String> = None;
        if !query.is_empty() {
            for param in query.split('&') {
                let kv: Vec<&str> = param.split('=').collect();
                if kv.len() == 2 && (kv[0] == "node-id" || kv[0] == "node_id") {
                    let decoded = kv[1].replace("%3A", ":").replace('-', ":");
                    node_id = Some(decoded);
                    break;
                }
            }
        }

        Ok((final_file_key, node_id))
    }

    pub fn get_nodes(
        &self,
        file_key: &str,
        node_ids: &[&str],
    ) -> Result<FigmaNodesResponse, FigmaError> {
        let joined_ids = node_ids.join(",");
        let url = format!(
            "https://api.figma.com/v1/files/{}/nodes?ids={}",
            file_key, joined_ids
        );

        let headers = [("X-Figma-Token", self.token.as_str())];
        let response_bytes = self.transport.get(&url, &headers)?;
        let parsed: FigmaNodesResponse = serde_json::from_slice(&response_bytes)?;
        Ok(parsed)
    }

    pub fn get_images(
        &self,
        file_key: &str,
        node_ids: &[&str],
        format: &str,
    ) -> Result<FigmaImagesResponse, FigmaError> {
        let joined_ids = node_ids.join(",");
        let url = format!(
            "https://api.figma.com/v1/images/{}?ids={}&format={}",
            file_key, joined_ids, format
        );

        let headers = [("X-Figma-Token", self.token.as_str())];
        let response_bytes = self.transport.get(&url, &headers)?;
        let parsed: FigmaImagesResponse = serde_json::from_slice(&response_bytes)?;
        Ok(parsed)
    }

    pub fn download_asset(&self, url: &str, destination: &Path) -> Result<(), FigmaError> {
        let headers = [("X-Figma-Token", self.token.as_str())];
        self.transport.download_to_file(url, &headers, destination)
    }
}

