use std::collections::HashSet;
use thiserror::Error;

use crate::document::RuxDocument;
use crate::layout::Size;
use crate::widget::{WidgetNode, WidgetType};

#[derive(Debug, Clone, PartialEq, Error)]
pub enum ValidationError {
    #[error("JSON syntax error at line {line}, column {column}: {message}")]
    JsonSyntaxError {
        message: String,
        line: usize,
        column: usize,
    },

    #[error("Duplicate widget identifier: '{id}'")]
    DuplicateNodeId { id: String },

    #[error("Invalid widget identifier '{id}': {reason}")]
    InvalidIdentifier { id: String, reason: String },

    #[error("Maximum tree depth of {max_depth} exceeded at node '{node_id}' (depth: {current_depth})")]
    MaxDepthExceeded {
        max_depth: usize,
        current_depth: usize,
        node_id: String,
    },

    #[error("Widget '{node_id}' of type '{widget_type:?}' is a leaf widget and cannot have children (found {children_count})")]
    DisallowedChildren {
        widget_type: WidgetType,
        node_id: String,
        children_count: usize,
    },

    #[error("Widget '{node_id}' has invalid slot '{slot}' for parent of type '{parent_widget_type:?}'")]
    InvalidSlot {
        node_id: String,
        slot: String,
        parent_widget_type: WidgetType,
    },

    #[error("Parent widget '{parent_id}' contains duplicate slot assignment: '{slot}'")]
    DuplicateSlot { parent_id: String, slot: String },

    #[error("Widget '{node_id}' has invalid {dimension} dimension: {value} ({reason})")]
    InvalidDimension {
        node_id: String,
        dimension: String,
        value: f64,
        reason: String,
    },

    #[error("Widget '{node_id}' has invalid {dimension} range: min ({min}) exceeds max ({max})")]
    InvalidMinMax {
        node_id: String,
        dimension: String,
        min: f64,
        max: f64,
    },

    #[error("Widget '{node_id}' references unknown {asset_type} alias '{alias}'")]
    AssetNotFound {
        node_id: String,
        asset_type: String,
        alias: String,
    },

    #[error("Widget '{node_id}' references unknown {token_type} token '{token_name}'")]
    ThemeTokenNotFound {
        node_id: String,
        token_type: String,
        token_name: String,
    },

    #[error("Widget '{node_id}' has invalid opacity value {value}: must be between 0.0 and 1.0")]
    InvalidOpacity { node_id: String, value: f64 },

    #[error("Widget '{node_id}' has invalid aspect ratio {value}: must be strictly greater than 0")]
    InvalidAspectRatio { node_id: String, value: f64 },
}

pub struct DocumentValidator {
    max_depth: usize,
}

impl Default for DocumentValidator {
    fn default() -> Self {
        Self { max_depth: 64 }
    }
}

