use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FontWeight {
    Thin,
    ExtraLight,
    Light,
    #[default]
    Normal,
    Medium,
    SemiBold,
    Bold,
    ExtraBold,
    Black,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FontStyle {
    #[default]
    Normal,
    Italic,
    Oblique,
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

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct AssetRegistry {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fonts: Vec<FontAsset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub icons: Vec<IconAsset>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<ImageAsset>,
}

/// Normalizes an image path across frameworks:
/// - Strips quotes (single or double)
/// - Extracts path from Slint `@image-url("...")` or `@image-url('...')`
/// - Normalizes Windows backslashes (`\`) to forward slashes (`/`)
/// - Strips redundant `./` prefix
pub fn normalize_image_path(raw: &str) -> String {
    let mut s = raw.trim();
    if let Some(rest) = s.strip_prefix("@image-url(") {
        if let Some(inside) = rest.strip_suffix(')') {
            s = inside.trim();
        }
    }
    let unquoted = if (s.starts_with('"') && s.ends_with('"'))
        || (s.starts_with('\'') && s.ends_with('\''))
    {
        if s.len() >= 2 {
            &s[1..s.len() - 1]
        } else {
            s
        }
    } else {
        s
    };
    let normalized = unquoted.replace('\\', "/");
    let stripped = if let Some(rest) = normalized.strip_prefix("./") {
        rest
    } else {
        &normalized
    };
    stripped.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_image_path_variants() {
        assert_eq!(normalize_image_path("assets/logo.png"), "assets/logo.png");
        assert_eq!(normalize_image_path("\"assets/logo.png\""), "assets/logo.png");
        assert_eq!(normalize_image_path("'assets/logo.png'"), "assets/logo.png");
        assert_eq!(normalize_image_path("./assets/logo.png"), "assets/logo.png");
        assert_eq!(normalize_image_path("assets\\icons\\star.svg"), "assets/icons/star.svg");
        assert_eq!(normalize_image_path("@image-url(\"assets/logo.png\")"), "assets/logo.png");
        assert_eq!(normalize_image_path("@image-url('assets/logo.png')"), "assets/logo.png");
        assert_eq!(normalize_image_path("@image-url(assets/logo.png)"), "assets/logo.png");
    }
}
