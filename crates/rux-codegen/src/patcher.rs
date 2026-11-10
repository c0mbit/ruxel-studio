use std::ops::Range;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use syn::spanned::Spanned;
use syn::{Expr, ExprCall, ExprLit, ExprMacro, ExprMethodCall, File, Item, ItemFn, Lit, Stmt, Token};
use syn::punctuated::Punctuated;
use syn::parse::Parser;

use rux_ast::document::RuxDocument;
use rux_ast::widget::{PropertyValue, WidgetNode, WidgetType};
use crate::error::CodegenError;
use crate::events::EventCollector;
use crate::plugin::TargetFramework;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourcePatch {
    pub range: Range<usize>,
    pub replacement: String,
}

pub struct SourceSpanMap<'a> {
    source: &'a str,
    line_byte_offsets: Vec<usize>,
}

impl<'a> SourceSpanMap<'a> {
    pub fn new(source: &'a str) -> Self {
        let mut line_byte_offsets = vec![0];
        for (idx, b) in source.bytes().enumerate() {
            if b == b'\n' {
                line_byte_offsets.push(idx + 1);
            }
        }
        Self {
            source,
            line_byte_offsets,
        }
    }

    pub fn span_to_byte_range(&self, span: proc_macro2::Span) -> Option<Range<usize>> {
        let start = span.start();
        let end = span.end();
        let start_line = start.line.checked_sub(1)?;
        let end_line = end.line.checked_sub(1)?;

        let line_start_offset = *self.line_byte_offsets.get(start_line)?;
        let line_end_offset = *self.line_byte_offsets.get(end_line)?;

        let start_byte = (line_start_offset + start.column).min(self.source.len());
        let end_byte = (line_end_offset + end.column).min(self.source.len());

        if start_byte <= end_byte && end_byte <= self.source.len() {
            Some(start_byte..end_byte)
        } else {
            None
        }
    }

    pub fn apply_patches(&self, mut patches: Vec<SourcePatch>) -> Result<String, CodegenError> {
        // Sort descending by range start to apply from bottom to top
        patches.sort_by_key(|a| std::cmp::Reverse(a.range.start));

        let mut result = self.source.to_string();

        let mut last_start = usize::MAX;
        for patch in patches {
            if patch.range.end > self.source.len() {
                return Err(CodegenError::SynParseError(format!(
                    "Patch range {:?} out of bounds for source length {}",
                    patch.range,
                    self.source.len()
                )));
            }
            if patch.range.end > last_start {
                return Err(CodegenError::SynParseError(format!(
                    "Overlapping patch detected at range {:?}",
                    patch.range
                )));
            }
            last_start = patch.range.start;

            result.replace_range(patch.range, &patch.replacement);
        }

        Ok(result)
    }
}

pub struct AstPatcher;

impl AstPatcher {
    /// Update a specific property on a widget by locating its exact Span in the source file.
    /// Surrounding comments and code remain completely untouched.
    pub fn patch_property(
        source: &str,
        widget_id: &str,
        property_name: &str,
        new_value: &PropertyValue,
    ) -> Result<String, CodegenError> {
        Self::patch_property_with_hint(source, widget_id, property_name, new_value, None)
    }

