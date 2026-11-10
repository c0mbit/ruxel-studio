use rux_ast::asset::FontWeight;
use rux_ast::widget::TextAlign;
use rux_ast::theme::{
    BorderRadii, ColorPalette, ColorPalettes, ColorScheme, ShadowToken, SpacingScale, ThemeConfig,
    TypeScale, TypeStyle,
};
use rux_ast::widget::{PropertyValue, WidgetProperties, WidgetType};

use crate::downloader::DownloadedAssetsReport;
use crate::models::FigmaNode;

pub struct ClassificationResult {
    pub widget_type: WidgetType,
    pub properties: WidgetProperties,
    pub should_absorb_children: bool,
}

pub struct HeuristicClassifier;

impl Default for HeuristicClassifier {
    fn default() -> Self {
        Self::new()
    }
}

impl HeuristicClassifier {
    pub fn new() -> Self {
        Self
    }

    pub fn classify_node(
        &self,
        node: &FigmaNode,
        assets: Option<&DownloadedAssetsReport>,
    ) -> ClassificationResult {
        let name_lower = node.name.to_lowercase();

        if node.node_type == "TEXT" {
            let mut props = WidgetProperties::default();
            props.text = node.characters.clone().map(PropertyValue::Static);
            props.opacity = node.opacity;

            if let Some(ref style) = node.style {
                props.font_size = Some(style.font_size);
                props.font_weight = Some(Self::map_font_weight(style.font_weight));
                props.text_align = style
                    .text_align_horizontal
                    .as_deref()
                    .and_then(Self::map_text_align);
            }

            if let Some(fill) = node.primary_fill_color() {
                props.text_color = Some(fill);
            }

            return ClassificationResult {
                widget_type: WidgetType::Label,
                properties: props,
                should_absorb_children: false,
            };
        }

        if node.is_vector() {
            let mut props = WidgetProperties::default();
            props.background_color = node.primary_fill_color();
            props.border_color = node.primary_stroke_color();
            props.border_width = node.stroke_weight;
            props.corner_radius = node.corner_radius;
            props.opacity = node.opacity;

            let has_icon_alias = assets.and_then(|report| report.node_icon_map.get(&node.id)).is_some();
            if let Some(report) = assets {
                if let Some(alias) = report.node_icon_map.get(&node.id) {
                    props.text = Some(PropertyValue::Static(alias.clone()));
                }
            }

            // Graceful fallback to GenericWidget or Rectangle for unsupported vector nodes
            let widget_type = match node.node_type.as_str() {
                "ELLIPSE" => WidgetType::Circle,
                "LINE" => WidgetType::Line,
                "VECTOR" if has_icon_alias => WidgetType::Path,
                "STAR" | "REGULAR_POLYGON" => {
                    props.custom_type = Some(node.node_type.to_lowercase());
                    WidgetType::GenericWidget
                }
                "BOOLEAN_OPERATION" => {
                    props.custom_type = Some("boolean_operation".to_string());
                    WidgetType::GenericWidget
                }
                _ => {
                    if node.children.is_empty() {
                        WidgetType::Rectangle
                    } else {
                        props.custom_type = Some(node.node_type.to_lowercase());
                        WidgetType::GenericWidget
                    }
                }
            };

            return ClassificationResult {
                widget_type,
                properties: props,
                should_absorb_children: false,
            };
        }

        if node.node_type == "RECTANGLE" {
            let mut props = WidgetProperties::default();
            props.background_color = node.primary_fill_color();
            props.border_color = node.primary_stroke_color();
            props.border_width = node.stroke_weight;
            props.corner_radius = node.corner_radius;
            props.opacity = node.opacity;

            return ClassificationResult {
                widget_type: WidgetType::Rectangle,
                properties: props,
                should_absorb_children: false,
            };
        }

        if Self::matches_button_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.background_color = node.primary_fill_color();
            props.border_color = node.primary_stroke_color();
            props.border_width = node.stroke_weight;
            props.corner_radius = node.corner_radius.or_else(|| {
                node.rectangle_corner_radii
                    .and_then(|r| r.first().copied())
            });

            if let Some(text_child) = Self::find_first_text_child(node) {
                props.text = text_child.characters.clone().map(PropertyValue::Static);
                if let Some(ref style) = text_child.style {
                    props.font_size = Some(style.font_size);
                    props.font_weight = Some(Self::map_font_weight(style.font_weight));
                }
                if let Some(text_fill) = text_child.primary_fill_color() {
                    props.text_color = Some(text_fill);
                }
            } else {
                props.text = Some(PropertyValue::Static(node.name.clone()));
            }

            return ClassificationResult {
                widget_type: WidgetType::Button,
                properties: props,
                should_absorb_children: true,
            };
        }

