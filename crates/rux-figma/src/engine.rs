use std::path::Path;
use std::sync::Arc;

use rux_ast::document::RuxDocument;
use rux_ast::metadata::{ProjectMetadata, TargetFramework};
use rux_ast::widget::{WidgetBindings, WidgetEvents, WidgetNode};
use rux_ast::window::{ScaleMode, WindowConfig};

use crate::classifier::HeuristicClassifier;
use crate::client::{FigmaClient, HttpTransport};
use crate::downloader::{AssetDownloader, DownloadedAssetsReport};
use crate::error::FigmaError;
use crate::geometry::GeometryResolver;
use crate::models::{FigmaBoundingBox, FigmaNode};

pub struct FigmaImportEngineParams<'a> {
    pub token: String,
    pub file_key_or_url: &'a str,
    pub node_id: Option<&'a str>,
    pub project_dir: Option<&'a Path>,
    pub custom_transport: Option<Arc<dyn HttpTransport>>,
}

pub struct FigmaImportEngineResult {
    pub document: RuxDocument,
    pub imported_node_count: usize,
    pub assets_downloaded: Vec<String>,
    pub warnings: Vec<String>,
}

pub struct FigmaEngine {
    geometry: GeometryResolver,
    classifier: HeuristicClassifier,
}

impl Default for FigmaEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl FigmaEngine {
    pub fn new() -> Self {
        Self {
            geometry: GeometryResolver::new(),
            classifier: HeuristicClassifier::new(),
        }
    }

    pub fn import(
        &self,
        params: FigmaImportEngineParams,
    ) -> Result<FigmaImportEngineResult, FigmaError> {
        let (file_key, url_node_id) = FigmaClient::parse_figma_url(params.file_key_or_url)?;
        let effective_node_id = params.node_id.or(url_node_id.as_deref());

        let client = if let Some(transport) = params.custom_transport {
            FigmaClient::with_transport(params.token, transport)
        } else {
            FigmaClient::new(params.token)
        };

        let nodes_to_query = if let Some(id) = effective_node_id {
            vec![id]
        } else {
            vec!["0:1"]
        };

        let nodes_response = client.get_nodes(&file_key, &nodes_to_query)?;

        let target_node = if let Some(id) = effective_node_id {
            nodes_response
                .nodes
                .get(id)
                .map(|w| &w.document)
                .or_else(|| {
                    let alt_id = id.replace('-', ":");
                    nodes_response.nodes.get(&alt_id).map(|w| &w.document)
                })
                .or_else(|| {
                    let alt_id = id.replace(':', "-");
                    nodes_response.nodes.get(&alt_id).map(|w| &w.document)
                })
                .or_else(|| nodes_response.nodes.values().next().map(|w| &w.document))
        } else {
            nodes_response.nodes.values().next().map(|w| &w.document)
        };

        let root_figma_node = target_node.ok_or_else(|| {
            FigmaError::NodeNotFound(
                effective_node_id
                    .unwrap_or("default root node")
                    .to_string(),
            )
        })?;

        let downloader = AssetDownloader::new(&client, &file_key, params.project_dir);
        let assets_report = downloader.extract_and_download(root_figma_node)?;

        let (document, node_count) = self.build_rux_document(
            &nodes_response.name,
            root_figma_node,
            assets_report.clone(),
        )?;

        Ok(FigmaImportEngineResult {
            document,
            imported_node_count: node_count,
            assets_downloaded: assets_report.downloaded_files,
            warnings: Vec::new(),
        })
    }

    pub fn import_from_json(&self, json_str: &str) -> Result<FigmaImportEngineResult, FigmaError> {
        let trimmed = json_str.trim();
        if trimmed.is_empty() {
            return Err(FigmaError::InvalidJson("Empty Figma JSON input".to_string()));
        }

        if let Ok(node) = serde_json::from_str::<FigmaNode>(trimmed) {
            let name = if node.name.is_empty() { "FigmaImport" } else { &node.name };
            let (doc, count) = self.build_rux_document(name, &node, DownloadedAssetsReport::default())?;
            return Ok(FigmaImportEngineResult {
                document: doc,
                imported_node_count: count,
                assets_downloaded: Vec::new(),
                warnings: Vec::new(),
            });
        }

        let val: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|e| FigmaError::InvalidJson(format!("Invalid Figma JSON: {}", e)))?;

        let (name, node) = Self::extract_figma_node_from_value(&val)
            .ok_or_else(|| FigmaError::InvalidJson("Could not locate valid Figma node in JSON payload".to_string()))?;