impl DocumentValidator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_max_depth(mut self, depth: usize) -> Self {
        self.max_depth = depth;
        self
    }

    pub fn validate_json(&self, json_str: &str) -> Result<RuxDocument, Vec<ValidationError>> {
        if json_str.trim().is_empty() {
            return Ok(RuxDocument::default());
        }
        match RuxDocument::from_json(json_str) {
            Ok(doc) => {
                let mut errors = Vec::new();
                self.validate_document_internal(&doc, &mut errors);
                if errors.is_empty() {
                    Ok(doc)
                } else {
                    Err(errors)
                }
            }
            Err(e) => {
                let line = e.line();
                let column = e.column();
                let message = e.to_string();
                Err(vec![ValidationError::JsonSyntaxError {
                    message,
                    line,
                    column,
                }])
            }
        }
    }

    pub fn validate_document(&self, doc: &RuxDocument) -> Result<(), Vec<ValidationError>> {
        let mut errors = Vec::new();
        self.validate_document_internal(doc, &mut errors);
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    fn validate_document_internal(&self, doc: &RuxDocument, errors: &mut Vec<ValidationError>) {
        let mut visited_ids = HashSet::new();
        let font_aliases: HashSet<String> = doc
            .assets
            .fonts
            .iter()
            .map(|f| f.alias.clone())
            .collect();
        let shadow_names: HashSet<String> = doc
            .theme
            .shadows
            .iter()
            .map(|s| s.name.clone())
            .collect();

        self.validate_node_recursive(
            &doc.root,
            None,
            1,
            &mut visited_ids,
            &font_aliases,
            &shadow_names,
            errors,
        );
    }

    fn validate_node_recursive(
        &self,
        node: &WidgetNode,
        parent: Option<&WidgetNode>,
        depth: usize,
        visited_ids: &mut HashSet<String>,
        font_aliases: &HashSet<String>,
        shadow_names: &HashSet<String>,
        errors: &mut Vec<ValidationError>,
    ) {
        if depth > self.max_depth {
            errors.push(ValidationError::MaxDepthExceeded {
                max_depth: self.max_depth,
                current_depth: depth,
                node_id: node.id.clone(),
            });
            return;
        }

        if !self.is_valid_identifier(&node.id) {
            errors.push(ValidationError::InvalidIdentifier {
                id: node.id.clone(),
                reason: "must be a valid alphanumeric identifier starting with a letter or underscore and not a reserved keyword".to_string(),
            });
        }

        if !visited_ids.insert(node.id.clone()) {
            errors.push(ValidationError::DuplicateNodeId {
                id: node.id.clone(),
            });
        }

        if node.widget_type.is_leaf() && !node.children.is_empty() {
            errors.push(ValidationError::DisallowedChildren {
                widget_type: node.widget_type.clone(),
                node_id: node.id.clone(),
                children_count: node.children.len(),
            });
        }

        if let Some(parent_node) = parent {
            if parent_node.widget_type == WidgetType::BorderPane {
                if let Some(ref slot) = node.slot {
                    let valid_slots = ["top", "bottom", "left", "right", "center"];
                    if !valid_slots.contains(&slot.as_str()) {
                        errors.push(ValidationError::InvalidSlot {
                            node_id: node.id.clone(),
                            slot: slot.clone(),
                            parent_widget_type: parent_node.widget_type.clone(),
                        });
                    }
                }
            }
        }

        if node.widget_type == WidgetType::BorderPane {
            let mut seen_slots = HashSet::new();
            for child in &node.children {
                if let Some(ref slot) = child.slot {
                    if !seen_slots.insert(slot.clone()) {
                        errors.push(ValidationError::DuplicateSlot {
                            parent_id: node.id.clone(),
                            slot: slot.clone(),
                        });
                    }
                }
            }
        }

        self.validate_properties(node, font_aliases, shadow_names, errors);

        if let Some(ref layout) = node.layout {
            self.validate_layout(node, layout, errors);
        }

        for child in &node.children {
            self.validate_node_recursive(
                child,
                Some(node),
                depth + 1,
                visited_ids,
                font_aliases,
                shadow_names,
                errors,
            );
        }
    }

    fn validate_properties(
        &self,
        node: &WidgetNode,
        font_aliases: &HashSet<String>,
        shadow_names: &HashSet<String>,
        errors: &mut Vec<ValidationError>,
    ) {
        if let Some(opacity) = node.properties.opacity {
            if !(0.0..=1.0).contains(&opacity) {
                errors.push(ValidationError::InvalidOpacity {
                    node_id: node.id.clone(),
                    value: opacity,
                });
            }
        }

        if let Some(ref font_alias) = node.properties.font_alias {
            if !font_aliases.is_empty() && !font_aliases.contains(font_alias) {
                errors.push(ValidationError::AssetNotFound {
                    node_id: node.id.clone(),
                    asset_type: "font".to_string(),
                    alias: font_alias.clone(),
                });
            }
        }

        if let Some(ref shadow_ref) = node.properties.shadow_ref {
            if !shadow_names.is_empty() && !shadow_names.contains(shadow_ref) {
                errors.push(ValidationError::ThemeTokenNotFound {
                    node_id: node.id.clone(),
                    token_type: "shadow".to_string(),
                    token_name: shadow_ref.clone(),
                });
            }
        }

        if let (Some(min), Some(max)) = (node.properties.min_value, node.properties.max_value) {
            if min > max {
                errors.push(ValidationError::InvalidMinMax {
                    node_id: node.id.clone(),
                    dimension: "range value".to_string(),
                    min,
                    max,
                });
            }
        }
    }

    fn validate_layout(
        &self,
        node: &WidgetNode,
        layout: &crate::layout::WidgetLayout,
        errors: &mut Vec<ValidationError>,
    ) {
        let dims = &layout.dimensions;

        if let Size::Fixed(w) = dims.width {
            if w < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: "width".to_string(),
                    value: w,
                    reason: "fixed width must be non-negative".to_string(),
                });
            }
        }

        if let Size::Fixed(h) = dims.height {
            if h < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: "height".to_string(),
                    value: h,
                    reason: "fixed height must be non-negative".to_string(),
                });
            }
        }

        if let Some(min_w) = dims.min_width {
            if min_w < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: "min_width".to_string(),
                    value: min_w,
                    reason: "min_width must be non-negative".to_string(),
                });
            }
        }

        if let Some(min_h) = dims.min_height {
            if min_h < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: "min_height".to_string(),
                    value: min_h,
                    reason: "min_height must be non-negative".to_string(),
                });
            }
        }

        if let (Some(min_w), Some(max_w)) = (dims.min_width, dims.max_width) {
            if min_w > max_w {
                errors.push(ValidationError::InvalidMinMax {
                    node_id: node.id.clone(),
                    dimension: "width".to_string(),
                    min: min_w,
                    max: max_w,
                });
            }
        }

        if let (Some(min_h), Some(max_h)) = (dims.min_height, dims.max_height) {
            if min_h > max_h {
                errors.push(ValidationError::InvalidMinMax {
                    node_id: node.id.clone(),
                    dimension: "height".to_string(),
                    min: min_h,
                    max: max_h,
                });
            }
        }

        if let Some(aspect) = dims.aspect_ratio {
            if aspect <= 0.0 {
                errors.push(ValidationError::InvalidAspectRatio {
                    node_id: node.id.clone(),
                    value: aspect,
                });
            }
        }

        let p = &layout.spacing.padding;
        for (name, val) in [
            ("padding.top", p.top),
            ("padding.right", p.right),
            ("padding.bottom", p.bottom),
            ("padding.left", p.left),
        ] {
            if val < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: name.to_string(),
                    value: val,
                    reason: "padding values must be non-negative".to_string(),
                });
            }
        }

        let m = &layout.spacing.margin;
        for (name, val) in [
            ("margin.top", m.top),
            ("margin.right", m.right),
            ("margin.bottom", m.bottom),
            ("margin.left", m.left),
        ] {
            if val < 0.0 {
                errors.push(ValidationError::InvalidDimension {
                    node_id: node.id.clone(),
                    dimension: name.to_string(),
                    value: val,
                    reason: "margin values must be non-negative".to_string(),
                });
            }
        }
    }

    fn is_valid_identifier(&self, id: &str) -> bool {
        if id.is_empty() {
            return false;
        }

        let first = id.chars().next().unwrap();
        if !first.is_ascii_alphabetic() && first != '_' {
            return false;
        }

        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return false;
        }

        !self.is_reserved_keyword(id)
    }

    fn is_reserved_keyword(&self, name: &str) -> bool {
        matches!(
            name,
            "as" | "break"
                | "const"
                | "continue"
                | "crate"
                | "else"
                | "enum"
                | "extern"
                | "false"
                | "fn"
                | "for"
                | "if"
                | "impl"
                | "in"
                | "let"
                | "loop"
                | "match"
                | "mod"
                | "move"
                | "mut"
                | "pub"
                | "ref"
                | "return"
                | "self"
                | "Self"
                | "static"
                | "struct"
                | "super"
                | "trait"
                | "true"
                | "type"
                | "unsafe"
                | "use"
                | "where"
                | "while"
                | "async"
                | "await"
                | "dyn"
                | "abstract"
                | "become"
                | "box"
                | "do"
                | "final"
                | "macro"
                | "override"
                | "priv"
                | "typeof"
                | "unsized"
                | "virtual"
                | "yield"
                | "try"
                | "def"
                | "class"
                | "import"
                | "from"
                | "lambda"
                | "pass"
                | "raise"
                | "except"
                | "with"
                | "func"
                | "var"
                | "package"
                | "chan"
                | "defer"
                | "go"
                | "interface"
                | "map"
                | "range"
                | "select"
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset::{AssetRegistry, FontAsset, FontStyle, FontWeight};
    use crate::document::RuxDocument;
    use crate::layout::{Dimensions, Size, Spacing, WidgetLayout};
    use crate::metadata::{ProjectMetadata, TargetFramework};
    use crate::theme::{
        BorderRadii, ColorPalette, ColorPalettes, ColorScheme, ShadowToken, SpacingScale,
        ThemeConfig, TypeScale, TypeStyle,
    };
    use crate::widget::{WidgetBindings, WidgetEvents, WidgetNode, WidgetProperties, WidgetType};
    use crate::window::{ScaleMode, WindowConfig};

    fn make_test_palette() -> ColorPalette {
        ColorPalette {
            primary: "#6750A4".to_string(),
            on_primary: "#FFFFFF".to_string(),
            primary_container: "#EADDFF".to_string(),
            on_primary_container: "#21005D".to_string(),
            secondary: "#625B71".to_string(),
            on_secondary: "#FFFFFF".to_string(),
            secondary_container: "#E8DEF8".to_string(),
            on_secondary_container: "#1D192B".to_string(),
            tertiary: "#7D5260".to_string(),
            on_tertiary: "#FFFFFF".to_string(),
            tertiary_container: "#FFD8E4".to_string(),
            on_tertiary_container: "#31111D".to_string(),
            error: "#B3261E".to_string(),
            on_error: "#FFFFFF".to_string(),
            error_container: "#F9DEDC".to_string(),
            on_error_container: "#410E0B".to_string(),
            surface: "#FEF7FF".to_string(),
            on_surface: "#1D1B20".to_string(),
            surface_variant: "#E7E0EC".to_string(),
            on_surface_variant: "#49454F".to_string(),
            outline: "#79747E".to_string(),
            outline_variant: "#CAC4D0".to_string(),
            background: "#FEF7FF".to_string(),
            on_background: "#1D1B20".to_string(),
            inverse_surface: "#313033".to_string(),
            inverse_on_surface: "#F4EFF4".to_string(),
            inverse_primary: "#D0BCFF".to_string(),
            scrim: "#000000".to_string(),
            shadow: "#000000".to_string(),
        }
    }

    fn make_test_type_style() -> TypeStyle {
        TypeStyle {
            font_family: "Inter".to_string(),
            font_weight: "normal".to_string(),
            font_size: 14.0,
            line_height: 20.0,
            letter_spacing: 0.1,
        }
    }

    fn make_test_type_scale() -> TypeScale {
        let style = make_test_type_style();
        TypeScale {
            display_large: style.clone(),
            display_medium: style.clone(),
            display_small: style.clone(),
            headline_large: style.clone(),
            headline_medium: style.clone(),
            headline_small: style.clone(),
            title_large: style.clone(),
            title_medium: style.clone(),
            title_small: style.clone(),
            body_large: style.clone(),
            body_medium: style.clone(),
            body_small: style.clone(),
            label_large: style.clone(),
            label_medium: style.clone(),
            label_small: style,
        }
    }

    fn make_valid_document(root: WidgetNode) -> RuxDocument {
        RuxDocument {
            schema_ref: Some("https://ruxel.dev/schemas/rux-document.schema.json".to_string()),
            schema_version: Some("1.0.0".to_string()),
            version: Some("0.1.0".to_string()),
            metadata: ProjectMetadata {
                schema_version: "1.0.0".to_string(),
                app_name: "TestApp".to_string(),
                app_version: "0.1.0".to_string(),
                target_frameworks: vec![TargetFramework::Iced],
                description: None,
                authors: vec![],
                license: None,
                created_at: None,
                updated_at: None,
            },
            window: WindowConfig {
                title: "Test Window".to_string(),
                initial_width: 800.0,
                initial_height: 600.0,
                min_width: Some(400.0),
                min_height: Some(300.0),
                max_width: None,
                max_height: None,
                resizable: true,
                scale_mode: ScaleMode::Logical,
                transparent: false,
                decorations: true,
                always_on_top: false,
                fullscreen: false,
                position_x: None,
                position_y: None,
            },
            assets: AssetRegistry {
                fonts: vec![FontAsset {
                    alias: "inter_regular".to_string(),
                    path: "assets/fonts/Inter-Regular.ttf".to_string(),
                    weight: FontWeight::Normal,
                    style: FontStyle::Normal,
                }],
                icons: vec![],
                images: vec![],
            },
            i18n: None,
            theme: ThemeConfig {
                active_scheme: ColorScheme::Light,
                color_palettes: ColorPalettes {
                    light: make_test_palette(),
                    dark: make_test_palette(),
                },
                typography: make_test_type_scale(),
                border_radii: BorderRadii {
                    none: 0.0,
                    sm: 4.0,
                    md: 8.0,
                    lg: 16.0,
                    xl: 24.0,
                    full: 9999.0,
                },
                shadows: vec![ShadowToken {
                    name: "elevation_low".to_string(),
                    offset_x: 0.0,
                    offset_y: 2.0,
                    blur_radius: 4.0,
                    spread_radius: 0.0,
                    color: "#00000020".to_string(),
                }],
                spacing: SpacingScale {
                    none: 0.0,
                    xs: 4.0,
                    sm: 8.0,
                    md: 16.0,
                    lg: 24.0,
                    xl: 32.0,
                    xxl: 48.0,
                },
            },
            root,
        }
    }

    fn make_leaf_node(id: &str, widget_type: WidgetType) -> WidgetNode {
        WidgetNode {
            id: id.to_string(),
            widget_type,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: vec![],
            children: vec![],
        }
    }

    fn make_container_node(id: &str, widget_type: WidgetType, children: Vec<WidgetNode>) -> WidgetNode {
        WidgetNode {
            id: id.to_string(),
            widget_type,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: vec![],
            children,
        }
    }

    #[test]
    fn test_valid_document_validation() {
        let root = make_container_node(
            "root_vbox",
            WidgetType::VBox,
            vec![
                make_leaf_node("title_label", WidgetType::Label),
                make_leaf_node("submit_btn", WidgetType::Button),
            ],
        );
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        assert!(validator.validate_document(&doc).is_ok());
    }

    #[test]
    fn test_duplicate_identifier_detection() {
        let root = make_container_node(
            "same_id",
            WidgetType::VBox,
            vec![make_leaf_node("same_id", WidgetType::Button)],
        );
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::DuplicateNodeId { .. })));
    }

    #[test]
    fn test_invalid_identifier_leading_digit() {
        let root = make_leaf_node("123_invalid", WidgetType::Button);
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidIdentifier { .. })));
    }

    #[test]
    fn test_invalid_identifier_special_characters() {
        let root = make_leaf_node("invalid-button!", WidgetType::Button);
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidIdentifier { .. })));
    }

    #[test]
    fn test_reserved_keyword_identifier() {
        let root = make_leaf_node("struct", WidgetType::Button);
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidIdentifier { .. })));
    }

    #[test]
    fn test_disallowed_children_on_leaf() {
        let mut leaf = make_leaf_node("button_leaf", WidgetType::Button);
        leaf.children = vec![make_leaf_node("nested_label", WidgetType::Label)];
        let doc = make_valid_document(leaf);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::DisallowedChildren { .. })));
    }

    #[test]
    fn test_max_depth_exceeded() {
        let level3 = make_leaf_node("level_3", WidgetType::Label);
        let level2 = make_container_node("level_2", WidgetType::VBox, vec![level3]);
        let level1 = make_container_node("level_1", WidgetType::VBox, vec![level2]);
        let doc = make_valid_document(level1);
        let validator = DocumentValidator::new().with_max_depth(2);
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::MaxDepthExceeded { .. })));
    }

    #[test]
    fn test_border_pane_invalid_slot() {
        let mut child = make_leaf_node("bad_slot_child", WidgetType::Label);
        child.slot = Some("somewhere_else".to_string());
        let border = make_container_node("border_root", WidgetType::BorderPane, vec![child]);
        let doc = make_valid_document(border);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidSlot { .. })));
    }

    #[test]
    fn test_border_pane_duplicate_slot() {
        let mut child1 = make_leaf_node("top_one", WidgetType::Label);
        child1.slot = Some("top".to_string());
        let mut child2 = make_leaf_node("top_two", WidgetType::Button);
        child2.slot = Some("top".to_string());
        let border =
            make_container_node("border_root", WidgetType::BorderPane, vec![child1, child2]);
        let doc = make_valid_document(border);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::DuplicateSlot { .. })));
    }

    #[test]
    fn test_min_greater_than_max_dimension() {
        let mut root = make_leaf_node("size_node", WidgetType::Label);
        root.layout = Some(WidgetLayout {
            dimensions: Dimensions {
                width: Size::Auto,
                height: Size::Auto,
                min_width: Some(500.0),
                min_height: None,
                max_width: Some(200.0),
                max_height: None,
                aspect_ratio: None,
            },
            spacing: Spacing::default(),
            container: None,
            absolute: None,
            anchor: None,
            border: None,
            grid: None,
            flex_item: None,
        });
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidMinMax { .. })));
    }

    #[test]
    fn test_negative_fixed_dimension() {
        let mut root = make_leaf_node("neg_node", WidgetType::Label);
        root.layout = Some(WidgetLayout {
            dimensions: Dimensions {
                width: Size::Fixed(-50.0),
                height: Size::Auto,
                min_width: None,
                min_height: None,
                max_width: None,
                max_height: None,
                aspect_ratio: None,
            },
            spacing: Spacing::default(),
            container: None,
            absolute: None,
            anchor: None,
            border: None,
            grid: None,
            flex_item: None,
        });
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidDimension { .. })));
    }

    #[test]
    fn test_invalid_opacity_out_of_range() {
        let mut root = make_leaf_node("opacity_node", WidgetType::Label);
        root.properties.opacity = Some(1.5);
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::InvalidOpacity { .. })));
    }

    #[test]
    fn test_font_asset_reference_validation() {
        let mut root = make_leaf_node("font_node", WidgetType::Label);
        root.properties.font_alias = Some("nonexistent_font".to_string());
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::AssetNotFound { .. })));
    }

    #[test]
    fn test_shadow_token_reference_validation() {
        let mut root = make_leaf_node("shadow_node", WidgetType::Label);
        root.properties.shadow_ref = Some("unknown_shadow".to_string());
        let doc = make_valid_document(root);
        let validator = DocumentValidator::new();
        let result = validator.validate_document(&doc);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::ThemeTokenNotFound { .. })));
    }

    #[test]
    fn test_json_syntax_error() {
        let malformed_json = "{ \"metadata\": { broken json ";
        let validator = DocumentValidator::new();
        let result = validator.validate_json(malformed_json);
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors
            .iter()
            .any(|e| matches!(e, ValidationError::JsonSyntaxError { .. })));
    }

    #[test]
    fn test_validate_reference_sample_app() {
        let sample_rux = include_str!("../../../examples/sample_app.rux");
        let validator = DocumentValidator::new();
        let result = validator.validate_json(sample_rux);
        assert!(result.is_ok(), "Validation failed: {:?}", result.err());
    }

    #[test]
    fn test_root_alias_document_validation() {
        let alias_json = r##"{
            "schema_version": "1.0.0",
            "version": "0.1.0",
            "metadata": {
                "name": "AliasApp",
                "author": "Alice Developer"
            },
            "type": "v_box",
            "props": {
                "background_color": "#121212"
            },
            "children": [
                {
                    "id": "btn_alias",
                    "type": "button",
                    "props": {
                        "text": "Click Me"
                    }
                }
            ]
        }"##;

        let validator = DocumentValidator::new();
        let result = validator.validate_json(alias_json);
        assert!(result.is_ok(), "Validation failed for alias doc: {:?}", result.err());

        let doc = result.unwrap();
        assert_eq!(doc.metadata.app_name, "AliasApp");
        assert_eq!(doc.metadata.authors, vec!["Alice Developer"]);
        assert_eq!(doc.root.widget_type, WidgetType::VBox);
        assert_eq!(doc.root.children.len(), 1);
        assert_eq!(doc.root.children[0].widget_type, WidgetType::Button);
        assert_eq!(doc.root.children[0].properties.text.as_deref(), Some("Click Me"));
    }

    #[test]
    fn test_validate_empty_json_graceful() {
        let validator = DocumentValidator::new();
        let result_empty = validator.validate_json("");
        assert!(result_empty.is_ok());

        let result_whitespace = validator.validate_json("   \n\t  ");
        assert!(result_whitespace.is_ok());
    }
}
