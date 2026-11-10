use std::collections::BTreeMap;
use serde::{Serialize, Deserialize};

use crate::metadata::ProjectMetadata;
use crate::window::WindowConfig;
use crate::asset::AssetRegistry;
use crate::theme::ThemeConfig;
use crate::widget::WidgetNode;

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct I18nConfig {
    #[serde(default)]
    pub default_locale: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub locales: BTreeMap<String, BTreeMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ComponentDefinition {
    pub name: String,
    pub root: WidgetNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuxDocument {
    #[serde(rename = "$schema")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default)]
    pub metadata: ProjectMetadata,
    #[serde(default)]
    pub window: WindowConfig,
    #[serde(default)]
    pub assets: AssetRegistry,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub i18n: Option<I18nConfig>,
    #[serde(default)]
    pub theme: ThemeConfig,
    pub root: WidgetNode,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub components: BTreeMap<String, ComponentDefinition>,
}

impl Default for RuxDocument {
    fn default() -> Self {
        Self {
            schema_ref: None,
            schema_version: Some("1.0.0".to_string()),
            version: Some("0.1.0".to_string()),
            metadata: ProjectMetadata::default(),
            window: WindowConfig::default(),
            assets: AssetRegistry::default(),
            i18n: None,
            theme: ThemeConfig::default(),
            root: WidgetNode::default(),
            components: BTreeMap::new(),
        }
    }
}

impl RuxDocument {
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        if let Ok(doc) = serde_json::from_str::<RuxDocument>(json) {
            return Ok(doc);
        }

        let val: serde_json::Value = serde_json::from_str(json)?;
        if let serde_json::Value::Object(map) = val {
            let schema_ref = map.get("$schema").and_then(|v| v.as_str()).map(|s| s.to_string());
            let schema_version = map.get("schema_version").and_then(|v| v.as_str()).map(|s| s.to_string());
            let version = map.get("version").and_then(|v| v.as_str()).map(|s| s.to_string());

            let mut metadata = if let Some(meta_val) = map.get("metadata") {
                serde_json::from_value::<ProjectMetadata>(meta_val.clone())
                    .unwrap_or_else(|_| ProjectMetadata::default())
            } else {
                ProjectMetadata::default()
            };

            if let Some(sv) = &schema_version {
                metadata.schema_version = sv.clone();
            }
            if let Some(v) = &version {
                metadata.app_version = v.clone();
            }

            let window = if let Some(win_val) = map.get("window") {
                serde_json::from_value::<WindowConfig>(win_val.clone()).unwrap_or_default()
            } else {
                WindowConfig::default()
            };

            let assets = if let Some(assets_val) = map.get("assets") {
                serde_json::from_value::<AssetRegistry>(assets_val.clone()).unwrap_or_default()
            } else {
                AssetRegistry::default()
            };

            let i18n = if let Some(i18n_val) = map.get("i18n") {
                serde_json::from_value::<I18nConfig>(i18n_val.clone()).ok()
            } else {
                None
            };

            let theme = if let Some(theme_val) = map.get("theme") {
                serde_json::from_value::<ThemeConfig>(theme_val.clone()).unwrap_or_default()
            } else {
                ThemeConfig::default()
            };

            let root = if let Some(root_val) = map.get("root") {
                serde_json::from_value::<WidgetNode>(root_val.clone())?
            } else if map.contains_key("type") || map.contains_key("widget_type") {
                let mut node_map = serde_json::Map::new();
                node_map.insert("id".to_string(), map.get("id").cloned().unwrap_or_else(|| serde_json::json!("root")));
                if let Some(t) = map.get("widget_type").or_else(|| map.get("type")) {
                    node_map.insert("widget_type".to_string(), t.clone());
                } else {
                    node_map.insert("widget_type".to_string(), serde_json::json!("v_box"));
                }
                if let Some(p) = map.get("properties").or_else(|| map.get("props")) {
                    node_map.insert("properties".to_string(), p.clone());
                }
                if let Some(l) = map.get("layout") {
                    node_map.insert("layout".to_string(), l.clone());
                }
                if let Some(c) = map.get("children") {
                    node_map.insert("children".to_string(), c.clone());
                }
                serde_json::from_value::<WidgetNode>(serde_json::Value::Object(node_map))?
            } else {
                WidgetNode::default()
            };

            let components = if let Some(comp_val) = map.get("components") {
                serde_json::from_value::<BTreeMap<String, ComponentDefinition>>(comp_val.clone()).unwrap_or_default()
            } else {
                BTreeMap::new()
            };

            return Ok(RuxDocument {
                schema_ref,
                schema_version,
                version,
                metadata,
                window,
                assets,
                i18n,
                theme,
                root,
                components,
            });
        }

        serde_json::from_str(json)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn to_json_compact(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}
