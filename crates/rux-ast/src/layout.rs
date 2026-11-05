use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlexDirection {
    Row,
    Column,
    RowReverse,
    ColumnReverse,
}

impl Default for FlexDirection {
    fn default() -> Self {
        Self::Column
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlexWrap {
    NoWrap,
    Wrap,
    WrapReverse,
}

impl Default for FlexWrap {
    fn default() -> Self {
        Self::NoWrap
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JustifyContent {
    FlexStart,
    FlexEnd,
    Center,
    SpaceBetween,
    SpaceAround,
    SpaceEvenly,
}

impl Default for JustifyContent {
    fn default() -> Self {
        Self::FlexStart
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlignItems {
    FlexStart,
    FlexEnd,
    Center,
    Stretch,
    Baseline,
}

impl Default for AlignItems {
    fn default() -> Self {
        Self::Stretch
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlignSelf {
    Auto,
    FlexStart,
    FlexEnd,
    Center,
    Stretch,
    Baseline,
}

impl Default for AlignSelf {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlexContainer {
    #[serde(default)]
    pub direction: FlexDirection,
    #[serde(default)]
    pub wrap: FlexWrap,
    #[serde(default)]
    pub justify_content: JustifyContent,
    #[serde(default)]
    pub align_items: AlignItems,
    #[serde(default)]
    pub gap: f64,
}

impl Default for FlexContainer {
    fn default() -> Self {
        Self {
            direction: FlexDirection::default(),
            wrap: FlexWrap::default(),
            justify_content: JustifyContent::default(),
            align_items: AlignItems::default(),
            gap: 0.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "unit", content = "value", rename_all = "snake_case")]
pub enum GridTrack {
    Fixed(f64),
    Percentage(f64),
    Fr(f64),
    Auto,
    MinMax(f64, f64),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GridContainer {
    pub columns: Vec<GridTrack>,
    pub rows: Vec<GridTrack>,
    #[serde(default)]
    pub column_gap: f64,
    #[serde(default)]
    pub row_gap: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub justify_items: Option<AlignItems>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align_items: Option<AlignItems>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AbsolutePosition {
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub z_index: i32,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct AnchorConstraints {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BorderPosition {
    Top,
    Bottom,
    Left,
    Right,
    Center,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContainerLayout {
    Flex(FlexContainer),
    Grid(GridContainer),
    Absolute,
    Anchor,
    Border,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum Size {
    Fixed(f64),
    Percentage(f64),
    Fill(f64),
    HugContent,
    Auto,
}

impl Default for Size {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Dimensions {
    #[serde(default)]
    pub width: Size,
    #[serde(default)]
    pub height: Size,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct RectOffsets {
    #[serde(default)]
    pub top: f64,
    #[serde(default)]
    pub right: f64,
    #[serde(default)]
    pub bottom: f64,
    #[serde(default)]
    pub left: f64,
}

impl RectOffsets {
    pub fn all(value: f64) -> Self {
        Self {
            top: value,
            right: value,
            bottom: value,
            left: value,
        }
    }

    pub fn symmetric(vertical: f64, horizontal: f64) -> Self {
        Self {
            top: vertical,
            right: horizontal,
            bottom: vertical,
            left: horizontal,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Spacing {
    #[serde(default)]
    pub padding: RectOffsets,
    #[serde(default)]
    pub margin: RectOffsets,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct GridPlacement {
    #[serde(default = "default_index")]
    pub column: u32,
    #[serde(default = "default_span")]
    pub column_span: u32,
    #[serde(default = "default_index")]
    pub row: u32,
    #[serde(default = "default_span")]
    pub row_span: u32,
}

fn default_index() -> u32 {
    0
}

fn default_span() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FlexItem {
    #[serde(default)]
    pub grow: f64,
    #[serde(default = "default_shrink")]
    pub shrink: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub basis: Option<Size>,
    #[serde(default)]
    pub align_self: AlignSelf,
}

fn default_shrink() -> f64 {
    1.0
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WidgetLayout {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container: Option<ContainerLayout>,
    #[serde(default)]
    pub dimensions: Dimensions,
    #[serde(default)]
    pub spacing: Spacing,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub absolute: Option<AbsolutePosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<AnchorConstraints>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<BorderPosition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grid: Option<GridPlacement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flex_item: Option<FlexItem>,
}

