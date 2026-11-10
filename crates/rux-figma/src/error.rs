use thiserror::Error;

#[derive(Debug, Error)]
pub enum FigmaError {
    #[error("HTTP transport error: {0}")]
    Transport(String),

    #[error("API request failed with status {status}: {message}")]
    ApiStatus { status: u32, message: String },

    #[error("Serialization or parsing error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Invalid Figma URL or identifier: {0}")]
    InvalidUrl(String),

    #[error("Target node '{0}' not found in Figma response")]
    NodeNotFound(String),

    #[error("Geometry resolution error: {0}")]
    Geometry(String),

    #[error("Invalid Figma JSON: {0}")]
    InvalidJson(String),

    #[error("Asset download error: {0}")]
    AssetDownload(String),
}

