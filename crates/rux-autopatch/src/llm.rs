use std::env;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use crate::analyzer::DiffAnalysisReport;
use crate::error::AutopatchError;
use crate::http::HttpTransport;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LlmProvider {
    Gemini,
    OpenAi,
    Anthropic,
}

impl LlmProvider {
    pub fn from_str_loose(s: &str) -> Option<Self> {
        let normalized = s.trim().to_lowercase();
        match normalized.as_str() {
            "gemini" | "google" => Some(Self::Gemini),
            "openai" | "chatgpt" | "gpt" => Some(Self::OpenAi),
            "anthropic" | "claude" => Some(Self::Anthropic),
            _ => None,
        }
    }

    pub fn default_model(&self) -> &'static str {
        match self {
            Self::Gemini => "gemini-1.5-pro",
            Self::OpenAi => "gpt-4o",
            Self::Anthropic => "claude-3-5-sonnet-20241022",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PatchPromptContext {
    pub framework_id: String,
    pub from_version: String,
    pub to_version: String,
    pub current_plugin_code: String,
    pub analysis: DiffAnalysisReport,
}

pub struct LlmPatchEngine {
    provider: LlmProvider,
    api_key: String,
    model: String,
    transport: Arc<dyn HttpTransport>,
}

impl LlmPatchEngine {
    pub fn new(
        provider: LlmProvider,
        api_key: String,
        model: Option<String>,
        transport: Arc<dyn HttpTransport>,
    ) -> Self {
        let model = model.unwrap_or_else(|| provider.default_model().to_string());
        Self {
            provider,
            api_key,
            model,
            transport,
        }
    }

    pub fn from_env(transport: Arc<dyn HttpTransport>) -> Result<Self, AutopatchError> {
        let api_key = env::var("LLM_API_KEY")
            .or_else(|_| env::var("GEMINI_API_KEY"))
            .or_else(|_| env::var("OPENAI_API_KEY"))
            .or_else(|_| env::var("ANTHROPIC_API_KEY"))
            .map_err(|_| {
                AutopatchError::Llm(
                    "Missing LLM credentials. Set LLM_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
                        .to_string(),
                )
            })?;

        let provider = if let Ok(prov_str) = env::var("LLM_PROVIDER") {
            LlmProvider::from_str_loose(&prov_str).unwrap_or(LlmProvider::Gemini)
        } else if api_key.starts_with("AIza") {
            LlmProvider::Gemini
        } else if api_key.starts_with("sk-ant") {
            LlmProvider::Anthropic
        } else if api_key.starts_with("sk-") {
            LlmProvider::OpenAi
        } else {
            LlmProvider::Gemini
        };

        let model = env::var("LLM_MODEL").ok();
        Ok(Self::new(provider, api_key, model, transport))
    }

    pub fn provider(&self) -> LlmProvider {
        self.provider
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn generate_patch(&self, context: &PatchPromptContext) -> Result<String, AutopatchError> {
        let prompt = self.build_patch_prompt(context);
        let raw_response = self.query_provider(&prompt)?;
        let extracted_code = extract_code_from_markdown(&raw_response);
        let sanitized = sanitize_zero_comments(&extracted_code);
        Ok(sanitized)
    }

    pub fn request_fix(
        &self,
        candidate_code: &str,
        compiler_stderr: &str,
        attempt: usize,
        framework_id: &str,
    ) -> Result<String, AutopatchError> {
        let prompt = self.build_fix_prompt(candidate_code, compiler_stderr, attempt, framework_id);
        let raw_response = self.query_provider(&prompt)?;
        let extracted_code = extract_code_from_markdown(&raw_response);
        let sanitized = sanitize_zero_comments(&extracted_code);
        Ok(sanitized)
    }

    fn query_provider(&self, prompt: &str) -> Result<String, AutopatchError> {
        match self.provider {
            LlmProvider::Gemini => self.query_gemini(prompt),
            LlmProvider::OpenAi => self.query_openai(prompt),
            LlmProvider::Anthropic => self.query_anthropic(prompt),
        }
    }

    fn query_gemini(&self, prompt: &str) -> Result<String, AutopatchError> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            self.model, self.api_key
        );
        let headers = [("Content-Type", "application/json")];
        let payload = json!({
            "contents": [
                {
                    "parts": [
                        { "text": prompt }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1
            }
        });

        let body = serde_json::to_string(&payload)?;
        let response = self.transport.post(&url, &headers, &body)?;

        if response.status_code != 200 {
            return Err(AutopatchError::Llm(format!(
                "Gemini API returned status {}: {}",
                response.status_code, response.body
            )));
        }

        let parsed: Value = serde_json::from_str(&response.body)?;
        let text = parsed["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .ok_or_else(|| {
                AutopatchError::Llm(format!(
                    "Failed to extract text from Gemini response: {}",
                    response.body
                ))
            })?;

        Ok(text.to_string())
    }

    fn query_openai(&self, prompt: &str) -> Result<String, AutopatchError> {
        let url = "https://api.openai.com/v1/chat/completions";
        let auth_val = format!("Bearer {}", self.api_key);
        let headers = [
            ("Content-Type", "application/json"),
            ("Authorization", auth_val.as_str()),
        ];
        let payload = json!({
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a senior Rust systems programmer for Ruxel Studio. Generate idiomatic Rust code without any comments."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.1
        });

        let body = serde_json::to_string(&payload)?;
        let response = self.transport.post(url, &headers, &body)?;

        if response.status_code != 200 {
            return Err(AutopatchError::Llm(format!(
                "OpenAI API returned status {}: {}",
                response.status_code, response.body
            )));
        }

        let parsed: Value = serde_json::from_str(&response.body)?;
        let text = parsed["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| {
                AutopatchError::Llm(format!(
                    "Failed to extract content from OpenAI response: {}",
                    response.body
                ))
            })?;

        Ok(text.to_string())
    }

    fn query_anthropic(&self, prompt: &str) -> Result<String, AutopatchError> {
        let url = "https://api.anthropic.com/v1/messages";
        let headers = [
            ("Content-Type", "application/json"),
            ("x-api-key", self.api_key.as_str()),
            ("anthropic-version", "2023-06-01"),
        ];
        let payload = json!({
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 8192,
            "temperature": 0.1
        });

        let body = serde_json::to_string(&payload)?;
        let response = self.transport.post(url, &headers, &body)?;

        if response.status_code != 200 {
            return Err(AutopatchError::Llm(format!(
                "Anthropic API returned status {}: {}",
                response.status_code, response.body
            )));
        }

        let parsed: Value = serde_json::from_str(&response.body)?;
        let text = parsed["content"][0]["text"]
            .as_str()
            .ok_or_else(|| {
                AutopatchError::Llm(format!(
                    "Failed to extract text from Anthropic response: {}",
                    response.body
                ))
            })?;

        Ok(text.to_string())
    }

    fn build_patch_prompt(&self, context: &PatchPromptContext) -> String {
        let mut breaking_summary = String::new();
        for change in &context.analysis.breaking_changes {
            breaking_summary.push_str(&format!(
                "- [{:?}] {}: {}\n",
                change.category, change.symbol, change.summary
            ));
        }

        format!(
r#"You are updating a code generator plugin for Ruxel Studio.
Target Framework: {}
Upgrade: {} -> {}

Detected Breaking Changes:
{}

Changelog Excerpt:
{}

Current Plugin Source Code:
```rust
{}
```

Requirements:
1. Update the plugin code to be fully compatible with the target framework upgrade.
2. Maintain the `CodeGenerator` trait implementation and exact function signatures (`target_framework`, `profile`, `generate`).
3. Support all widgets (including DataGrid, Chart, TreeView, Viewport3D), layout containers, themes, animations, assets, localization, and routing.
4. STRICT COMPLIANCE RULE: ZERO comments in the code. Do not write any single-line comments (//), block comments (/* */), or doc comments (///).
5. Output ONLY the updated Rust source code inside a single ```rust ... ``` markdown block.
"#,
            context.framework_id,
            context.from_version,
            context.to_version,
            if breaking_summary.is_empty() { "None detected explicitly." } else { &breaking_summary },
            &context.analysis.raw_changelog,
            context.current_plugin_code
        )
    }

    fn build_fix_prompt(
        &self,
        candidate_code: &str,
        compiler_stderr: &str,
        attempt: usize,
        framework_id: &str,
    ) -> String {
        format!(
r#"The candidate code generator plugin for framework '{}' failed compilation or verification checks (Attempt {} of 5).

Compiler / Test Diagnostic Output (stderr):
```
{}
```

Candidate Source Code That Failed:
```rust
{}
```

Instructions:
1. Fix all compiler errors, missing imports, trait mismatches, or syntax problems indicated in stderr.
2. Preserve all existing functionality and AST generation rules.
3. STRICT COMPLIANCE RULE: ZERO comments in the code. Do not write any single-line comments (//), block comments (/* */), or doc comments (///).
4. Output ONLY the corrected Rust code inside a single ```rust ... ``` block.
"#,
            framework_id, attempt, compiler_stderr, candidate_code
        )
    }
}

pub fn extract_code_from_markdown(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(start_idx) = trimmed.find("```rust") {
        let rest = &trimmed[start_idx + 7..];
        if let Some(end_idx) = rest.find("```") {
            return rest[..end_idx].trim().to_string();
        }
    }

    if let Some(start_idx) = trimmed.find("```") {
        let rest = &trimmed[start_idx + 3..];
        let after_lang = if let Some(newline_idx) = rest.find('\n') {
            &rest[newline_idx + 1..]
        } else {
            rest
        };
        if let Some(end_idx) = after_lang.find("```") {
            return after_lang[..end_idx].trim().to_string();
        }
    }

    trimmed.to_string()
}

pub fn sanitize_zero_comments(code: &str) -> String {
    let mut result = String::with_capacity(code.len());
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut in_string_literal = false;
    let mut in_char_literal = false;
    let mut is_escaped = false;

    let chars: Vec<char> = code.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        let ch = chars[i];
        let next_ch = if i + 1 < len { Some(chars[i + 1]) } else { None };

        if in_line_comment {
            if ch == '\n' {
                in_line_comment = false;
                result.push('\n');
            }
            i += 1;
            continue;
        }

        if in_block_comment {
            if ch == '*' && next_ch == Some('/') {
                in_block_comment = false;
                i += 2;
                continue;
            }
            i += 1;
            continue;
        }

        if in_string_literal {
            result.push(ch);
            if is_escaped {
                is_escaped = false;
            } else if ch == '\\' {
                is_escaped = true;
            } else if ch == '"' {
                in_string_literal = false;
            }
            i += 1;
            continue;
        }

        if in_char_literal {
            result.push(ch);
            if is_escaped {
                is_escaped = false;
            } else if ch == '\\' {
                is_escaped = true;
            } else if ch == '\'' {
                in_char_literal = false;
            }
            i += 1;
            continue;
        }

        if ch == '/' && next_ch == Some('/') {
            in_line_comment = true;
            i += 2;
            continue;
        }

        if ch == '/' && next_ch == Some('*') {
            in_block_comment = true;
            i += 2;
            continue;
        }

        if ch == '"' {
            in_string_literal = true;
            result.push(ch);
            i += 1;
            continue;
        }

        if ch == '\'' && next_ch.is_some() {
            in_char_literal = true;
            result.push(ch);
            i += 1;
            continue;
        }

        result.push(ch);
        i += 1;
    }

    let cleaned_lines: Vec<&str> = result
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();

    cleaned_lines.join("\n")
}

