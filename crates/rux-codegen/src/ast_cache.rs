use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};

use quote::ToTokens;
use syn::Expr;

/// Statistics on AST cache performance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct AstCacheStats {
    pub hits: usize,
    pub misses: usize,
    pub bypassed_reconciles: usize,
}

/// Incremental AST cache that hashes raw token streams of individual UI blocks,
/// macro expressions (such as `column![...]` and `row![...]`), and functions.
///
/// Prevents redundant 4-pass correlation cycles on unmodified UI subtrees
/// during reverse parsing of massive (5000+ line) codebases.
pub struct AstCache {
    entries: HashMap<String, u64>,
    stats: AstCacheStats,
    max_entries: usize,
}

impl Default for AstCache {
    fn default() -> Self {
        Self::new()
    }
}

impl AstCache {
    /// Creates a new AST cache with default capacity bounding (2048 blocks).
    pub fn new() -> Self {
        Self {
            entries: HashMap::with_capacity(128),
            stats: AstCacheStats::default(),
            max_entries: 2048,
        }
    }

    /// Creates an AST cache with a custom maximum capacity.
    pub fn with_capacity(max_entries: usize) -> Self {
        Self {
            entries: HashMap::with_capacity(max_entries.min(256)),
            stats: AstCacheStats::default(),
            max_entries,
        }
    }

