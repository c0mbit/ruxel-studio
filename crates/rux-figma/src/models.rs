use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigmaColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    #[serde(default = "default_alpha")]
    pub a: f64,
}

fn default_alpha() -> f64 {
    1.0
}

impl FigmaColor {
    pub fn to_hex(&self) -> String {
        let r_u8 = (self.r.clamp(0.0, 1.0) * 255.0).round() as u8;
        let g_u8 = (self.g.clamp(0.0, 1.0) * 255.0).round() as u8;
        let b_u8 = (self.b.clamp(0.0, 1.0) * 255.0).round() as u8;
        let a_u8 = (self.a.clamp(0.0, 1.0) * 255.0).round() as u8;

        if a_u8 >= 254 {
            format!("#{:02X}{:02X}{:02X}", r_u8, g_u8, b_u8)
        } else {
            format!("#{:02X}{:02X}{:02X}{:02X}", r_u8, g_u8, b_u8, a_u8)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaPaint {
    #[serde(rename = "type")]
    pub paint_type: String,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<FigmaColor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
}

fn default_visible() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FigmaBoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaTypeStyle {
    pub font_family: String,
    #[serde(default)]
    pub font_weight: f64,
    pub font_size: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align_horizontal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align_vertical: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height_px: Option<f64>,
    #[serde(default)]
    pub italic: bool,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FigmaEffectOffset {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaEffect {
    #[serde(rename = "type")]
    pub effect_type: String,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default)]
    pub radius: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<FigmaColor>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<FigmaEffectOffset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spread: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FigmaNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<FigmaNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute_bounding_box: Option<FigmaBoundingBox>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_axis_sizing_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_axis_sizing_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_axis_align_items: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_axis_align_items: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding_left: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding_right: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding_top: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding_bottom: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_grow: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_align: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_wrap: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_sizing_horizontal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout_sizing_vertical: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counter_axis_spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_height: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fills: Vec<FigmaPaint>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub strokes: Vec<FigmaPaint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_weight: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rectangle_corner_radii: Option<[f64; 4]>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effects: Vec<FigmaEffect>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub characters: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<FigmaTypeStyle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_id: Option<String>,
}

impl FigmaNode {
    pub fn is_vector(&self) -> bool {
        matches!(
            self.node_type.as_str(),
            "VECTOR"
                | "BOOLEAN_OPERATION"
                | "STAR"
                | "LINE"
                | "ELLIPSE"
                | "REGULAR_POLYGON"
        )
    }

    pub fn is_frame_or_group(&self) -> bool {
        matches!(
            self.node_type.as_str(),
            "FRAME" | "GROUP" | "COMPONENT" | "COMPONENT_SET" | "INSTANCE" | "CANVAS"
        )
    }

    pub fn primary_fill_color(&self) -> Option<String> {
        for fill in &self.fills {
            if fill.visible && fill.paint_type == "SOLID" {
                if let Some(ref color) = fill.color {
                    return Some(color.to_hex());
                }
            }
        }
        None
    }

    pub fn primary_stroke_color(&self) -> Option<String> {
        for stroke in &self.strokes {
            if stroke.visible && stroke.paint_type == "SOLID" {
                if let Some(ref color) = stroke.color {
                    return Some(color.to_hex());
                }
            }
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigmaNodeWrapper {
    pub document: FigmaNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigmaNodesResponse {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modified: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    pub nodes: HashMap<String, FigmaNodeWrapper>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigmaImagesResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub err: Option<String>,
    #[serde(default)]
    pub images: HashMap<String, Option<String>>,
}

