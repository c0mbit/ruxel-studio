use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColorScheme {
    Light,
    Dark,
    System,
}

impl Default for ColorScheme {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ColorPalette {
    pub primary: String,
    pub on_primary: String,
    pub primary_container: String,
    pub on_primary_container: String,
    pub secondary: String,
    pub on_secondary: String,
    pub secondary_container: String,
    pub on_secondary_container: String,
    pub tertiary: String,
    pub on_tertiary: String,
    pub tertiary_container: String,
    pub on_tertiary_container: String,
    pub error: String,
    pub on_error: String,
    pub error_container: String,
    pub on_error_container: String,
    pub surface: String,
    pub on_surface: String,
    pub surface_variant: String,
    pub on_surface_variant: String,
    pub outline: String,
    pub outline_variant: String,
    pub background: String,
    pub on_background: String,
    pub inverse_surface: String,
    pub inverse_on_surface: String,
    pub inverse_primary: String,
    pub scrim: String,
    pub shadow: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ColorPalettes {
    pub light: ColorPalette,
    pub dark: ColorPalette,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TypeStyle {
    pub font_family: String,
    pub font_weight: String,
    pub font_size: f64,
    pub line_height: f64,
    pub letter_spacing: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TypeScale {
    pub display_large: TypeStyle,
    pub display_medium: TypeStyle,
    pub display_small: TypeStyle,
    pub headline_large: TypeStyle,
    pub headline_medium: TypeStyle,
    pub headline_small: TypeStyle,
    pub title_large: TypeStyle,
    pub title_medium: TypeStyle,
    pub title_small: TypeStyle,
    pub body_large: TypeStyle,
    pub body_medium: TypeStyle,
    pub body_small: TypeStyle,
    pub label_large: TypeStyle,
    pub label_medium: TypeStyle,
    pub label_small: TypeStyle,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShadowToken {
    pub name: String,
    pub offset_x: f64,
    pub offset_y: f64,
    pub blur_radius: f64,
    pub spread_radius: f64,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpacingScale {
    pub none: f64,
    pub xs: f64,
    pub sm: f64,
    pub md: f64,
    pub lg: f64,
    pub xl: f64,
    pub xxl: f64,
}

impl Default for ColorPalette {
    fn default() -> Self {
        Self {
            primary: "#0061A4".to_string(),
            on_primary: "#FFFFFF".to_string(),
            primary_container: "#D1E4FF".to_string(),
            on_primary_container: "#001D36".to_string(),
            secondary: "#535F70".to_string(),
            on_secondary: "#FFFFFF".to_string(),
            secondary_container: "#D7E3F7".to_string(),
            on_secondary_container: "#101C2B".to_string(),
            tertiary: "#6B5778".to_string(),
            on_tertiary: "#FFFFFF".to_string(),
            tertiary_container: "#F2DAFF".to_string(),
            on_tertiary_container: "#251431".to_string(),
            error: "#BA1A1A".to_string(),
            on_error: "#FFFFFF".to_string(),
            error_container: "#FFDAD6".to_string(),
            on_error_container: "#410002".to_string(),
            surface: "#FDFCFF".to_string(),
            on_surface: "#1A1C1E".to_string(),
            surface_variant: "#DFE2EB".to_string(),
            on_surface_variant: "#43474E".to_string(),
            outline: "#73777F".to_string(),
            outline_variant: "#C3C7D0".to_string(),
            background: "#FDFCFF".to_string(),
            on_background: "#1A1C1E".to_string(),
            inverse_surface: "#2F3033".to_string(),
            inverse_on_surface: "#F1F0F4".to_string(),
            inverse_primary: "#9ECAFF".to_string(),
            scrim: "#000000".to_string(),
            shadow: "#000000".to_string(),
        }
    }
}

impl Default for ColorPalettes {
    fn default() -> Self {
        Self {
            light: ColorPalette::default(),
            dark: ColorPalette {
                primary: "#9ECAFF".to_string(),
                on_primary: "#003258".to_string(),
                primary_container: "#00497D".to_string(),
                on_primary_container: "#D1E4FF".to_string(),
                secondary: "#BBC7DB".to_string(),
                on_secondary: "#253140".to_string(),
                secondary_container: "#3B4858".to_string(),
                on_secondary_container: "#D7E3F7".to_string(),
                tertiary: "#D6BEE4".to_string(),
                on_tertiary: "#3B2948".to_string(),
                tertiary_container: "#523F5F".to_string(),
                on_tertiary_container: "#F2DAFF".to_string(),
                error: "#FFB4AB".to_string(),
                on_error: "#690005".to_string(),
                error_container: "#93000A".to_string(),
                on_error_container: "#FFDAD6".to_string(),
                surface: "#1A1C1E".to_string(),
                on_surface: "#E2E2E6".to_string(),
                surface_variant: "#43474E".to_string(),
                on_surface_variant: "#C3C7D0".to_string(),
                outline: "#8D9199".to_string(),
                outline_variant: "#43474E".to_string(),
                background: "#1A1C1E".to_string(),
                on_background: "#E2E2E6".to_string(),
                inverse_surface: "#E2E2E6".to_string(),
                inverse_on_surface: "#2F3033".to_string(),
                inverse_primary: "#0061A4".to_string(),
                scrim: "#000000".to_string(),
                shadow: "#000000".to_string(),
            },
        }
    }
}

impl TypeStyle {
    pub fn new(font_family: &str, font_weight: &str, font_size: f64, line_height: f64, letter_spacing: f64) -> Self {
        Self {
            font_family: font_family.to_string(),
            font_weight: font_weight.to_string(),
            font_size,
            line_height,
            letter_spacing,
        }
    }
}

impl Default for TypeStyle {
    fn default() -> Self {
        Self::new("system-ui", "normal", 14.0, 20.0, 0.0)
    }
}

impl Default for TypeScale {
    fn default() -> Self {
        Self {
            display_large: TypeStyle::new("system-ui", "bold", 57.0, 64.0, -0.25),
            display_medium: TypeStyle::new("system-ui", "bold", 45.0, 52.0, 0.0),
            display_small: TypeStyle::new("system-ui", "bold", 36.0, 44.0, 0.0),
            headline_large: TypeStyle::new("system-ui", "normal", 32.0, 40.0, 0.0),
            headline_medium: TypeStyle::new("system-ui", "normal", 28.0, 36.0, 0.0),
            headline_small: TypeStyle::new("system-ui", "normal", 24.0, 32.0, 0.0),
            title_large: TypeStyle::new("system-ui", "normal", 22.0, 28.0, 0.0),
            title_medium: TypeStyle::new("system-ui", "medium", 16.0, 24.0, 0.15),
            title_small: TypeStyle::new("system-ui", "medium", 14.0, 20.0, 0.1),
            body_large: TypeStyle::new("system-ui", "normal", 16.0, 24.0, 0.5),
            body_medium: TypeStyle::new("system-ui", "normal", 14.0, 20.0, 0.25),
            body_small: TypeStyle::new("system-ui", "normal", 12.0, 16.0, 0.4),
            label_large: TypeStyle::new("system-ui", "medium", 14.0, 20.0, 0.1),
            label_medium: TypeStyle::new("system-ui", "medium", 12.0, 16.0, 0.5),
            label_small: TypeStyle::new("system-ui", "medium", 11.0, 16.0, 0.5),
        }
    }
}

impl Default for BorderRadii {
    fn default() -> Self {
        Self {
            none: 0.0,
            sm: 4.0,
            md: 8.0,
            lg: 12.0,
            xl: 16.0,
            full: 9999.0,
        }
    }
}

impl Default for SpacingScale {
    fn default() -> Self {
        Self {
            none: 0.0,
            xs: 4.0,
            sm: 8.0,
            md: 16.0,
            lg: 24.0,
            xl: 32.0,
            xxl: 48.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThemeConfig {
    #[serde(default)]
    pub active_scheme: ColorScheme,
    #[serde(default)]
    pub color_palettes: ColorPalettes,
    #[serde(default)]
    pub typography: TypeScale,
    #[serde(default)]
    pub border_radii: BorderRadii,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub shadows: Vec<ShadowToken>,
    #[serde(default)]
    pub spacing: SpacingScale,
}

impl Default for ThemeConfig {
    fn default() -> Self {
        Self {
            active_scheme: ColorScheme::System,
            color_palettes: ColorPalettes::default(),
            typography: TypeScale::default(),
            border_radii: BorderRadii::default(),
            shadows: Vec::new(),
            spacing: SpacingScale::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BorderRadii {
    pub none: f64,
    pub sm: f64,
    pub md: f64,
    pub lg: f64,
    pub xl: f64,
    pub full: f64,
}