        if Self::matches_input_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.background_color = node.primary_fill_color();
            props.border_color = node.primary_stroke_color();
            props.border_width = node.stroke_weight;
            props.corner_radius = node.corner_radius;

            if let Some(text_child) = Self::find_first_text_child(node) {
                props.placeholder = text_child.characters.clone().map(PropertyValue::Static);
            } else {
                props.placeholder = Some(PropertyValue::Static("Enter value...".to_string()));
            }

            return ClassificationResult {
                widget_type: WidgetType::TextInput,
                properties: props,
                should_absorb_children: true,
            };
        }

        if Self::matches_checkbox_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.border_color = node.primary_stroke_color();
            props.background_color = node.primary_fill_color();
            props.corner_radius = node.corner_radius.unwrap_or(4.0).into();
            props.checked = Some(name_lower.contains("checked") || name_lower.contains("true") || !node.children.is_empty());

            return ClassificationResult {
                widget_type: WidgetType::Checkbox,
                properties: props,
                should_absorb_children: true,
            };
        }

        if Self::matches_radio_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.border_color = node.primary_stroke_color();
            props.background_color = node.primary_fill_color();
            props.checked = Some(name_lower.contains("checked") || name_lower.contains("selected"));

            return ClassificationResult {
                widget_type: WidgetType::RadioButton,
                properties: props,
                should_absorb_children: true,
            };
        }

        if Self::matches_slider_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.min_value = Some(0.0);
            props.max_value = Some(100.0);
            props.current_value = Some(50.0);

            return ClassificationResult {
                widget_type: WidgetType::Slider,
                properties: props,
                should_absorb_children: true,
            };
        }

        if Self::matches_progress_pattern(&name_lower, node) {
            let mut props = WidgetProperties::default();
            props.min_value = Some(0.0);
            props.max_value = Some(100.0);
            props.current_value = Some(65.0);

            return ClassificationResult {
                widget_type: WidgetType::ProgressBar,
                properties: props,
                should_absorb_children: true,
            };
        }

        if name_lower.contains("datagrid") || name_lower.contains("table") {
            let mut props = WidgetProperties::default();
            props.grid_virtualized = Some(true);
            props.row_height = Some(36.0);
            props.total_rows = Some(1000);

            return ClassificationResult {
                widget_type: WidgetType::DataGrid,
                properties: props,
                should_absorb_children: false,
            };
        }

        if name_lower.contains("chart") || name_lower.contains("graph") {
            let mut props = WidgetProperties::default();
            props.chart_type = Some("line".to_string());
            props.chart_show_grid = Some(true);
            props.chart_show_legend = Some(true);

            return ClassificationResult {
                widget_type: WidgetType::Chart,
                properties: props,
                should_absorb_children: false,
            };
        }

        if name_lower.contains("treeview") || name_lower.contains("tree") {
            let mut props = WidgetProperties::default();
            props.tree_expand_all = Some(true);
            props.tree_show_root = Some(true);

            return ClassificationResult {
                widget_type: WidgetType::TreeView,
                properties: props,
                should_absorb_children: false,
            };
        }

        let is_wrap = node.layout_wrap.as_deref() == Some("WRAP");
        let is_grid = is_wrap || name_lower.contains("grid") || node.layout_mode.as_deref() == Some("GRID");

        let container_type = if is_grid {
            WidgetType::Grid
        } else if node.layout_mode.as_deref() == Some("HORIZONTAL") {
            WidgetType::HBox
        } else {
            WidgetType::VBox
        };

        let mut props = WidgetProperties::default();
        props.background_color = node.primary_fill_color();
        props.border_color = node.primary_stroke_color();
        props.border_width = node.stroke_weight;
        props.corner_radius = node.corner_radius;
        props.opacity = node.opacity;

        // AutoLayout properties: spacing & padding
        props.spacing = node.spacing.or(node.item_spacing);
        props.padding = node.padding.or(node.padding_top).or(node.padding_left).or(node.padding_right).or(node.padding_bottom);

        // Fill width / Fill height translation
        let fill_w = node.fill_width.unwrap_or_else(|| {
            node.layout_sizing_horizontal.as_deref() == Some("FILL")
                || (node.layout_mode.as_deref() == Some("HORIZONTAL") && node.layout_grow == Some(1.0))
                || (node.layout_mode.as_deref() == Some("VERTICAL") && node.layout_align.as_deref() == Some("STRETCH"))
        });
        if fill_w {
            props.fill_width = Some(true);
        }

        let fill_h = node.fill_height.unwrap_or_else(|| {
            node.layout_sizing_vertical.as_deref() == Some("FILL")
                || (node.layout_mode.as_deref() == Some("VERTICAL") && node.layout_grow == Some(1.0))
                || (node.layout_mode.as_deref() == Some("HORIZONTAL") && node.layout_align.as_deref() == Some("STRETCH"))
        });
        if fill_h {
            props.fill_height = Some(true);
        }

        ClassificationResult {
            widget_type: container_type,
            properties: props,
            should_absorb_children: false,
        }
    }

    pub fn extract_theme_config(&self, root_node: &FigmaNode) -> ThemeConfig {
        let mut solid_colors = Vec::new();
        let mut shadows = Vec::new();
        let mut border_radii = Vec::new();

        self.collect_styles_recursive(root_node, &mut solid_colors, &mut shadows, &mut border_radii);

        let background_color = root_node.primary_fill_color().unwrap_or_else(|| "#12141C".to_string());
        let primary_color = solid_colors
            .iter()
            .find(|c| *c != &background_color && *c != "#000000" && *c != "#FFFFFF")
            .cloned()
            .unwrap_or_else(|| "#4C7EFF".to_string());

        let text_color = solid_colors
            .iter()
            .find(|c| *c == "#FFFFFF" || *c == "#F0F0F0" || *c == "#E0E0E0")
            .cloned()
            .unwrap_or_else(|| "#F5F7FA".to_string());

        let surface_color = solid_colors
            .iter()
            .find(|c| *c != &background_color && *c != &primary_color)
            .cloned()
            .unwrap_or_else(|| "#1B1E2B".to_string());

        let dark_palette = ColorPalette {
            primary: primary_color.clone(),
            on_primary: "#FFFFFF".to_string(),
            primary_container: "#2A3B66".to_string(),
            on_primary_container: "#D6E3FF".to_string(),
            secondary: "#60A5FA".to_string(),
            on_secondary: "#000000".to_string(),
            secondary_container: "#1E3A8A".to_string(),
            on_secondary_container: "#BFDBFE".to_string(),
            tertiary: "#34D399".to_string(),
            on_tertiary: "#000000".to_string(),
            tertiary_container: "#065F46".to_string(),
            on_tertiary_container: "#A7F3D0".to_string(),
            error: "#F87171".to_string(),
            on_error: "#000000".to_string(),
            error_container: "#7F1D1D".to_string(),
            on_error_container: "#FECACA".to_string(),
            surface: surface_color.clone(),
            on_surface: text_color.clone(),
            surface_variant: "#25293A".to_string(),
            on_surface_variant: "#9CA3AF".to_string(),
            outline: "#374151".to_string(),
            outline_variant: "#4B5563".to_string(),
            background: background_color.clone(),
            on_background: text_color,
            inverse_surface: "#E5E7EB".to_string(),
            inverse_on_surface: "#111827".to_string(),
            inverse_primary: "#2563EB".to_string(),
            scrim: "#000000".to_string(),
            shadow: "#000000".to_string(),
        };

        let light_palette = ColorPalette {
            primary: primary_color,
            on_primary: "#FFFFFF".to_string(),
            primary_container: "#D6E3FF".to_string(),
            on_primary_container: "#001B3E".to_string(),
            secondary: "#3B82F6".to_string(),
            on_secondary: "#FFFFFF".to_string(),
            secondary_container: "#DBEAFE".to_string(),
            on_secondary_container: "#1E40AF".to_string(),
            tertiary: "#10B981".to_string(),
            on_tertiary: "#FFFFFF".to_string(),
            tertiary_container: "#D1FAE5".to_string(),
            on_tertiary_container: "#065F46".to_string(),
            error: "#EF4444".to_string(),
            on_error: "#FFFFFF".to_string(),
            error_container: "#FEE2E2".to_string(),
            on_error_container: "#991B1B".to_string(),
            surface: "#FFFFFF".to_string(),
            on_surface: "#111827".to_string(),
            surface_variant: "#F3F4F6".to_string(),
            on_surface_variant: "#4B5563".to_string(),
            outline: "#D1D5DB".to_string(),
            outline_variant: "#E5E7EB".to_string(),
            background: "#F9FAFB".to_string(),
            on_background: "#111827".to_string(),
            inverse_surface: "#1F2937".to_string(),
            inverse_on_surface: "#F9FAFB".to_string(),
            inverse_primary: "#93C5FD".to_string(),
            scrim: "#000000".to_string(),
            shadow: "#000000".to_string(),
        };

        let shadow_tokens = if !shadows.is_empty() {
            shadows
        } else {
            vec![
                ShadowToken {
                    name: "sm".to_string(),
                    offset_x: 0.0,
                    offset_y: 1.0,
                    blur_radius: 2.0,
                    spread_radius: 0.0,
                    color: "rgba(0,0,0,0.15)".to_string(),
                },
                ShadowToken {
                    name: "md".to_string(),
                    offset_x: 0.0,
                    offset_y: 4.0,
                    blur_radius: 8.0,
                    spread_radius: -1.0,
                    color: "rgba(0,0,0,0.25)".to_string(),
                },
            ]
        };

        ThemeConfig {
            active_scheme: ColorScheme::Dark,
            color_palettes: ColorPalettes {
                light: light_palette,
                dark: dark_palette,
            },
            typography: Self::default_type_scale(),
            border_radii: BorderRadii {
                none: 0.0,
                sm: 4.0,
                md: 8.0,
                lg: 12.0,
                xl: 16.0,
                full: 9999.0,
            },
            shadows: shadow_tokens,
            spacing: SpacingScale {
                none: 0.0,
                xs: 4.0,
                sm: 8.0,
                md: 16.0,
                lg: 24.0,
                xl: 32.0,
                xxl: 48.0,
            },
        }
    }

    fn collect_styles_recursive(
        &self,
        node: &FigmaNode,
        solid_colors: &mut Vec<String>,
        shadows: &mut Vec<ShadowToken>,
        border_radii: &mut Vec<f64>,
    ) {
        if let Some(color) = node.primary_fill_color() {
            if !solid_colors.contains(&color) {
                solid_colors.push(color);
            }
        }

        if let Some(radius) = node.corner_radius {
            if radius > 0.0 && !border_radii.contains(&radius) {
                border_radii.push(radius);
            }
        }

        for effect in &node.effects {
            if effect.visible && effect.effect_type == "DROP_SHADOW" {
                let color_str = effect
                    .color
                    .as_ref()
                    .map(|c| c.to_hex())
                    .unwrap_or_else(|| "rgba(0,0,0,0.25)".to_string());
                let offset = effect.offset.clone().unwrap_or_default();
                let token = ShadowToken {
                    name: format!("figma_shadow_{}", shadows.len() + 1),
                    offset_x: offset.x,
                    offset_y: offset.y,
                    blur_radius: effect.radius,
                    spread_radius: effect.spread.unwrap_or(0.0),
                    color: color_str,
                };
                shadows.push(token);
            }
        }

        for child in &node.children {
            self.collect_styles_recursive(child, solid_colors, shadows, border_radii);
        }
    }

    fn matches_button_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("button")
            || name_lower.contains("btn")
            || name_lower.contains("cta")
            || name_lower.starts_with("#button")
            || name_lower == "submit"
            || name_lower == "action"
        {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            let h = bbox.height;
            let w = bbox.width;
            if (28.0..=64.0).contains(&h) && (60.0..=320.0).contains(&w) {
                let has_bg = node.primary_fill_color().is_some() || node.corner_radius.unwrap_or(0.0) > 0.0;
                let text_count = node.children.iter().filter(|c| c.node_type == "TEXT").count();
                if has_bg && text_count == 1 && node.children.len() <= 2 {
                    return true;
                }
            }
        }

        false
    }

    fn matches_input_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("input")
            || name_lower.contains("textfield")
            || name_lower.contains("text-field")
            || name_lower.contains("searchbar")
            || name_lower.contains("entry")
        {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            let h = bbox.height;
            let w = bbox.width;
            if (28.0..=56.0).contains(&h) && (100.0..=480.0).contains(&w) {
                let has_stroke = node.primary_stroke_color().is_some();
                let text_count = node.children.iter().filter(|c| c.node_type == "TEXT").count();
                if has_stroke && text_count <= 1 {
                    return true;
                }
            }
        }

        false
    }

    fn matches_checkbox_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("checkbox")
            || name_lower.contains("check-box")
            || name_lower.contains("toggle_box")
        {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            let diff = (bbox.width - bbox.height).abs();
            if diff <= 4.0 && (14.0..=30.0).contains(&bbox.width)
                && node.corner_radius.unwrap_or(0.0) <= 6.0 {
                    return true;
                }
        }

        false
    }

    fn matches_radio_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("radio") {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            let diff = (bbox.width - bbox.height).abs();
            if diff <= 4.0 && (14.0..=30.0).contains(&bbox.width)
                && (node.corner_radius.unwrap_or(0.0) >= 8.0 || node.node_type == "ELLIPSE") {
                    return true;
                }
        }

        false
    }

    fn matches_slider_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("slider") || name_lower.contains("range") || name_lower.contains("seek") {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            if bbox.height <= 12.0 && bbox.width >= 60.0 {
                return true;
            }
        }

        false
    }

    fn matches_progress_pattern(name_lower: &str, node: &FigmaNode) -> bool {
        if name_lower.contains("progress") || name_lower.contains("loader") {
            return true;
        }

        if let Some(ref bbox) = node.absolute_bounding_box {
            if bbox.height <= 16.0 && bbox.width >= 60.0 && node.children.len() == 1 {
                return true;
            }
        }

        false
    }

    fn find_first_text_child(node: &FigmaNode) -> Option<&FigmaNode> {
        for child in &node.children {
            if child.node_type == "TEXT" {
                return Some(child);
            }
            if let Some(nested) = Self::find_first_text_child(child) {
                return Some(nested);
            }
        }
        None
    }

    fn map_font_weight(w: f64) -> FontWeight {
        if w <= 150.0 {
            FontWeight::Thin
        } else if w <= 250.0 {
            FontWeight::ExtraLight
        } else if w <= 350.0 {
            FontWeight::Light
        } else if w <= 450.0 {
            FontWeight::Normal
        } else if w <= 550.0 {
            FontWeight::Medium
        } else if w <= 650.0 {
            FontWeight::SemiBold
        } else if w <= 750.0 {
            FontWeight::Bold
        } else if w <= 850.0 {
            FontWeight::ExtraBold
        } else {
            FontWeight::Black
        }
    }

    fn map_text_align(align: &str) -> Option<TextAlign> {
        match align {
            "LEFT" => Some(TextAlign::Left),
            "CENTER" => Some(TextAlign::Center),
            "RIGHT" => Some(TextAlign::Right),
            "JUSTIFIED" => Some(TextAlign::Justify),
            _ => None,
        }
    }

    fn default_type_scale() -> TypeScale {
        let base = TypeStyle {
            font_family: "Inter".to_string(),
            font_weight: "Normal".to_string(),
            font_size: 14.0,
            line_height: 20.0,
            letter_spacing: 0.0,
        };

        TypeScale {
            display_large: TypeStyle { font_size: 57.0, line_height: 64.0, ..base.clone() },
            display_medium: TypeStyle { font_size: 45.0, line_height: 52.0, ..base.clone() },
            display_small: TypeStyle { font_size: 36.0, line_height: 44.0, ..base.clone() },
            headline_large: TypeStyle { font_size: 32.0, line_height: 40.0, ..base.clone() },
            headline_medium: TypeStyle { font_size: 28.0, line_height: 36.0, ..base.clone() },
            headline_small: TypeStyle { font_size: 24.0, line_height: 32.0, ..base.clone() },
            title_large: TypeStyle { font_size: 22.0, line_height: 28.0, ..base.clone() },
            title_medium: TypeStyle { font_size: 16.0, line_height: 24.0, ..base.clone() },
            title_small: TypeStyle { font_size: 14.0, line_height: 20.0, ..base.clone() },
            body_large: TypeStyle { font_size: 16.0, line_height: 24.0, ..base.clone() },
            body_medium: TypeStyle { font_size: 14.0, line_height: 20.0, ..base.clone() },
            body_small: TypeStyle { font_size: 12.0, line_height: 16.0, ..base.clone() },
            label_large: TypeStyle { font_size: 14.0, line_height: 20.0, ..base.clone() },
            label_medium: TypeStyle { font_size: 12.0, line_height: 16.0, ..base.clone() },
            label_small: TypeStyle { font_size: 11.0, line_height: 16.0, ..base },
        }
    }
}
