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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuxDocument {
    #[serde(rename = "$schema")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema_ref: Option<String>,
    pub metadata: ProjectMetadata,
    pub window: WindowConfig,
    #[serde(default)]
    pub assets: AssetRegistry,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub i18n: Option<I18nConfig>,
    pub theme: ThemeConfig,
    pub root: WidgetNode,
}

impl RuxDocument {
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn to_json_compact(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}
