use std::collections::BTreeMap;
use serde::{Serialize, Deserialize};

use crate::asset::FontWeight;
use crate::layout::WidgetLayout;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WidgetType {
    VBox,
    HBox,
    AnchorPane,
    BorderPane,
    Grid,
    ScrollPane,
    SplitPane,
    TabPane,
    Accordion,
    Button,
    Label,
    TextInput,
    Checkbox,
    RadioButton,
    Slider,
    ProgressBar,
    ComboBox,
    TableView,
    #[serde(rename = "data_grid")]
    DataGrid,
    TreeView,
    MenuBar,
    Menu,
    MenuItem,
    MenuSeparator,
    Rectangle,
    Circle,
    Ellipse,
    Line,
    Path,
    Chart,
    LineChart,
    BarChart,
    PieChart,
    ScatterChart,
    #[serde(rename = "viewport3_d", alias = "viewport_3d")]
    Viewport3D,
    #[serde(rename = "canvas3_d")]
    Canvas3D,
    Image,
    CustomComponent,
}

impl WidgetType {
    pub fn is_container(&self) -> bool {
        matches!(
            self,
            Self::VBox
                | Self::HBox
                | Self::AnchorPane
                | Self::BorderPane
                | Self::Grid
                | Self::ScrollPane
                | Self::SplitPane
                | Self::TabPane
                | Self::Accordion
                | Self::MenuBar
                | Self::Menu
                | Self::TreeView
        )
    }

    pub fn is_leaf(&self) -> bool {
        !self.is_container()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextAlign {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableColumn {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChartSeriesDefinition {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_field: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub values: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationTrigger {
    OnMount,
    OnHover,
    OnClick,
    StateChange,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterpolationCurve {
    Linear,
    EaseInOut,
    EaseIn,
    EaseOut,
    Spring,
    Bounce,
}

impl Default for InterpolationCurve {
    fn default() -> Self {
        Self::EaseInOut
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimatedProperty {
    Opacity,
    Scale,
    TranslationX,
    TranslationY,
    Rotation,
    BackgroundColor,
    Width,
    Height,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnimationDefinition {
    pub id: String,
    pub trigger: AnimationTrigger,
    pub property: AnimatedProperty,
    pub from_value: serde_json::Value,
    pub to_value: serde_json::Value,
    pub duration_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<f64>,
    #[serde(default)]
    pub curve: InterpolationCurve,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spring_stiffness: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spring_damping: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_reverse: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WidgetProperties {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadow_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<FontWeight>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<TextAlign>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wrap_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_cancel: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step_value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_value: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub columns: Vec<TableColumn>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grid_virtualized: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_rows: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_type: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub chart_series: Vec<ChartSeriesDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_x_axis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_y_axis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_show_legend: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chart_show_grid: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_3d_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_fov: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_rotate: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tree_expand_all: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tree_show_root: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_description: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub custom_properties: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventHandler {
    pub handler_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub navigate_to: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WidgetEvents {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_click: Option<EventHandler>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_change: Option<EventHandler>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_hover: Option<EventHandler>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_submit: Option<EventHandler>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub on_focus: Option<EventHandler>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub navigate: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub custom_events: BTreeMap<String, EventHandler>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct WidgetBindings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visible: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub custom_bindings: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WidgetNode {
    #[serde(default = "default_node_id")]
    pub id: String,
    #[serde(alias = "type")]
    pub widget_type: WidgetType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slot: Option<String>,
    #[serde(default, alias = "props")]
    pub properties: WidgetProperties,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<WidgetLayout>,
    #[serde(default)]
    pub events: WidgetEvents,
    #[serde(default)]
    pub bindings: WidgetBindings,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub animations: Vec<AnimationDefinition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<WidgetNode>,
}

fn default_node_id() -> String {
    "root".to_string()
}

impl Default for WidgetNode {
    fn default() -> Self {
        Self {
            id: default_node_id(),
            widget_type: WidgetType::VBox,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: Vec::new(),
            children: Vec::new(),
        }
    }
}
