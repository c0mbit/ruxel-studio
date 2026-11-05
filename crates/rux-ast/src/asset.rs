use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FontWeight {
    Thin,
    ExtraLight,
    Light,
    Normal,
    Medium,
    SemiBold,
    Bold,
    ExtraBold,
    Black,
}

impl Default for FontWeight {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FontStyle {
    Normal,
    Italic,
    Oblique,
}

impl Default for FontStyle {
    fn default() -> Self {
        Self::Normal
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IconFormat {
    Svg,
    Png,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageFormat {
    Svg,
    Png,
    Jpg,
    Webp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FontAsset {
    pub alias: String,
    pub path: String,
    #[serde(default)]
    pub weight: FontWeight,
    #[serde(default)]
    pub style: FontStyle,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IconAsset {
    pub alias: String,
    pub path: String,
    pub format: IconFormat,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImageAsset {
    pub alias: String,
    pub path: String,
    pub format: ImageFormat,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AssetRegistry {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fonts: Vec<FontAsset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub icons: Vec<IconAsset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<ImageAsset>,
}

impl Default for AssetRegistry {
    fn default() -> Self {
        Self {
            fonts: Vec::new(),
            icons: Vec::new(),
            images: Vec::new(),
        }
    }
}
