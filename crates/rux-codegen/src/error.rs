use thiserror::Error;

#[derive(Debug, Error)]
pub enum CodegenError {
    #[error("AST error: {0}")]
    AstError(String),
    #[error("Syn parse error: {0}")]
    SynParseError(String),
    #[error("Controller merge error: {0}")]
    ControllerMergeError(String),
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