    /// Access the global thread-safe singleton AST cache.
    pub fn global() -> &'static Mutex<AstCache> {
        static GLOBAL_CACHE: OnceLock<Mutex<AstCache>> = OnceLock::new();
        GLOBAL_CACHE.get_or_init(|| Mutex::new(AstCache::new()))
    }

    /// Computes a 64-bit hash of a slice of Syn expressions.
    pub fn compute_exprs_hash(elements: &[Expr]) -> u64 {
        let mut hasher = DefaultHasher::new();
        for expr in elements {
            let tokens = expr.to_token_stream().to_string();
            tokens.hash(&mut hasher);
        }
        hasher.finish()
    }

    /// Computes a 64-bit hash of a slice of Syn statements.
    pub fn compute_stmts_hash(stmts: &[syn::Stmt]) -> u64 {
        let mut hasher = DefaultHasher::new();
        for stmt in stmts {
            let tokens = stmt.to_token_stream().to_string();
            tokens.hash(&mut hasher);
        }
        hasher.finish()
    }

    /// Computes a 64-bit hash of any `ToTokens` AST item (e.g. `Stmt`, `Block`, `File`).
    pub fn compute_token_stream_hash<T: ToTokens>(item: &T) -> u64 {
        let mut hasher = DefaultHasher::new();
        let tokens_str = item.to_token_stream().to_string();
        tokens_str.hash(&mut hasher);
        hasher.finish()
    }

    /// Computes a 64-bit hash of a raw string (e.g. macro block or Slint component).
    pub fn compute_str_hash(content: &str) -> u64 {
        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        hasher.finish()
    }

    /// Checks if a UI block can bypass 4-pass reconciliation.
    ///
    /// Returns `true` if `has_existing_children` is true AND the cached hash
    /// matches `current_hash`. Automatically updates cache hits/misses metrics.
    pub fn should_bypass(
        &mut self,
        block_id: &str,
        current_hash: u64,
        has_existing_children: bool,
    ) -> bool {
        if has_existing_children {
            if let Some(&cached_hash) = self.entries.get(block_id) {
                if cached_hash == current_hash {
                    self.stats.hits += 1;
                    self.stats.bypassed_reconciles += 1;
                    return true;
                }
            }
        }

        self.stats.misses += 1;
        false
    }

    /// Updates the cached hash for the specified block.
    /// Applies capacity bounding to prevent memory leaks during long-running sessions.
    pub fn update(&mut self, block_id: String, hash: u64) {
        if self.entries.len() >= self.max_entries && !self.entries.contains_key(&block_id) {
            // Prune oldest 25% of entries to prevent unbounded memory growth
            let prune_count = self.max_entries / 4;
            let keys_to_remove: Vec<String> = self.entries.keys().take(prune_count).cloned().collect();
            for k in keys_to_remove {
                self.entries.remove(&k);
            }
        }
        self.entries.insert(block_id, hash);
    }

    /// Invalidate a specific block or subtree from the cache.
    pub fn invalidate(&mut self, block_id: &str) {
        self.entries.remove(block_id);
    }

    /// Clear all cached hashes.
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Retrieve the current cache statistics.
    pub fn stats(&self) -> AstCacheStats {
        self.stats
    }

    /// Reset metrics counters (useful for isolated benchmark runs).
    pub fn reset_stats(&mut self) {
        self.stats = AstCacheStats::default();
    }

    /// Return the number of currently cached block entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Check if the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rux_ast::document::RuxDocument;
    use rux_ast::widget::{PropertyValue, WidgetNode, WidgetProperties, WidgetType};
    use crate::plugin::TargetFramework;
    use crate::reverse_parser::ReverseParser;

    fn create_test_doc() -> RuxDocument {
        let mut doc = RuxDocument::default();
        doc.root = WidgetNode {
            id: "root".to_string(),
            widget_type: WidgetType::VBox,
            slot: None,
            properties: WidgetProperties::default(),
            layout: None,
            events: Default::default(),
            bindings: Default::default(),
            animations: Vec::new(),
            children: vec![
                WidgetNode {
                    id: "btn_submit".to_string(),
                    widget_type: WidgetType::Button,
                    slot: None,
                    properties: WidgetProperties {
                        text: Some(PropertyValue::Static("Submit".to_string())),
                        ..Default::default()
                    },
                    layout: None,
                    events: Default::default(),
                    bindings: Default::default(),
                    animations: Vec::new(),
                    children: Vec::new(),
                },
                WidgetNode {
                    id: "lbl_title".to_string(),
                    widget_type: WidgetType::Label,
                    slot: None,
                    properties: WidgetProperties {
                        text: Some(PropertyValue::Static("Welcome".to_string())),
                        ..Default::default()
                    },
                    layout: None,
                    events: Default::default(),
                    bindings: Default::default(),
                    animations: Vec::new(),
                    children: Vec::new(),
                },
            ],
        };
        doc
    }

    #[test]
    fn test_ast_cache_identical_blocks_bypass_heavy_reconciliation() {
        let mut doc = create_test_doc();
        let mut cache = AstCache::new();

        let code = r#"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, column, text};
                column![
                    button(text("Submit")).on_press(UiMessage::OnSubmit),
                    text("Welcome")
                ]
                .into()
            }
        "#;

        // Pass 1: Cold cache -> miss
        let rep1 = ReverseParser::patch_document_with_cache(
            &mut doc,
            code,
            Some(TargetFramework::Iced),
            &mut cache,
        )
        .expect("Pass 1 should succeed");
        assert_eq!(rep1.patched_nodes_count, 0);
        assert_eq!(cache.stats().misses, 1);
        assert_eq!(cache.stats().hits, 0);
        assert_eq!(cache.stats().bypassed_reconciles, 0);

        // Pass 2: Warm cache with identical code -> HIT!
        let rep2 = ReverseParser::patch_document_with_cache(
            &mut doc,
            code,
            Some(TargetFramework::Iced),
            &mut cache,
        )
        .expect("Pass 2 should succeed");
        assert_eq!(rep2.patched_nodes_count, 0);
        assert_eq!(cache.stats().hits, 1);
        assert_eq!(cache.stats().bypassed_reconciles, 1);
    }

    #[test]
    fn test_ast_cache_detects_mutation_in_child_element() {
        let mut doc = create_test_doc();
        let mut cache = AstCache::new();

        let code1 = r#"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, column, text};
                column![
                    button(text("Submit")).on_press(UiMessage::OnSubmit),
                    text("Welcome")
                ]
                .into()
            }
        "#;

        ReverseParser::patch_document_with_cache(
            &mut doc,
            code1,
            Some(TargetFramework::Iced),
            &mut cache,
        )
        .unwrap();

        // Mutate button text to "Save Changes"
        let code2 = r#"
            pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
                use iced::widget::{button, column, text};
                column![
                    button(text("Save Changes")).on_press(UiMessage::OnSubmit),
                    text("Welcome")
                ]
                .into()
            }
        "#;

        let rep2 = ReverseParser::patch_document_with_cache(
            &mut doc,
            code2,
            Some(TargetFramework::Iced),
            &mut cache,
        )
        .unwrap();

        assert_eq!(rep2.patched_nodes_count, 1);
        assert_eq!(
            doc.root.children[0].properties.text.as_ref().map(|t| t.as_str()),
            Some("Save Changes")
        );
        // Second run was a miss because the block changed
        assert_eq!(cache.stats().misses, 2);
    }

    #[test]
    fn test_ast_cache_capacity_bounding_pruning() {
        let mut cache = AstCache::with_capacity(4);
        cache.update("block_1".to_string(), 101);
        cache.update("block_2".to_string(), 102);
        cache.update("block_3".to_string(), 103);
        cache.update("block_4".to_string(), 104);
        assert_eq!(cache.len(), 4);

        // Adding 5th entry when capacity is 4 triggers pruning
        cache.update("block_5".to_string(), 105);
        assert!(cache.len() <= 4, "Cache length {} should not exceed 4", cache.len());
    }

    #[test]
    fn test_ast_cache_egui_block_bypass() {
        let mut doc = create_test_doc();
        let mut cache = AstCache::new();

        let egui_code = r#"
            pub fn render_ui(ui: &mut egui::Ui, state: &mut AppState) {
                if ui.button("Submit").clicked() {
                    state.on_submit();
                }
            }
        "#;

        // Run 1: miss
        ReverseParser::patch_document_with_cache(
            &mut doc,
            egui_code,
            Some(TargetFramework::Egui),
            &mut cache,
        )
        .unwrap();
        assert_eq!(cache.stats().misses, 1);

        // Run 2: hit
        ReverseParser::patch_document_with_cache(
            &mut doc,
            egui_code,
            Some(TargetFramework::Egui),
            &mut cache,
        )
        .unwrap();
        assert_eq!(cache.stats().hits, 1);
        assert_eq!(cache.stats().bypassed_reconciles, 1);
    }
}
