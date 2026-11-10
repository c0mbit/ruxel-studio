use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScaleMode {
    #[default]
    Logical,
    Physical,
    Scaled,
}

fn default_true() -> bool {
    true
}

fn default_window_title() -> String {
    "Ruxel Studio Window".to_string()
}

fn default_window_width() -> f64 {
    800.0
}

fn default_window_height() -> f64 {
    600.0
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WindowConfig {
    #[serde(default = "default_window_title")]
    pub title: String,
    #[serde(default = "default_window_width")]
    pub initial_width: f64,
    #[serde(default = "default_window_height")]
    pub initial_height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_height: Option<f64>,
    #[serde(default = "default_true")]
    pub resizable: bool,
    #[serde(default)]
    pub scale_mode: ScaleMode,
    #[serde(default)]
    pub transparent: bool,
    #[serde(default = "default_true")]
    pub decorations: bool,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub fullscreen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_y: Option<i32>,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            title: default_window_title(),
            initial_width: default_window_width(),
            initial_height: default_window_height(),
            min_width: None,
            min_height: None,
            max_width: None,
            max_height: None,
            resizable: true,
            scale_mode: ScaleMode::default(),
            transparent: false,
            decorations: true,
            always_on_top: false,
            fullscreen: false,
            position_x: None,
            position_y: None,
        }
    }
}
