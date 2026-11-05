use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{CreatePresetPayload, TeamPresetRecord};

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Preset not found with id: {0}")]
    NotFound(String),
}

#[derive(Clone)]
pub struct PresetStorage {
    conn: Arc<Mutex<Connection>>,
}

impl PresetStorage {
    pub fn new_in_memory() -> Result<Self, StorageError> {
        let conn = Connection::open_in_memory()?;
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.init_schema()?;
        storage.seed_defaults_if_empty()?;
        Ok(storage)
    }

    pub fn new_file(path: &str) -> Result<Self, StorageError> {
        let conn = Connection::open(path)?;
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.init_schema()?;
        storage.seed_defaults_if_empty()?;
        Ok(storage)
    }

    fn init_schema(&self) -> Result<(), StorageError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS team_presets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                author TEXT NOT NULL,
                created_at TEXT NOT NULL,
                root_node TEXT NOT NULL,
                tags TEXT NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    fn seed_defaults_if_empty(&self) -> Result<(), StorageError> {
        let existing = self.list_presets()?;
        if !existing.is_empty() {
            return Ok(());
        }

        let metric_card = serde_json::json!({
            "id": "metric_card_root",
            "widget_type": "v_box",
            "properties": {
                "background_color": "#18181b",
                "corner_radius": 8.0,
                "border_color": "#27272a",
                "border_width": 1.0
            },
            "layout": {
                "padding_top": 16.0,
                "padding_bottom": 16.0,
                "padding_left": 16.0,
                "padding_right": 16.0,
                "gap": 8.0,
                "width": 260.0
            },
            "children": [
                {
                    "id": "metric_title",
                    "widget_type": "label",
                    "properties": {
                        "text": "Total Active Sessions",
                        "font_size": 12.0,
                        "text_color": "#a1a1aa"
                    }
                },
                {
                    "id": "metric_value",
                    "widget_type": "label",
                    "properties": {
                        "text": "4,829",
                        "font_size": 24.0,
                        "font_weight": "bold",
                        "text_color": "#fafafa"
                    }
                },
                {
                    "id": "metric_badge",
                    "widget_type": "label",
                    "properties": {
                        "text": "+18.2% from last week",
                        "font_size": 11.0,
                        "text_color": "#10b981"
                    }
                }
            ]
        });

        let hero_cta = serde_json::json!({
            "id": "hero_cta_root",
            "widget_type": "v_box",
            "properties": {
                "background_color": "#09090b",
                "corner_radius": 12.0,
                "border_color": "#3f3f46",
                "border_width": 1.0
            },
            "layout": {
                "padding_top": 24.0,
                "padding_bottom": 24.0,
                "padding_left": 24.0,
                "padding_right": 24.0,
                "gap": 12.0,
                "width": 380.0
            },
            "children": [
                {
                    "id": "hero_heading",
                    "widget_type": "label",
                    "properties": {
                        "text": "Enterprise Cloud Sync",
                        "font_size": 18.0,
                        "font_weight": "bold",
                        "text_color": "#ffffff"
                    }
                },
                {
                    "id": "hero_sub",
                    "widget_type": "label",
                    "properties": {
                        "text": "Conflict-free collaborative UI engineering with sub-millisecond CRDT replication.",
                        "font_size": 13.0,
                        "text_color": "#71717a",
                        "wrap_text": true
                    }
                },
                {
                    "id": "hero_btn",
                    "widget_type": "button",
                    "properties": {
                        "text": "Join Room & Collaborate",
                        "background_color": "#2563eb",
                        "text_color": "#ffffff",
                        "corner_radius": 6.0
                    },
                    "layout": {
                        "height": 36.0
                    }
                }
            ]
        });

        self.save_preset(CreatePresetPayload {
            name: "Metric Stat Card".to_string(),
            description: Some("Real-time metric display card with trend badge".to_string()),
            category: Some("Cards".to_string()),
            author: Some("Ruxel Team".to_string()),
            root_node: metric_card,
            tags: Some(vec!["stats".to_string(), "card".to_string(), "dashboard".to_string()]),
        })?;

        self.save_preset(CreatePresetPayload {
            name: "Hero Banner CTA".to_string(),
            description: Some("High-impact call to action banner for landing layouts".to_string()),
            category: Some("Headers".to_string()),
            author: Some("Ruxel Team".to_string()),
            root_node: hero_cta,
            tags: Some(vec!["hero".to_string(), "cta".to_string(), "marketing".to_string()]),
        })?;

        Ok(())
    }

    pub fn list_presets(&self) -> Result<Vec<TeamPresetRecord>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, author, created_at, root_node, tags
             FROM team_presets ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let description: String = row.get(2)?;
            let category: String = row.get(3)?;
            let author: String = row.get(4)?;
            let created_at: String = row.get(5)?;
            let root_str: String = row.get(6)?;
            let tags_str: String = row.get(7)?;
            Ok((id, name, description, category, author, created_at, root_str, tags_str))
        })?;

        let mut results = Vec::new();
        for item in rows {
            let (id, name, description, category, author, created_at, root_str, tags_str) = item?;
            let root_node: serde_json::Value = serde_json::from_str(&root_str)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            results.push(TeamPresetRecord {
                id,
                name,
                description,
                category,
                author,
                created_at,
                root_node,
                tags,
            });
        }

        Ok(results)
    }

    pub fn get_preset(&self, id: &str) -> Result<Option<TeamPresetRecord>, StorageError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, category, author, created_at, root_node, tags
             FROM team_presets WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let description: String = row.get(2)?;
            let category: String = row.get(3)?;
            let author: String = row.get(4)?;
            let created_at: String = row.get(5)?;
            let root_str: String = row.get(6)?;
            let tags_str: String = row.get(7)?;

            let root_node: serde_json::Value = serde_json::from_str(&root_str)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

            Ok(Some(TeamPresetRecord {
                id,
                name,
                description,
                category,
                author,
                created_at,
                root_node,
                tags,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn save_preset(&self, payload: CreatePresetPayload) -> Result<TeamPresetRecord, StorageError> {
        let conn = self.conn.lock().unwrap();
        let id = format!("preset_{}", Uuid::new_v4().simple());
        let description = payload.description.unwrap_or_default();
        let category = payload.category.unwrap_or_else(|| "General".to_string());
        let author = payload.author.unwrap_or_else(|| "Anonymous".to_string());
        let created_at = chrono_iso();
        let tags = payload.tags.unwrap_or_default();

        let root_str = serde_json::to_string(&payload.root_node)?;
        let tags_str = serde_json::to_string(&tags)?;

        conn.execute(
            "INSERT INTO team_presets (id, name, description, category, author, created_at, root_node, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                payload.name,
                description,
                category,
                author,
                created_at,
                root_str,
                tags_str
            ],
        )?;

        Ok(TeamPresetRecord {
            id,
            name: payload.name,
            description,
            category,
            author,
            created_at,
            root_node: payload.root_node,
            tags,
        })
    }

    pub fn delete_preset(&self, id: &str) -> Result<bool, StorageError> {
        let conn = self.conn.lock().unwrap();
        let count = conn.execute("DELETE FROM team_presets WHERE id = ?1", params![id])?;
        Ok(count > 0)
    }
}

fn chrono_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    format!("{now}")
}

