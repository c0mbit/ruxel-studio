use thiserror::Error;

#[derive(Debug, Error)]
pub enum AutopatchError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("GitHub API error: {0}")]
    GitHub(String),

    #[error("LLM Provider error: {0}")]
    Llm(String),

    #[error("Compiler verification error: {0}")]
    Compiler(String),

    #[error("Self-healing exhausted: max retries reached ({retries}): {last_error}")]
    SelfHealingExhausted {
        retries: usize,
        last_error: String,
    },

    #[error("Framework not found: {0}")]
    FrameworkNotFound(String),

    #[error("Invalid configuration: {0}")]
    Config(String),
}

