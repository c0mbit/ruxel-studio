use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use rux_ast::asset::{AssetRegistry, FontAsset, FontStyle, FontWeight, IconAsset, IconFormat};

use crate::client::FigmaClient;
use crate::error::FigmaError;
use crate::models::FigmaNode;

#[derive(Debug, Clone, Default)]
pub struct DownloadedAssetsReport {
    pub registry: AssetRegistry,
    pub downloaded_files: Vec<String>,
    pub node_icon_map: HashMap<String, String>,
}

pub struct AssetDownloader<'a> {
    client: &'a FigmaClient,
    file_key: &'a str,
    project_dir: Option<PathBuf>,
}

impl<'a> AssetDownloader<'a> {
    pub fn new(client: &'a FigmaClient, file_key: &'a str, project_dir: Option<&Path>) -> Self {
        Self {
            client,
            file_key,
            project_dir: project_dir.map(Path::to_path_buf),
        }
    }

    pub fn extract_and_download(
        &self,
        root_node: &FigmaNode,
    ) -> Result<DownloadedAssetsReport, FigmaError> {
        let mut vector_nodes = Vec::new();
        let mut detected_fonts = Vec::new();

        self.traverse_nodes(root_node, &mut vector_nodes, &mut detected_fonts);

        let mut font_assets = Vec::new();
        let mut seen_font_signatures = HashSet::new();

        for (family, weight_num, italic) in detected_fonts {
            let weight = Self::map_font_weight(weight_num);
            let style = if italic {
                FontStyle::Italic
            } else {
                FontStyle::Normal
            };
            let signature = format!("{}:{:?}:{:?}", family, weight, style);

            if seen_font_signatures.insert(signature) {
                let alias = Self::sanitize_identifier(&format!(
                    "font_{}_{:?}",
                    family.to_lowercase(),
                    weight
                ));
                let path = format!("assets/fonts/{}.ttf", alias);
                font_assets.push(FontAsset {
                    alias,
                    path,
                    weight,
                    style,
                });
            }
        }

        let mut icon_assets = Vec::new();
        let mut downloaded_files = Vec::new();
        let mut node_icon_map = HashMap::new();

        if !vector_nodes.is_empty() {
            let vector_ids: Vec<&str> = vector_nodes.iter().map(|(id, _)| id.as_str()).collect();

            let chunk_size = 50;
            for chunk in vector_ids.chunks(chunk_size) {
                if let Ok(images_resp) = self.client.get_images(self.file_key, chunk, "svg") {
                    for (node_id, image_url_opt) in images_resp.images {
                        if let Some(image_url) = image_url_opt {
                            let node_name = vector_nodes
                                .iter()
                                .find(|(id, _)| id == &node_id)
                                .map(|(_, name)| name.as_str())
                                .unwrap_or("vector");

                            let safe_name = Self::sanitize_identifier(node_name);
                            let safe_id = node_id.replace([':', '-'], "_");
                            let filename = format!("{}_{}.svg", safe_name, safe_id);
                            let rel_path = format!("assets/icons/{}", filename);

                            if let Some(ref base_dir) = self.project_dir {
                                let abs_path = base_dir.join(&rel_path);
                                if let Ok(()) = self.client.download_asset(&image_url, &abs_path) {
                                    downloaded_files.push(abs_path.to_string_lossy().to_string());
                                }
                            } else {
                                let fallback_path = Path::new(&rel_path);
                                if let Some(parent) = fallback_path.parent() {
                                    let _ = fs::create_dir_all(parent);
                                }
                                let _ = self.client.download_asset(&image_url, fallback_path);
                                downloaded_files.push(rel_path.clone());
                            }

                            let alias = format!("icon_{}_{}", safe_name, safe_id);
                            icon_assets.push(IconAsset {
                                alias: alias.clone(),
                                path: rel_path,
                                format: IconFormat::Svg,
                            });
                            node_icon_map.insert(node_id, alias);
                        }
                    }
                }
            }
        }

        let registry = AssetRegistry {
            fonts: font_assets,
            icons: icon_assets,
            images: Vec::new(),
        };

        Ok(DownloadedAssetsReport {
            registry,
            downloaded_files,
            node_icon_map,
        })
    }

    fn traverse_nodes(
        &self,
        node: &FigmaNode,
        vector_nodes: &mut Vec<(String, String)>,
        detected_fonts: &mut Vec<(String, f64, bool)>,
    ) {
        if node.is_vector() || Self::is_icon_candidate(node) {
            vector_nodes.push((node.id.clone(), node.name.clone()));
            return;
        }

        if node.node_type == "TEXT" {
            if let Some(ref style) = node.style {
                detected_fonts.push((
                    style.font_family.clone(),
                    style.font_weight,
                    style.italic,
                ));
            }
        }

        for child in &node.children {
            self.traverse_nodes(child, vector_nodes, detected_fonts);
        }
    }

    fn is_icon_candidate(node: &FigmaNode) -> bool {
        let name_lower = node.name.to_lowercase();
        if name_lower.starts_with("ic_")
            || name_lower.starts_with("icon_")
            || name_lower.contains("icon")
            || name_lower.contains("logo")
            || name_lower.contains("glyph")
        {
            return true;
        }

        if (node.node_type == "FRAME" || node.node_type == "GROUP")
            && !node.children.is_empty()
            && node.children.iter().all(|c| c.is_vector())
        {
            return true;
        }

        false
    }

    fn map_font_weight(weight: f64) -> FontWeight {
        if weight <= 150.0 {
            FontWeight::Thin
        } else if weight <= 250.0 {
            FontWeight::ExtraLight
        } else if weight <= 350.0 {
            FontWeight::Light
        } else if weight <= 450.0 {
            FontWeight::Normal
        } else if weight <= 550.0 {
            FontWeight::Medium
        } else if weight <= 650.0 {
            FontWeight::SemiBold
        } else if weight <= 750.0 {
            FontWeight::Bold
        } else if weight <= 850.0 {
            FontWeight::ExtraBold
        } else {
            FontWeight::Black
        }
    }

    fn sanitize_identifier(input: &str) -> String {
        let mut result = String::new();
        for ch in input.chars() {
            if ch.is_ascii_alphanumeric() {
                result.push(ch.to_ascii_lowercase());
            } else if (ch == '_' || ch == '-' || ch == ' ')
                && !result.ends_with('_') && !result.is_empty() {
                    result.push('_');
                }
        }
        if result.is_empty() {
            "asset".to_string()
        } else {
            result
        }
    }
}