    /// Update a specific property on a widget by locating its exact Span in the source file,
    /// with an optional hint text used to locate un-annotated literal widgets in component files.
    pub fn patch_property_with_hint(
        source: &str,
        widget_id: &str,
        property_name: &str,
        new_value: &PropertyValue,
        hint_text: Option<&str>,
    ) -> Result<String, CodegenError> {
        let syntax_file: File = syn::parse_str(source)
            .map_err(|e| CodegenError::SynParseError(format!("Failed to parse source file: {}", e)))?;

        let span_map = SourceSpanMap::new(source);
        let mut target_range: Option<Range<usize>> = None;

        for item in &syntax_file.items {
            match item {
                Item::Fn(ItemFn { sig, block, .. }) => {
                    if sig.ident == "view" || sig.ident == "render_ui" || sig.ident == "build_view" {
                        if let Some(range) = find_property_span_in_stmts(&span_map, &block.stmts, widget_id, property_name) {
                            target_range = Some(range);
                            break;
                        }
                    }
                }
                Item::Impl(item_impl) => {
                    for impl_item in &item_impl.items {
                        if let syn::ImplItem::Fn(method) = impl_item {
                            if method.sig.ident == "view" || method.sig.ident == "render_ui" || method.sig.ident == "build_view" {
                                if let Some(range) = find_property_span_in_stmts(&span_map, &method.block.stmts, widget_id, property_name) {
                                    target_range = Some(range);
                                    break;
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
            if target_range.is_some() {
                break;
            }
        }

        // Resilient fallback for component files: search any function or method in the file
        if target_range.is_none() {
            for item in &syntax_file.items {
                match item {
                    Item::Fn(ItemFn { block, .. }) => {
                        if let Some(range) = find_property_span_in_stmts(&span_map, &block.stmts, widget_id, property_name) {
                            target_range = Some(range);
                            break;
                        }
                    }
                    Item::Impl(item_impl) => {
                        for impl_item in &item_impl.items {
                            if let syn::ImplItem::Fn(method) = impl_item {
                                if let Some(range) = find_property_span_in_stmts(&span_map, &method.block.stmts, widget_id, property_name) {
                                    target_range = Some(range);
                                    break;
                                }
                            }
                        }
                    }
                    _ => {}
                }
                if target_range.is_some() {
                    break;
                }
            }
        }

        // If not found by widget id, search by matching literal text if property_name == "text"
        if target_range.is_none() && property_name == "text" {
            if let Some(hint) = hint_text {
                target_range = find_literal_str_span(&span_map, &syntax_file, hint);
            }
        }

        let range = match target_range {
            Some(r) => r,
            None => {
                return Err(CodegenError::WidgetNotFound(format!(
                    "Widget '{}' or property '{}' could not be mapped to an AST Span in source",
                    widget_id, property_name
                )));
            }
        };

        let replacement = match new_value {
            PropertyValue::Static(s) => {
                if property_name == "style" {
                    match s.to_lowercase().as_str() {
                        "primary" => "theme::Button::Primary".to_string(),
                        "secondary" => "theme::Button::Secondary".to_string(),
                        "success" => "theme::Button::Success".to_string(),
                        "danger" | "destructive" => "theme::Button::Destructive".to_string(),
                        "text" => "theme::Button::Text".to_string(),
                        _ => s.clone(),
                    }
                } else {
                    format!("\"{}\"", s)
                }
            }
            PropertyValue::Binding(b) => b.clone(),
        };

        span_map.apply_patches(vec![SourcePatch {
            range,
            replacement,
        }])
    }

    /// Appends a new child widget into a container macro (e.g. column![...])
    /// or immediate mode closure without replacing or modifying surrounding tokens or comments.
    pub fn append_widget(
        source: &str,
        new_widget: &WidgetNode,
        framework: TargetFramework,
    ) -> Result<String, CodegenError> {
        let syntax_file: File = syn::parse_str(source)
            .map_err(|e| CodegenError::SynParseError(format!("Failed to parse source file: {}", e)))?;

        let span_map = SourceSpanMap::new(source);
        let mut insert_pos: Option<usize> = None;
        let mut needs_leading_comma = false;

        if framework == TargetFramework::Egui {
            for item in &syntax_file.items {
                if let Item::Fn(ItemFn { sig, block, .. }) = item {
                    if sig.ident == "render_ui" {
                        let mut target_span = block.span();
                        for stmt in &block.stmts {
                            if let Stmt::Expr(expr, _) = stmt {
                                if let Expr::MethodCall(m) = unwrap_base_expr(expr) {
                                    for arg in &m.args {
                                        if let Expr::Closure(c) = arg {
                                            if let Expr::Block(b) = &*c.body {
                                                target_span = b.block.span();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if let Some(range) = span_map.span_to_byte_range(target_span) {
                            let slice = &source[range.clone()];
                            if let Some(rel_bracket) = slice.rfind('}') {
                                insert_pos = Some(range.start + rel_bracket);
                            }
                        }
                    }
                }
            }
        } else {
            for item in &syntax_file.items {
                if let Item::Fn(ItemFn { sig, block, .. }) = item {
                    if sig.ident == "view" || sig.ident == "render_ui" || sig.ident == "build_view" {
                        for stmt in &block.stmts {
                            if let Stmt::Expr(expr, _) = stmt {
                                let unwrapped = unwrap_base_expr(expr);
                                if let Expr::Macro(ExprMacro { mac, .. }) = unwrapped {
                                    let mac_name = mac.path.segments.last().map(|s| s.ident.to_string()).unwrap_or_default();
                                    if mac_name == "column" || mac_name == "row" {
                                        // Parse punctuated elements
                                        let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
                                        if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                                            if let Some(last_elem) = punctuated.last() {
                                                if let Some(range) = span_map.span_to_byte_range(last_elem.span()) {
                                                    // Find the bracket after this element
                                                    let slice_after = &source[range.end..];
                                                    if let Some(bracket_rel) = slice_after.find(']') {
                                                        let bracket_idx = range.end + bracket_rel;
                                                        let between = &source[range.end..bracket_idx].trim();
                                                        needs_leading_comma = !between.ends_with(',');
                                                        insert_pos = Some(bracket_idx);
                                                    }
                                                }
                                            } else {
                                                // Empty macro
                                                if let Some(mac_range) = span_map.span_to_byte_range(mac.span()) {
                                                    let slice = &source[mac_range.clone()];
                                                    if let Some(bracket_rel) = slice.rfind(']') {
                                                        insert_pos = Some(mac_range.start + bracket_rel);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if insert_pos.is_some() {
                    break;
                }
            }
        }

        let pos = insert_pos.ok_or_else(|| {
            CodegenError::SynParseError("Could not locate container to append widget".to_string())
        })?;

        let widget_tokens = generate_single_widget_snippet(new_widget, framework);
        let mut replacement = String::new();
        if needs_leading_comma {
            replacement.push_str(",\n        ");
        } else {
            replacement.push_str("\n        ");
        }
        replacement.push_str(&widget_tokens);
        if framework == TargetFramework::Iced {
            replacement.push_str(",\n    ");
        } else {
            replacement.push('\n');
        }

        span_map.apply_patches(vec![SourcePatch {
            range: pos..pos,
            replacement,
        }])
    }

    /// Patch existing UI code using localized Span replacements based on document diffs.
    pub fn patch_ui_source(
        existing_source: &str,
        doc: &RuxDocument,
        _framework: TargetFramework,
    ) -> Result<String, CodegenError> {
        let syntax_file: File = match syn::parse_str(existing_source) {
            Ok(f) => f,
            Err(_) => {
                // If existing source is broken, fallback to generating fresh code
                return Ok(existing_source.to_string());
            }
        };

        let span_map = SourceSpanMap::new(existing_source);
        let events = EventCollector::collect_document(doc);
        let mut patches: Vec<SourcePatch> = Vec::new();

        for item in &syntax_file.items {
            if let Item::Fn(ItemFn { sig, block, .. }) = item {
                if sig.ident == "render_ui" {
                    for stmt in &block.stmts {
                        if let Stmt::Expr(expr, _) = stmt {
                            let unwrapped = unwrap_base_expr(expr);
                            if let Expr::MethodCall(m) = unwrapped {
                                for arg in &m.args {
                                    if let Expr::Closure(closure) = arg {
                                        if let Expr::Block(b) = &*closure.body {
                                            collect_egui_closure_diff_patches(
                                                &span_map,
                                                &b.block.stmts,
                                                &doc.root.children,
                                                &events,
                                                &mut patches,
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if sig.ident == "view" {
                    for stmt in &block.stmts {
                        if let Stmt::Expr(expr, _) = stmt {
                            let unwrapped = unwrap_base_expr(expr);
                            if let Expr::Macro(ExprMacro { mac, .. }) = unwrapped {
                                let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
                                if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                                    let elements: Vec<Expr> = punctuated.into_iter().collect();
                                    collect_macro_diff_patches(
                                        &span_map,
                                        &elements,
                                        &doc.root.children,
                                        &events,
                                        &mut patches,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        if patches.is_empty() {
            Ok(existing_source.to_string())
        } else {
            span_map.apply_patches(patches)
        }
    }

    /// Patches a property across a multi-file architecture by discovering which file
    /// owns the given widget (either the main UI file or an extracted component file).
    pub fn patch_multi_file(
        base_dir: &Path,
        doc: &RuxDocument,
        widget_id: &str,
        property_name: &str,
        new_value: &PropertyValue,
        framework: TargetFramework,
    ) -> Result<MultiFilePatchReport, CodegenError> {
        let target_file = resolve_widget_file_path(base_dir, doc, widget_id, framework)
            .ok_or_else(|| CodegenError::WidgetNotFound(format!(
                "Widget '{}' is not registered in root document or any component",
                widget_id
            )))?;

        let source = std::fs::read_to_string(&target_file)
            .map_err(|e| CodegenError::SynParseError(format!(
                "Failed to read target component file '{}': {}",
                target_file.display(),
                e
            )))?;

        let widget_node = find_widget_in_tree(&doc.root, widget_id).or_else(|| {
            for comp in doc.components.values() {
                if let Some(w) = find_widget_in_tree(&comp.root, widget_id) {
                    return Some(w);
                }
            }
            None
        });

        let hint_text = widget_node.and_then(|w| w.properties.text.as_ref().map(|t| t.as_str()));

        let patched_source = Self::patch_property_with_hint(&source, widget_id, property_name, new_value, hint_text)?;

        Ok(MultiFilePatchReport {
            target_file,
            patched_source,
            widget_id: widget_id.to_string(),
            property_name: property_name.to_string(),
            applied_cleanly: true,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WidgetLocation {
    MainDocument,
    Component {
        name: String,
        file_path: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiFilePatchReport {
    pub target_file: PathBuf,
    pub patched_source: String,
    pub widget_id: String,
    pub property_name: String,
    pub applied_cleanly: bool,
}

pub fn to_snake_case(s: &str) -> String {
    let mut res = String::new();
    for (i, ch) in s.chars().enumerate() {
        if ch.is_uppercase() {
            if i > 0 {
                res.push('_');
            }
            for lower in ch.to_lowercase() {
                res.push(lower);
            }
        } else {
            res.push(ch);
        }
    }
    res
}

pub fn find_widget_in_tree<'a>(node: &'a WidgetNode, widget_id: &str) -> Option<&'a WidgetNode> {
    if node.id == widget_id {
        return Some(node);
    }
    for child in &node.children {
        if let Some(found) = find_widget_in_tree(child, widget_id) {
            return Some(found);
        }
    }
    None
}

pub fn resolve_widget_owner(doc: &RuxDocument, widget_id: &str) -> Option<WidgetLocation> {
    if find_widget_in_tree(&doc.root, widget_id).is_some() {
        return Some(WidgetLocation::MainDocument);
    }
    for (comp_name, comp_def) in &doc.components {
        if find_widget_in_tree(&comp_def.root, widget_id).is_some() {
            return Some(WidgetLocation::Component {
                name: comp_name.clone(),
                file_path: comp_def.file_path.clone(),
            });
        }
    }
    None
}

pub fn resolve_widget_file_path(
    base_dir: &Path,
    doc: &RuxDocument,
    widget_id: &str,
    framework: TargetFramework,
) -> Option<PathBuf> {
    let location = resolve_widget_owner(doc, widget_id)?;
    match location {
        WidgetLocation::MainDocument => {
            match framework {
                TargetFramework::Slint => {
                    let p1 = base_dir.join("ui_generated.slint");
                    if p1.exists() { return Some(p1); }
                    let p2 = base_dir.join("ui.slint");
                    if p2.exists() { return Some(p2); }
                    Some(p1)
                }
                _ => {
                    let p1 = base_dir.join("src").join("ui_generated.rs");
                    if p1.exists() { return Some(p1); }
                    let p2 = base_dir.join("ui_generated.rs");
                    if p2.exists() { return Some(p2); }
                    let p3 = base_dir.join("src").join("main.rs");
                    if p3.exists() { return Some(p3); }
                    Some(p1)
                }
            }
        }
        WidgetLocation::Component { name, file_path } => {
            if let Some(rel_path) = file_path {
                let path = base_dir.join(&rel_path);
                return Some(path);
            }
            let snake_name = to_snake_case(&name);
            let ext = match framework {
                TargetFramework::Slint => "slint",
                _ => "rs",
            };
            let file_name = format!("{}.{}", snake_name, ext);
            let direct = base_dir.join("src").join("components").join(&file_name);
            if direct.exists() {
                return Some(direct);
            }
            let flat = base_dir.join("components").join(&file_name);
            if flat.exists() {
                return Some(flat);
            }
            Some(direct)
        }
    }
}

fn unwrap_base_expr(expr: &Expr) -> &Expr {
    let mut current = expr;
    while let Expr::MethodCall(m) = current {
        current = &m.receiver;
    }
    current
}

fn find_property_span_in_stmts(
    span_map: &SourceSpanMap,
    stmts: &[Stmt],
    widget_id: &str,
    prop_name: &str,
) -> Option<Range<usize>> {
    for stmt in stmts {
        match stmt {
            Stmt::Expr(expr, _) => {
                if let Some(r) = find_property_span_in_expr(span_map, expr, widget_id, prop_name) {
                    return Some(r);
                }
            }
            Stmt::Local(local) => {
                if let Some(init) = &local.init {
                    if let Some(r) = find_property_span_in_expr(span_map, &init.expr, widget_id, prop_name) {
                        return Some(r);
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn find_property_span_in_expr(
    span_map: &SourceSpanMap,
    expr: &Expr,
    widget_id: &str,
    prop_name: &str,
) -> Option<Range<usize>> {
    match expr {
        Expr::Block(b) => {
            find_property_span_in_stmts(span_map, &b.block.stmts, widget_id, prop_name)
        }
        Expr::Closure(c) => {
            if let Expr::Block(b) = &*c.body {
                find_property_span_in_stmts(span_map, &b.block.stmts, widget_id, prop_name)
            } else {
                find_property_span_in_expr(span_map, &c.body, widget_id, prop_name)
            }
        }
        Expr::If(expr_if) => {
            if let Some(r) = find_property_span_in_expr(span_map, &expr_if.cond, widget_id, prop_name) {
                return Some(r);
            }
            if let Some(r) = find_property_span_in_stmts(span_map, &expr_if.then_branch.stmts, widget_id, prop_name) {
                return Some(r);
            }
            if let Some((_, else_expr)) = &expr_if.else_branch {
                if let Some(r) = find_property_span_in_expr(span_map, else_expr, widget_id, prop_name) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Match(m) => {
            if let Some(r) = find_property_span_in_expr(span_map, &m.expr, widget_id, prop_name) {
                return Some(r);
            }
            for arm in &m.arms {
                if let Some(r) = find_property_span_in_expr(span_map, &arm.body, widget_id, prop_name) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Macro(ExprMacro { mac, .. }) => {
            let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
            if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                for elem in punctuated {
                    if let Some(r) = find_property_span_in_expr(span_map, &elem, widget_id, prop_name) {
                        return Some(r);
                    }
                }
            }
            find_property_span_in_widget(span_map, expr, widget_id, prop_name)
        }
        Expr::MethodCall(m) => {
            for arg in &m.args {
                if let Expr::Closure(_) = arg {
                    if let Some(r) = find_property_span_in_expr(span_map, arg, widget_id, prop_name) {
                        return Some(r);
                    }
                }
                if let Expr::Call(_) | Expr::MethodCall(_) = arg {
                    if let Some(r) = find_property_span_in_expr(span_map, arg, widget_id, prop_name) {
                        return Some(r);
                    }
                }
            }
            if let Some(r) = find_property_span_in_widget(span_map, expr, widget_id, prop_name) {
                return Some(r);
            }
            find_property_span_in_expr(span_map, &m.receiver, widget_id, prop_name)
        }
        Expr::Call(c) => {
            if let Some(r) = find_property_span_in_widget(span_map, expr, widget_id, prop_name) {
                return Some(r);
            }
            for arg in &c.args {
                if let Some(r) = find_property_span_in_expr(span_map, arg, widget_id, prop_name) {
                    return Some(r);
                }
            }
            None
        }
        _ => find_property_span_in_widget(span_map, expr, widget_id, prop_name),
    }
}

fn find_property_span_in_widget(
    span_map: &SourceSpanMap,
    expr: &Expr,
    widget_id: &str,
    prop_name: &str,
) -> Option<Range<usize>> {
    let mut current = expr;
    let mut methods: Vec<&ExprMethodCall> = Vec::new();

    while let Expr::MethodCall(m) = current {
        methods.push(m);
        current = &m.receiver;
    }

    let mut matches_id = false;
    for m in &methods {
        for arg in &m.args {
            let arg_str = quote::quote!(#arg).to_string();
            if arg_str.contains(widget_id) {
                matches_id = true;
                break;
            }
        }
        if matches_id {
            break;
        }
    }

    if !matches_id {
        let base_str = quote::quote!(#current).to_string();
        if base_str.contains(widget_id) {
            matches_id = true;
        }
    }

    if !matches_id {
        let expr_str = quote::quote!(#expr).to_string();
        if expr_str.contains(widget_id) {
            matches_id = true;
        }
    }

    if !matches_id {
        if let Some(text_span) = find_text_arg_span(span_map, expr) {
            let lit = &span_map.source[text_span];
            if lit.trim_matches('"') == widget_id {
                matches_id = true;
            }
        }
    }

    if prop_name == "style" {
        for m in &methods {
            if m.method == "style"
                && (matches_id || methods.len() <= 2) {
                    if let Some(first_arg) = m.args.first() {
                        return span_map.span_to_byte_range(first_arg.span());
                    }
                }
        }
    }

    if matches_id
        && prop_name == "text" {
            if let Some(range) = find_text_arg_span(span_map, expr) {
                return Some(range);
            }
        }

    None
}

fn find_text_arg_span(span_map: &SourceSpanMap, expr: &Expr) -> Option<Range<usize>> {
    match expr {
        Expr::Call(ExprCall { args, func, .. }) => {
            let func_str = quote::quote!(#func).to_string();
            if func_str == "text" || func_str.contains("Button::new") || func_str.contains("Label::new") {
                if let Some(first) = args.first() {
                    return span_map.span_to_byte_range(first.span());
                }
            }
            for arg in args {
                if let Some(r) = find_text_arg_span(span_map, arg) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Lit(ExprLit { lit: Lit::Str(s), .. }) => {
            span_map.span_to_byte_range(s.span())
        }
        Expr::MethodCall(m) => {
            if m.method == "text" || m.method == "button" || m.method == "label" {
                if let Some(first) = m.args.first() {
                    return span_map.span_to_byte_range(first.span());
                }
            }
            if m.method == "checkbox" {
                if let Some(second) = m.args.get(1) {
                    return span_map.span_to_byte_range(second.span());
                } else if let Some(first) = m.args.first() {
                    return span_map.span_to_byte_range(first.span());
                }
            }
            for arg in &m.args {
                if let Some(r) = find_text_arg_span(span_map, arg) {
                    return Some(r);
                }
            }
            find_text_arg_span(span_map, &m.receiver)
        }
        Expr::Reference(r) => find_text_arg_span(span_map, &r.expr),
        _ => None,
    }
}

fn find_literal_str_span_in_expr(span_map: &SourceSpanMap, expr: &Expr, target: &str) -> Option<Range<usize>> {
    match expr {
        Expr::Lit(ExprLit { lit: Lit::Str(s), .. }) => {
            if s.value() == target {
                span_map.span_to_byte_range(s.span())
            } else {
                None
            }
        }
        Expr::Call(c) => {
            for arg in &c.args {
                if let Some(r) = find_literal_str_span_in_expr(span_map, arg, target) {
                    return Some(r);
                }
            }
            find_literal_str_span_in_expr(span_map, &c.func, target)
        }
        Expr::MethodCall(m) => {
            for arg in &m.args {
                if let Some(r) = find_literal_str_span_in_expr(span_map, arg, target) {
                    return Some(r);
                }
            }
            find_literal_str_span_in_expr(span_map, &m.receiver, target)
        }
        Expr::Macro(ExprMacro { mac, .. }) => {
            let parser = Punctuated::<Expr, Token![,]>::parse_terminated;
            if let Ok(punctuated) = parser.parse2(mac.tokens.clone()) {
                for elem in punctuated {
                    if let Some(r) = find_literal_str_span_in_expr(span_map, &elem, target) {
                        return Some(r);
                    }
                }
            }
            None
        }
        Expr::Block(b) => {
            for stmt in &b.block.stmts {
                if let Some(r) = find_literal_str_span_in_stmt(span_map, stmt, target) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Closure(c) => find_literal_str_span_in_expr(span_map, &c.body, target),
        Expr::If(i) => {
            if let Some(r) = find_literal_str_span_in_expr(span_map, &i.cond, target) {
                return Some(r);
            }
            for stmt in &i.then_branch.stmts {
                if let Some(r) = find_literal_str_span_in_stmt(span_map, stmt, target) {
                    return Some(r);
                }
            }
            if let Some((_, else_expr)) = &i.else_branch {
                if let Some(r) = find_literal_str_span_in_expr(span_map, else_expr, target) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Reference(r) => find_literal_str_span_in_expr(span_map, &r.expr, target),
        Expr::Tuple(t) => {
            for elem in &t.elems {
                if let Some(r) = find_literal_str_span_in_expr(span_map, elem, target) {
                    return Some(r);
                }
            }
            None
        }
        Expr::Array(a) => {
            for elem in &a.elems {
                if let Some(r) = find_literal_str_span_in_expr(span_map, elem, target) {
                    return Some(r);
                }
            }
            None
        }
        _ => None,
    }
}

fn find_literal_str_span_in_stmt(span_map: &SourceSpanMap, stmt: &Stmt, target: &str) -> Option<Range<usize>> {
    match stmt {
        Stmt::Expr(expr, _) => find_literal_str_span_in_expr(span_map, expr, target),
        Stmt::Local(local) => {
            if let Some(init) = &local.init {
                find_literal_str_span_in_expr(span_map, &init.expr, target)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn find_literal_str_span(span_map: &SourceSpanMap, syntax_file: &File, target: &str) -> Option<Range<usize>> {
    for item in &syntax_file.items {
        match item {
            Item::Fn(ItemFn { block, .. }) => {
                for stmt in &block.stmts {
                    if let Some(r) = find_literal_str_span_in_stmt(span_map, stmt, target) {
                        return Some(r);
                    }
                }
            }
            Item::Impl(item_impl) => {
                for impl_item in &item_impl.items {
                    if let syn::ImplItem::Fn(method) = impl_item {
                        for stmt in &method.block.stmts {
                            if let Some(r) = find_literal_str_span_in_stmt(span_map, stmt, target) {
                                return Some(r);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn collect_egui_closure_diff_patches(
    span_map: &SourceSpanMap,
    stmts: &[Stmt],
    doc_children: &[WidgetNode],
    _events: &[crate::events::BoundEvent],
    patches: &mut Vec<SourcePatch>,
) {
    let mut child_idx = 0;
    for stmt in stmts {
        if child_idx >= doc_children.len() {
            break;
        }
        let doc_child = &doc_children[child_idx];
        let expr_opt = match stmt {
            Stmt::Expr(expr, _) => Some(expr),
            Stmt::Local(local) => local.init.as_ref().map(|i| &*i.expr),
            _ => None,
        };

        if let Some(expr) = expr_opt {
            if let Some(new_text) = &doc_child.properties.text {
                if let Some(text_range) = find_text_arg_span(span_map, expr) {
                    let old_slice = &span_map.source[text_range.clone()];
                    let expected_new = match new_text {
                        PropertyValue::Static(s) => format!("\"{}\"", s),
                        PropertyValue::Binding(b) => b.clone(),
                    };
                    if old_slice != expected_new {
                        patches.push(SourcePatch {
                            range: text_range,
                            replacement: expected_new,
                        });
                    }
                }
            }
            child_idx += 1;
        }
    }
}

fn collect_macro_diff_patches(
    span_map: &SourceSpanMap,
    elements: &[Expr],
    doc_children: &[WidgetNode],
    _events: &[crate::events::BoundEvent],
    patches: &mut Vec<SourcePatch>,
) {
    for (idx, elem_expr) in elements.iter().enumerate() {
        if let Some(doc_child) = doc_children.get(idx) {
            if let Some(new_text) = &doc_child.properties.text {
                if let Some(text_range) = find_text_arg_span(span_map, elem_expr) {
                    let old_slice = &span_map.source[text_range.clone()];
                    let expected_new = match new_text {
                        PropertyValue::Static(s) => format!("\"{}\"", s),
                        PropertyValue::Binding(b) => b.clone(),
                    };
                    if old_slice != expected_new {
                        patches.push(SourcePatch {
                            range: text_range,
                            replacement: expected_new,
                        });
                    }
                }
            }
        }
    }
}

fn generate_single_widget_snippet(node: &WidgetNode, framework: TargetFramework) -> String {
    match framework {
        TargetFramework::Iced => {
            match node.widget_type {
                WidgetType::Button => {
                    let text_expr = if let Some(pv) = &node.properties.text {
                        match pv {
                            PropertyValue::Binding(b) => format!("text({})", b),
                            PropertyValue::Static(s) => format!("text(\"{}\")", s),
                        }
                    } else {
                        format!("text(\"{}\")", node.id)
                    };
                    format!("button({})", text_expr)
                }
                WidgetType::Label => {
                    if let Some(pv) = &node.properties.text {
                        match pv {
                            PropertyValue::Binding(b) => format!("text({})", b),
                            PropertyValue::Static(s) => format!("text(\"{}\")", s),
                        }
                    } else {
                        format!("text(\"{}\")", node.id)
                    }
                }
                WidgetType::GenericWidget => {
                    let custom = node.properties.custom_type.as_deref().unwrap_or("CustomWidget::new");
                    let args = node.properties.raw_args.as_deref().unwrap_or("");
                    format!("{}({})", custom, args)
                }
                _ => format!("text(\"{}\")", node.id),
            }
        }
        TargetFramework::Egui => {
            match node.widget_type {
                WidgetType::Button => {
                    let txt = node.properties.text.as_ref().map(|t| t.as_str()).unwrap_or(&node.id);
                    format!("let _ = ui.button(\"{}\");", txt)
                }
                WidgetType::Label => {
                    let txt = node.properties.text.as_ref().map(|t| t.as_str()).unwrap_or(&node.id);
                    format!("ui.label(\"{}\");", txt)
                }
                WidgetType::Checkbox => {
                    let txt = node.properties.text.as_ref().map(|t| t.as_str()).unwrap_or(&node.id);
                    format!("ui.checkbox(&mut state.{}, \"{}\");", node.id, txt)
                }
                WidgetType::GenericWidget => {
                    let custom = node.properties.custom_type.as_deref().unwrap_or("generic_widget");
                    format!("{}(ui);", custom)
                }
                _ => {
                    format!("ui.label(\"{}\");", node.id)
                }
            }
        }
        TargetFramework::Slint => {
            match node.widget_type {
                WidgetType::Button => {
                    let txt = node.properties.text.as_ref().map(|t| t.as_str()).unwrap_or(&node.id);
                    format!("Button {{ text: \"{}\"; }}", txt)
                }
                WidgetType::Label => {
                    let txt = node.properties.text.as_ref().map(|t| t.as_str()).unwrap_or(&node.id);
                    format!("Text {{ text: \"{}\"; }}", txt)
                }
                WidgetType::Rectangle => {
                    "Rectangle { background: #27272a; }".to_string()
                }
                _ => format!("Text {{ text: \"{}\"; }}", node.id),
            }
        }
        _ => format!("text(\"{}\")", node.id),
    }
}
