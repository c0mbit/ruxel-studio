use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectScreen {
    pub id: String,
    pub name: String,
    pub file_path: String,
    #[serde(default)]
    pub is_initial: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuxProject {
    pub name: String,
    pub version: String,
    pub default_screen: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub screens: Vec<ProjectScreen>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub routes: BTreeMap<String, String>,
}

impl RuxProject {
    pub fn new(name: &str, default_screen: &str) -> Self {
        Self {
            name: name.to_string(),
            version: "0.1.0".to_string(),
            default_screen: default_screen.to_string(),
            screens: Vec::new(),
            routes: BTreeMap::new(),
        }
    }

    pub fn add_screen(
        &mut self,
        id: &str,
        name: &str,
        file_path: &str,
        is_initial: bool,
    ) {
        let route_path = format!("/{}", id.to_lowercase());
        self.screens.push(ProjectScreen {
            id: id.to_string(),
            name: name.to_string(),
            file_path: file_path.to_string(),
            is_initial,
            route_path: Some(route_path.clone()),
        });
        self.routes.insert(route_path, id.to_string());
    }

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