        let (doc, count) = self.build_rux_document(&name, &node, DownloadedAssetsReport::default())?;
        Ok(FigmaImportEngineResult {
            document: doc,
            imported_node_count: count,
            assets_downloaded: Vec::new(),
            warnings: Vec::new(),
        })
    }

    fn extract_figma_node_from_value(val: &serde_json::Value) -> Option<(String, FigmaNode)> {
        if let Some(doc_val) = val.get("document") {
            if let Ok(node) = serde_json::from_value::<FigmaNode>(doc_val.clone()) {
                let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&node.name).to_string();
                return Some((name, node));
            }
        }

        if let Some(nodes_obj) = val.get("nodes").and_then(|v| v.as_object()) {
            for (_, wrapper_val) in nodes_obj {
                if let Some(doc_val) = wrapper_val.get("document") {
                    if let Ok(node) = serde_json::from_value::<FigmaNode>(doc_val.clone()) {
                        let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&node.name).to_string();
                        return Some((name, node));
                    }
                }
            }
        }

        if let Some(node_val) = val.get("node") {
            if let Ok(node) = serde_json::from_value::<FigmaNode>(node_val.clone()) {
                let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&node.name).to_string();
                return Some((name, node));
            }
        }

        if let Ok(node) = serde_json::from_value::<FigmaNode>(val.clone()) {
            let name = if node.name.is_empty() { "FigmaImport".to_string() } else { node.name.clone() };
            return Some((name, node));
        }

        None
    }

    pub fn build_rux_document(
        &self,
        file_name: &str,
        root_figma_node: &FigmaNode,
        assets_report: DownloadedAssetsReport,
    ) -> Result<(RuxDocument, usize), FigmaError> {
        let mut total_nodes = 0;
        let root_widget =
            self.convert_node_recursive(root_figma_node, &assets_report, &mut total_nodes);

        let theme = self.classifier.extract_theme_config(root_figma_node);

        let window_width = root_figma_node
            .absolute_bounding_box
            .as_ref()
            .map(|b| b.width.round())
            .unwrap_or(1200.0)
            .max(400.0);

        let window_height = root_figma_node
            .absolute_bounding_box
            .as_ref()
            .map(|b| b.height.round())
            .unwrap_or(800.0)
            .max(300.0);

        let clean_title = if root_figma_node.name.is_empty() {
            file_name.to_string()
        } else {
            root_figma_node.name.clone()
        };

        let document = RuxDocument {
            schema_ref: Some(
                "https://raw.githubusercontent.com/ruxel-studio/ruxel-studio/main/schemas/rux-schema-v1.json"
                    .to_string(),
            ),
            schema_version: Some("1.0.0".to_string()),
            version: Some("0.1.0".to_string()),
            metadata: ProjectMetadata {
                schema_version: "1.0.0".to_string(),
                app_name: clean_title.clone(),
                app_version: "0.1.0".to_string(),
                target_frameworks: vec![TargetFramework::Iced],
                description: Some("Imported from Figma via Ruxel Studio".to_string()),
                authors: Vec::new(),
                license: Some("MIT".to_string()),
                created_at: None,
                updated_at: None,
            },
            window: WindowConfig {
                title: clean_title,
                initial_width: window_width,
                initial_height: window_height,
                min_width: Some(360.0),
                min_height: Some(240.0),
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
            assets: assets_report.registry,
            i18n: None,
            theme,
            root: root_widget,
            components: std::collections::BTreeMap::new(),
        };

        Ok((document, total_nodes))
    }

    pub fn convert_node_recursive(
        &self,
        node: &FigmaNode,
        assets: &DownloadedAssetsReport,
        counter: &mut usize,
    ) -> WidgetNode {
        *counter += 1;

        let classification = self.classifier.classify_node(node, Some(assets));
        let layout = self.geometry.resolve_node_layout(node);

        let node_id = Self::generate_widget_id(&node.name, &node.id);

        if classification.should_absorb_children || node.children.is_empty() {
            return WidgetNode {
                id: node_id,
                widget_type: classification.widget_type,
                slot: None,
                properties: classification.properties,
                layout: Some(layout),
                events: WidgetEvents::default(),
                bindings: WidgetBindings::default(),
                animations: Vec::new(),
                children: Vec::new(),
            };
        }

        let is_auto_layout = matches!(node.layout_mode.as_deref(), Some("HORIZONTAL") | Some("VERTICAL"));

        let children = if is_auto_layout {
            node.children
                .iter()
                .filter(|c| c.visible)
                .map(|child| self.convert_node_recursive(child, assets, counter))
                .collect()
        } else {
            let parent_box = node
                .absolute_bounding_box
                .clone()
                .unwrap_or(FigmaBoundingBox {
                    x: 0.0,
                    y: 0.0,
                    width: 1200.0,
                    height: 800.0,
                });

            let mut child_nodes_with_boxes = Vec::new();
            for child in node.children.iter().filter(|c| c.visible) {
                let box_clone = child.absolute_bounding_box.clone().unwrap_or({
                    FigmaBoundingBox {
                        x: parent_box.x,
                        y: parent_box.y,
                        width: 100.0,
                        height: 40.0,
                    }
                });
                let converted_child = self.convert_node_recursive(child, assets, counter);
                child_nodes_with_boxes.push((converted_child, box_clone));
            }

            self.geometry
                .resolve_freeform_children(&parent_box, child_nodes_with_boxes)
        };

        WidgetNode {
            id: node_id,
            widget_type: classification.widget_type,
            slot: None,
            properties: classification.properties,
            layout: Some(layout),
            events: WidgetEvents::default(),
            bindings: WidgetBindings::default(),
            animations: Vec::new(),
            children,
        }
    }

    fn generate_widget_id(name: &str, figma_id: &str) -> String {
        let mut clean = String::new();
        for ch in name.chars() {
            if ch.is_ascii_alphanumeric() {
                clean.push(ch.to_ascii_lowercase());
            } else if (ch == '_' || ch == '-' || ch == ' ') && !clean.ends_with('_') && !clean.is_empty() {
                clean.push('_');
            }
        }

        let suffix = figma_id.replace([':', '-'], "_");
        if clean.is_empty() {
            format!("node_{}", suffix)
        } else {
            format!("{}_{}", clean, suffix)
        }
    }
}
