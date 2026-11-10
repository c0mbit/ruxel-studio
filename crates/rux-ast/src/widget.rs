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
    #[serde(rename = "conditional_node")]
    ConditionalNode,
    #[serde(rename = "generic_widget")]
    GenericWidget,
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
                | Self::ConditionalNode
                | Self::GenericWidget
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

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterpolationCurve {
    Linear,
    #[default]
    EaseInOut,
    EaseIn,
    EaseOut,
    Spring,
    Bounce,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PropertyValue {
    Static(String),
    Binding(String),
}

impl Default for PropertyValue {
    fn default() -> Self {
        PropertyValue::Static(String::new())
    }
}

impl PropertyValue {
    pub fn as_str(&self) -> &str {
        match self {
            PropertyValue::Static(s) => s.as_str(),
            PropertyValue::Binding(s) => s.as_str(),
        }
    }

    pub fn is_binding(&self) -> bool {
        matches!(self, PropertyValue::Binding(_))
    }

    pub fn is_static(&self) -> bool {
        matches!(self, PropertyValue::Static(_))
    }
}

impl std::ops::Deref for PropertyValue {
    type Target = str;
    fn deref(&self) -> &str {
        self.as_str()
    }
}

impl std::fmt::Display for PropertyValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl From<&str> for PropertyValue {
    fn from(s: &str) -> Self {
        PropertyValue::Static(s.to_string())
    }
}

impl From<String> for PropertyValue {
    fn from(s: String) -> Self {
        PropertyValue::Static(s)
    }
}

impl PartialEq<&str> for PropertyValue {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl PartialEq<str> for PropertyValue {
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}

impl PartialEq<String> for PropertyValue {
    fn eq(&self, other: &String) -> bool {
        self.as_str() == other.as_str()
    }
}

impl PartialEq<PropertyValue> for &str {
    fn eq(&self, other: &PropertyValue) -> bool {
        *self == other.as_str()
    }
}

impl PartialEq<PropertyValue> for String {
    fn eq(&self, other: &PropertyValue) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Serialize for PropertyValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        match self {
            PropertyValue::Static(s) => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("type", "static")?;
                map.serialize_entry("value", s)?;
                map.end()
            }
            PropertyValue::Binding(s) => {
                let mut map = serializer.serialize_map(Some(2))?;
                map.serialize_entry("type", "binding")?;
                map.serialize_entry("value", s)?;
                map.end()
            }
        }
    }
}

impl<'de> Deserialize<'de> for PropertyValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, MapAccess, Visitor};

        struct PropertyValueVisitor;

        impl<'de> Visitor<'de> for PropertyValueVisitor {
            type Value = PropertyValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string, or a map with 'type'/'kind' and 'value', or 'binding'/'static'")
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(PropertyValue::Static(v.to_string()))
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(PropertyValue::Static(v))
            }

            fn visit_map<M>(self, mut access: M) -> Result<Self::Value, M::Error>
            where
                M: MapAccess<'de>,
            {
                let mut type_field: Option<String> = None;
                let mut value_field: Option<String> = None;
                let mut binding_field: Option<String> = None;
                let mut static_field: Option<String> = None;

                while let Some(key) = access.next_key::<String>()? {
                    match key.as_str() {
                        "type" | "kind" => {
                            type_field = Some(access.next_value()?);
                        }
                        "value" => {
                            value_field = Some(access.next_value()?);
                        }
                        "binding" => {
                            binding_field = Some(access.next_value()?);
                        }
                        "static" => {
                            static_field = Some(access.next_value()?);
                        }
                        _ => {
                            let _: serde_json::Value = access.next_value()?;
                        }
                    }
                }

                if let Some(b) = binding_field {
                    return Ok(PropertyValue::Binding(b));
                }
                if let Some(s) = static_field {
                    return Ok(PropertyValue::Static(s));
                }

                if let Some(kind) = type_field {
                    let val = value_field.unwrap_or_default();
                    if kind == "binding" {
                        Ok(PropertyValue::Binding(val))
                    } else {
                        Ok(PropertyValue::Static(val))
                    }
                } else if let Some(val) = value_field {
                    Ok(PropertyValue::Static(val))
                } else {
                    Ok(PropertyValue::Static(String::new()))
                }
            }
        }

        deserializer.deserialize_any(PropertyValueVisitor)
    }
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
    pub text: Option<PropertyValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<PropertyValue>,
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
    pub condition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_args: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aria_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spacing: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill_height: Option<bool>,
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
