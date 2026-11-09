mod compiler;
mod watcher;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use compiler::{WasmBuildResult, WasmCompiler, WasmPreviewStatus};

use rux_ast::document::RuxDocument;
use rux_ast::validator::DocumentValidator;
use rux_codegen::reverse_parser::{PropertyPatch, ReverseParser};
use rux_codegen::{
    CodegenDiagnostic, CodegenOptions, GeneratedFile, PluginRegistry, TargetFramework,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use watcher::{DebouncedFileWatcher, SettledFileEvent};

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse<T: Serialize> {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcErrorResponse>,
}

#[derive(Debug, Serialize)]
struct JsonRpcNotification<T: Serialize> {
    jsonrpc: &'static str,
    method: String,
    params: T,
}

#[derive(Debug, Serialize)]
struct JsonRpcErrorResponse {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ValidateParams {
    content: String,
}

#[derive(Debug, Deserialize)]
struct FormatParams {
    content: String,
}

#[derive(Debug, Deserialize)]
struct DaemonCodegenParams {
    content: String,
    existing_controller: Option<String>,
    target_language: Option<String>,
    target_framework: Option<String>,
}

#[derive(Debug, Serialize)]
struct DaemonCodegenResult {
    ui_generated_code: String,
    controller_code: String,
    diagnostics: Vec<CodegenDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ui_generated_filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    controller_filename: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    auxiliary_files: Vec<GeneratedFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    framework_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DaemonExportCodeParams {
    content: String,
    output_dir: String,
    rux_path: Option<String>,
    target_language: Option<String>,
    target_framework: Option<String>,
}

#[derive(Debug, Serialize)]
struct DaemonExportCodeResult {
    ui_generated_path: String,
    controller_path: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    auxiliary_paths: Vec<String>,
    diagnostics: Vec<CodegenDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_framework: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    framework_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DaemonWatchParams {
    watch_dir: String,
    rux_path: Option<String>,
    target_framework: Option<String>,
}

#[derive(Debug, Serialize)]
struct DaemonWatchResult {
    watching: bool,
    watch_dir: String,
    monitored_files: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DaemonUnwatchParams {
    watch_dir: String,
}

#[derive(Debug, Serialize)]
struct DaemonUnwatchResult {
    unwatched: bool,
    watch_dir: String,
}

#[derive(Debug, Deserialize)]
struct DaemonReverseParseParams {
    content: String,
    code: String,
    target_framework: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DaemonImportFigmaParams {
    figma_token: String,
    file_key: String,
    node_id: Option<String>,
    project_dir: Option<String>,
}

#[derive(Debug, Serialize)]
struct DaemonImportFigmaResult {
    document: RuxDocument,
    imported_node_count: usize,
    assets_downloaded: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
struct DaemonReverseParseResult {
    document: RuxDocument,
    patches_count: usize,
    patches: Vec<PropertyPatch>,
}

#[derive(Debug, Serialize)]
struct AstPatchedNotificationParams {
    document: RuxDocument,
    #[serde(skip_serializing_if = "Option::is_none")]
    rux_path: Option<String>,
    changed_file: String,
    timestamp: u64,
    patches_count: usize,
    patches: Vec<PropertyPatch>,
}

#[derive(Debug, Serialize)]
struct DaemonValidationError {
    message: String,
    code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    column: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    node_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct DaemonValidationResult {
    valid: BooleanType,
    errors: Vec<DaemonValidationError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    document: Option<RuxDocument>,
}

type BooleanType = bool;

#[derive(Debug, Serialize)]
struct DaemonVersionResult {
    version: &'static str,
    protocol_version: &'static str,
}

#[derive(Debug, Serialize)]
struct DaemonFormatResult {
    formatted: String,
}

#[derive(Debug, Clone)]
struct WatchTargetState {
    #[allow(dead_code)]
    watch_dir: PathBuf,
    rux_path: Option<PathBuf>,
    framework: TargetFramework,
}

struct AppContext {
    watcher: Mutex<Option<DebouncedFileWatcher>>,
    watch_targets: Mutex<HashMap<PathBuf, WatchTargetState>>,
    stdout_lock: Arc<Mutex<io::Stdout>>,
    wasm_compiler: Arc<WasmCompiler>,
}

impl AppContext {
    fn new(stdout_lock: Arc<Mutex<io::Stdout>>) -> Arc<Self> {
        let wasm_compiler = Arc::new(WasmCompiler::new().expect("Wasm compiler server init"));
        Arc::new(Self {
            watcher: Mutex::new(None),
            watch_targets: Mutex::new(HashMap::new()),
            stdout_lock,
            wasm_compiler,
        })
    }

    fn ensure_watcher(self: &Arc<Self>) -> Result<(), (i32, String)> {
        let mut watcher_guard = self
            .watcher
            .lock()
            .map_err(|e| (-32603, format!("Lock error: {}", e)))?;

        if watcher_guard.is_none() {
            let ctx_clone = Arc::clone(self);
            let created = DebouncedFileWatcher::new(Duration::from_millis(350), move |event| {
                ctx_clone.handle_settled_file(event);
            })
            .map_err(|e| (-32603, format!("Failed to initialize file watcher: {}", e)))?;

            *watcher_guard = Some(created);
        }

        Ok(())
    }

    fn handle_settled_file(&self, event: SettledFileEvent) {
        if event.filename != "ui_generated.rs" {
            return;
        }

        let code = match fs::read_to_string(&event.path) {
            Ok(c) => c,
            Err(_) => return,
        };

        let file_dir = event.path.parent().unwrap_or_else(|| Path::new(""));

        let targets = match self.watch_targets.lock() {
            Ok(t) => t.clone(),
            Err(_) => return,
        };

        let matched_target = targets.iter().find(|(watch_dir, _)| {
            if let (Ok(can_event_dir), Ok(can_watch)) =
                (file_dir.canonicalize(), watch_dir.canonicalize())
            {
                can_event_dir == can_watch
            } else {
                file_dir == watch_dir.as_path()
            }
        });

        let (rux_path_opt, framework) = if let Some((_, target_state)) = matched_target {
            (target_state.rux_path.clone(), target_state.framework)
        } else {
            let candidate_rux = find_rux_in_dir(file_dir);
            (candidate_rux, TargetFramework::Iced)
        };

        let resolved_rux_path = match rux_path_opt {
            Some(p) => p,
            None => return,
        };

        let rux_content = match fs::read_to_string(&resolved_rux_path) {
            Ok(c) => c,
            Err(_) => return,
        };

        let mut doc = match RuxDocument::from_json(&rux_content) {
            Ok(d) => d,
            Err(_) => return,
        };

        let report = match ReverseParser::patch_document(&mut doc, &code, Some(framework)) {
            Ok(r) => r,
            Err(_) => return,
        };

        if report.patched_nodes_count > 0 {
            if let Ok(updated_json) = serde_json::to_string_pretty(&doc) {
                let _ = fs::write(&resolved_rux_path, updated_json);
            }

            let notif_params = AstPatchedNotificationParams {
                document: doc,
                rux_path: Some(resolved_rux_path.to_string_lossy().to_string()),
                changed_file: event.filename,
                timestamp: event.timestamp_millis,
                patches_count: report.patched_nodes_count,
                patches: report.patches,
            };

            let notif = JsonRpcNotification {
                jsonrpc: "2.0",
                method: "rux/astPatchedFromCode".to_string(),
                params: notif_params,
            };

            if let Ok(serialized) = serde_json::to_string(&notif) {
                if let Ok(mut out) = self.stdout_lock.lock() {
                    let _ = writeln!(out, "{}", serialized);
                    let _ = out.flush();
                }
            }
        }
    }
}

fn find_rux_in_dir(dir: &Path) -> Option<PathBuf> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|ext| ext.to_str()) == Some("rux") {
                return Some(p);
            }
        }
    }

    if let Some(parent) = dir.parent() {
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|ext| ext.to_str()) == Some("rux") {
                    return Some(p);
                }
            }
        }
    }

    None
}

fn resolve_target_framework(
    target_framework: Option<&str>,
    target_language: Option<&str>,
) -> TargetFramework {
    if let Some(tf) = target_framework {
        if let Some(parsed) = TargetFramework::from_str_loose(tf) {
            return parsed;
        }
    }
    if let Some(tl) = target_language {
        if let Some(parsed) = TargetFramework::from_str_loose(tl) {
            return parsed;
        }
    }
    TargetFramework::Iced
}

fn handle_validate(params: Option<Value>) -> Result<DaemonValidationResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/validate".to_string()))?;
    let validate_params: ValidateParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/validate: {}", e)))?;

    if validate_params.content.trim().is_empty() {
        return Ok(DaemonValidationResult {
            valid: true,
            errors: Vec::new(),
            document: Some(RuxDocument::default()),
        });
    }

    let validator = DocumentValidator::new();
    match validator.validate_json(&validate_params.content) {
        Ok(doc) => Ok(DaemonValidationResult {
            valid: true,
            errors: Vec::new(),
            document: Some(doc),
        }),
        Err(validation_errors) => {
            let errors = validation_errors
                .into_iter()
                .map(|err| DaemonValidationError {
                    message: err.to_string(),
                    code: "VALIDATION_ERROR".to_string(),
                    line: None,
                    column: None,
                    node_id: None,
                })
                .collect();
            Ok(DaemonValidationResult {
                valid: false,
                errors,
                document: None,
            })
        }
    }
}

fn handle_format(params: Option<Value>) -> Result<DaemonFormatResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/format".to_string()))?;
    let format_params: FormatParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/format: {}", e)))?;

    if format_params.content.trim().is_empty() {
        let default_doc = RuxDocument::default();
        let formatted = serde_json::to_string_pretty(&default_doc)
            .unwrap_or_else(|_| "{}".to_string());
        return Ok(DaemonFormatResult { formatted });
    }

    let parsed_value: Value = serde_json::from_str(&format_params.content)
        .map_err(|e| (-32602, format!("Invalid JSON content for format: {}", e)))?;

    let formatted = serde_json::to_string_pretty(&parsed_value)
        .map_err(|e| (-32603, format!("Failed to format JSON: {}", e)))?;

    Ok(DaemonFormatResult { formatted })
}

fn handle_codegen(params: Option<Value>) -> Result<DaemonCodegenResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/codegen".to_string()))?;
    let codegen_params: DaemonCodegenParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/codegen: {}", e)))?;

    let doc = RuxDocument::from_json(&codegen_params.content)
        .map_err(|e| (-32602, format!("Invalid RUX document JSON: {}", e)))?;

    let framework = resolve_target_framework(
        codegen_params.target_framework.as_deref(),
        codegen_params.target_language.as_deref(),
    );

    let registry = PluginRegistry::new();
    let options = CodegenOptions::default();
    let output = registry
        .generate(
            framework,
            &doc,
            codegen_params.existing_controller.as_deref(),
            &options,
        )
        .map_err(|e| (-32603, format!("Codegen error: {}", e)))?;

    Ok(DaemonCodegenResult {
        ui_generated_code: output.ui_generated_code,
        controller_code: output.controller_code,
        diagnostics: output.diagnostics,
        target_language: Some(framework.language().to_string()),
        target_framework: Some(framework.id().to_string()),
        ui_generated_filename: Some(output.ui_generated_filename),
        controller_filename: Some(output.controller_filename),
        auxiliary_files: output.auxiliary_files,
        framework_version: Some(output.framework_version),
    })
}

fn handle_export_code(
    ctx: &Arc<AppContext>,
    params: Option<Value>,
) -> Result<DaemonExportCodeResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/exportCode".to_string()))?;
    let export_params: DaemonExportCodeParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/exportCode: {}", e)))?;

    let doc = RuxDocument::from_json(&export_params.content)
        .map_err(|e| (-32602, format!("Invalid RUX document JSON: {}", e)))?;

    let out_dir = Path::new(&export_params.output_dir);
    if !out_dir.exists() {
        fs::create_dir_all(out_dir)
            .map_err(|e| (-32603, format!("Failed to create output dir: {}", e)))?;
    }

    let framework = resolve_target_framework(
        export_params.target_framework.as_deref(),
        export_params.target_language.as_deref(),
    );

    let ctrl_filename = framework.default_controller_filename();
    let controller_path = out_dir.join(ctrl_filename);

    let existing_controller = if controller_path.exists() {
        fs::read_to_string(&controller_path).ok()
    } else {
        None
    };

    let registry = PluginRegistry::new();
    let options = CodegenOptions::default();
    let output = registry
        .generate(
            framework,
            &doc,
            existing_controller.as_deref(),
            &options,
        )
        .map_err(|e| (-32603, format!("Codegen error: {}", e)))?;

    let ui_generated_path = out_dir.join(&output.ui_generated_filename);
    let controller_path = out_dir.join(&output.controller_filename);

    fs::write(&ui_generated_path, &output.ui_generated_code)
        .map_err(|e| (-32603, format!("Failed to write {}: {}", output.ui_generated_filename, e)))?;

    fs::write(&controller_path, &output.controller_code)
        .map_err(|e| (-32603, format!("Failed to write {}: {}", output.controller_filename, e)))?;

    let mut auxiliary_paths = Vec::new();
    for aux in &output.auxiliary_files {
        let aux_path = out_dir.join(&aux.filename);
        fs::write(&aux_path, &aux.content)
            .map_err(|e| (-32603, format!("Failed to write {}: {}", aux.filename, e)))?;
        auxiliary_paths.push(aux_path.to_string_lossy().to_string());
    }

    if let Ok(()) = ctx.ensure_watcher() {
        if let Ok(mut watcher_opt) = ctx.watcher.lock() {
            if let Some(ref mut w) = *watcher_opt {
                let _ = w.watch_dir(out_dir);
            }
        }
        if let Ok(mut targets) = ctx.watch_targets.lock() {
            targets.insert(
                out_dir.to_path_buf(),
                WatchTargetState {
                    watch_dir: out_dir.to_path_buf(),
                    rux_path: export_params.rux_path.map(PathBuf::from),
                    framework,
                },
            );
        }
    }

    Ok(DaemonExportCodeResult {
        ui_generated_path: ui_generated_path.to_string_lossy().to_string(),
        controller_path: controller_path.to_string_lossy().to_string(),
        auxiliary_paths,
        diagnostics: output.diagnostics,
        target_language: Some(framework.language().to_string()),
        target_framework: Some(framework.id().to_string()),
        framework_version: Some(output.framework_version),
    })
}

fn handle_watch_target(
    ctx: &Arc<AppContext>,
    params: Option<Value>,
) -> Result<DaemonWatchResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/watchTarget".to_string()))?;
    let watch_params: DaemonWatchParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/watchTarget: {}", e)))?;

    ctx.ensure_watcher()?;

    let watch_path = PathBuf::from(&watch_params.watch_dir);
    if !watch_path.exists() {
        return Err((-32602, format!("Directory '{}' does not exist", watch_params.watch_dir)));
    }

    let framework = resolve_target_framework(watch_params.target_framework.as_deref(), None);

    let mut watcher_opt = ctx
        .watcher
        .lock()
        .map_err(|e| (-32603, format!("Lock error: {}", e)))?;

    if let Some(ref mut w) = *watcher_opt {
        w.watch_dir(&watch_path)
            .map_err(|e| (-32603, format!("Watcher error: {}", e)))?;
    }

    let mut targets = ctx
        .watch_targets
        .lock()
        .map_err(|e| (-32603, format!("Lock error: {}", e)))?;

    targets.insert(
        watch_path.clone(),
        WatchTargetState {
            watch_dir: watch_path.clone(),
            rux_path: watch_params.rux_path.map(PathBuf::from),
            framework,
        },
    );

    Ok(DaemonWatchResult {
        watching: true,
        watch_dir: watch_params.watch_dir,
        monitored_files: vec![
            "ui_generated.rs".to_string(),
            "controller.rs".to_string(),
            "ui_generated.go".to_string(),
            "controller.go".to_string(),
            "ui_generated.py".to_string(),
            "controller.py".to_string(),
            "ui_generated.slint".to_string(),
        ],
    })
}

fn handle_unwatch_target(
    ctx: &Arc<AppContext>,
    params: Option<Value>,
) -> Result<DaemonUnwatchResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/unwatchTarget".to_string()))?;
    let unwatch_params: DaemonUnwatchParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/unwatchTarget: {}", e)))?;

    let watch_path = PathBuf::from(&unwatch_params.watch_dir);

    let mut watcher_opt = ctx
        .watcher
        .lock()
        .map_err(|e| (-32603, format!("Lock error: {}", e)))?;

    if let Some(ref mut w) = *watcher_opt {
        let _ = w.unwatch_dir(&watch_path);
    }

    let mut targets = ctx
        .watch_targets
        .lock()
        .map_err(|e| (-32603, format!("Lock error: {}", e)))?;

    targets.remove(&watch_path);

    Ok(DaemonUnwatchResult {
        unwatched: true,
        watch_dir: unwatch_params.watch_dir,
    })
}

fn handle_reverse_parse(
    params: Option<Value>,
) -> Result<DaemonReverseParseResult, (i32, String)> {
    let raw_params =
        params.ok_or((-32602, "Missing params for rux/reverseParse".to_string()))?;
    let parse_params: DaemonReverseParseParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/reverseParse: {}", e)))?;

    let mut doc = RuxDocument::from_json(&parse_params.content)
        .map_err(|e| (-32602, format!("Invalid RUX document JSON: {}", e)))?;

    let framework = parse_params
        .target_framework
        .as_deref()
        .and_then(TargetFramework::from_str_loose);

    let report = ReverseParser::patch_document(&mut doc, &parse_params.code, framework)
        .map_err(|e| (-32603, format!("Reverse parsing error: {}", e)))?;

    Ok(DaemonReverseParseResult {
        document: doc,
        patches_count: report.patched_nodes_count,
        patches: report.patches,
    })
}

fn handle_import_figma(
    params: Option<Value>,
) -> Result<DaemonImportFigmaResult, (i32, String)> {
    let raw_params =
        params.ok_or((-32602, "Missing params for rux/importFigma".to_string()))?;
    let import_params: DaemonImportFigmaParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/importFigma: {}", e)))?;

    let engine = rux_figma::FigmaEngine::new();
    let project_dir_buf = import_params.project_dir.as_deref().map(PathBuf::from);

    let result = engine
        .import(rux_figma::FigmaImportEngineParams {
            token: import_params.figma_token,
            file_key_or_url: &import_params.file_key,
            node_id: import_params.node_id.as_deref(),
            project_dir: project_dir_buf.as_deref(),
            custom_transport: None,
        })
        .map_err(|e| (-32603, format!("Figma import failed: {}", e)))?;

    Ok(DaemonImportFigmaResult {
        document: result.document,
        imported_node_count: result.imported_node_count,
        assets_downloaded: result.assets_downloaded,
        warnings: result.warnings,
    })
}

#[derive(Debug, Deserialize)]
struct DaemonCompileWasmParams {
    content: String,
    target_framework: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ImportAssetParams {
    workspace_path: String,
    asset_name: String,
    asset_type: String,
    data_base64: Option<String>,
    source_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct ImportAssetResult {
    relative_path: String,
    full_path: String,
    asset_type: String,
    alias: String,
}

fn handle_compile_wasm(
    ctx: &Arc<AppContext>,
    params: Option<Value>,
) -> Result<WasmBuildResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/compileWasm".to_string()))?;
    let compile_params: DaemonCompileWasmParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/compileWasm: {}", e)))?;

    let doc = RuxDocument::from_json(&compile_params.content)
        .map_err(|e| (-32602, format!("Invalid RUX document JSON: {}", e)))?;

    let res = ctx
        .wasm_compiler
        .compile(&doc, compile_params.target_framework.as_deref());
    Ok(res)
}

fn handle_get_wasm_preview_status(
    ctx: &Arc<AppContext>,
) -> Result<WasmPreviewStatus, (i32, String)> {
    Ok(ctx.wasm_compiler.status())
}

fn decode_base64_simple(input: &str) -> Option<Vec<u8>> {
    let clean: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for b in clean.bytes() {
        if b == b'=' {
            break;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

fn handle_import_asset(
    params: Option<Value>,
) -> Result<ImportAssetResult, (i32, String)> {
    let raw_params = params.ok_or((-32602, "Missing params for rux/importAsset".to_string()))?;
    let import_params: ImportAssetParams = serde_json::from_value(raw_params)
        .map_err(|e| (-32602, format!("Invalid params for rux/importAsset: {}", e)))?;

    let workspace_path = PathBuf::from(&import_params.workspace_path);
    let assets_dir = workspace_path.join("assets");
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir)
            .map_err(|e| (-32603, format!("Failed to create assets directory: {}", e)))?;
    }

    let target_file_path = assets_dir.join(&import_params.asset_name);

    if let Some(src) = &import_params.source_path {
        let src_path = PathBuf::from(src);
        if src_path.exists() {
            fs::copy(&src_path, &target_file_path)
                .map_err(|e| (-32603, format!("Failed to copy asset file: {}", e)))?;
        } else {
            return Err((-32602, format!("Source asset file '{}' not found", src)));
        }
    } else if let Some(b64) = &import_params.data_base64 {
        let bytes = decode_base64_simple(b64)
            .ok_or((-32602, "Failed to decode base64 asset payload".to_string()))?;
        fs::write(&target_file_path, bytes)
            .map_err(|e| (-32603, format!("Failed to write asset file: {}", e)))?;
    } else {
        return Err((-32602, "Neither source_path nor data_base64 provided".to_string()));
    }

    let alias = import_params
        .asset_name
        .split('.')
        .next()
        .unwrap_or(&import_params.asset_name)
        .to_string();

    Ok(ImportAssetResult {
        relative_path: format!("assets/{}", import_params.asset_name),
        full_path: target_file_path.to_string_lossy().to_string(),
        asset_type: import_params.asset_type,
        alias,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonFrameworkSyncItem {
    pub id: String,
    pub name: String,
    pub repo: String,
    pub current_version: String,
    pub target_crate: String,
    pub status: String,
    pub last_checked: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonAutopatchReport {
    pub framework_id: String,
    pub from_version: String,
    pub to_version: String,
    pub timestamp: String,
    pub status: String,
    pub attempts: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonFrameworkSyncStatusResult {
    pub frameworks: Vec<DaemonFrameworkSyncItem>,
    pub last_sync: String,
    pub recent_reports: Vec<DaemonAutopatchReport>,
}

fn handle_get_framework_sync_status() -> Result<DaemonFrameworkSyncStatusResult, (i32, String)> {
    let mut config_path = PathBuf::from("framework_versions.json");
    if !config_path.exists() {
        if let Ok(current_dir) = env::current_dir() {
            let candidate = current_dir.join("framework_versions.json");
            if candidate.exists() {
                config_path = candidate;
            } else if let Some(parent) = current_dir.parent() {
                let parent_candidate = parent.join("framework_versions.json");
                if parent_candidate.exists() {
                    config_path = parent_candidate;
                }
            }
        }
    }

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                let mut frameworks = Vec::new();
                if let Some(map) = val.get("frameworks").and_then(|v| v.as_object()) {
                    for (id, meta) in map {
                        let name = match id.as_str() {
                            "iced" => "Iced (Rust)",
                            "egui" => "egui (Rust)",
                            "slint" => "Slint (Rust)",
                            "dioxus" => "Dioxus (Rust)",
                            "fyne" => "Go (Fyne)",
                            "flet" => "Python (Flet)",
                            _ => id.as_str(),
                        };
                        frameworks.push(DaemonFrameworkSyncItem {
                            id: id.clone(),
                            name: name.to_string(),
                            repo: meta.get("repo").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            current_version: meta.get("current_version").and_then(|v| v.as_str()).unwrap_or("0.0.0").to_string(),
                            target_crate: meta.get("target_crate").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            status: "synced".to_string(),
                            last_checked: meta.get("last_checked").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        });
                    }
                }
                frameworks.sort_by(|a, b| a.id.cmp(&b.id));

                let last_sync = val.get("last_sync").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let mut recent_reports = Vec::new();
                if let Some(reports_arr) = val.get("recent_reports").and_then(|v| v.as_array()) {
                    for rep in reports_arr {
                        if let Ok(r) = serde_json::from_value::<DaemonAutopatchReport>(rep.clone()) {
                            recent_reports.push(r);
                        }
                    }
                }

                return Ok(DaemonFrameworkSyncStatusResult {
                    frameworks,
                    last_sync,
                    recent_reports,
                });
            }
        }
    }

    let defaults = vec![
        DaemonFrameworkSyncItem {
            id: "iced".to_string(),
            name: "Iced (Rust)".to_string(),
            repo: "iced-rs/iced".to_string(),
            current_version: "0.13.1".to_string(),
            target_crate: "iced".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
        DaemonFrameworkSyncItem {
            id: "egui".to_string(),
            name: "egui (Rust)".to_string(),
            repo: "emilk/egui".to_string(),
            current_version: "0.29.1".to_string(),
            target_crate: "egui".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
        DaemonFrameworkSyncItem {
            id: "slint".to_string(),
            name: "Slint (Rust)".to_string(),
            repo: "slint-ui/slint".to_string(),
            current_version: "1.8.0".to_string(),
            target_crate: "slint".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
        DaemonFrameworkSyncItem {
            id: "dioxus".to_string(),
            name: "Dioxus (Rust)".to_string(),
            repo: "DioxusLabs/dioxus".to_string(),
            current_version: "0.5.6".to_string(),
            target_crate: "dioxus".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
        DaemonFrameworkSyncItem {
            id: "fyne".to_string(),
            name: "Go (Fyne)".to_string(),
            repo: "fyne-io/fyne".to_string(),
            current_version: "v2.5.0".to_string(),
            target_crate: "fyne".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
        DaemonFrameworkSyncItem {
            id: "flet".to_string(),
            name: "Python (Flet)".to_string(),
            repo: "flet-dev/flet".to_string(),
            current_version: "0.24.1".to_string(),
            target_crate: "flet".to_string(),
            status: "synced".to_string(),
            last_checked: "2026-11-05T00:00:00Z".to_string(),
        },
    ];

    Ok(DaemonFrameworkSyncStatusResult {
        frameworks: defaults,
        last_sync: "2026-11-05T00:00:00Z".to_string(),
        recent_reports: Vec::new(),
    })
}

fn process_json_rpc_line(ctx: &Arc<AppContext>, line: &str) -> Option<String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let request: JsonRpcRequest = match serde_json::from_str(trimmed) {
        Ok(req) => req,
        Err(err) => {
            let error_resp: JsonRpcResponse<Value> = JsonRpcResponse {
                jsonrpc: "2.0",
                id: Value::Null,
                result: None,
                error: Some(JsonRpcErrorResponse {
                    code: -32700,
                    message: format!("Parse error: {}", err),
                    data: None,
                }),
            };
            return serde_json::to_string(&error_resp).ok();
        }
    };

    let request_id = request.id.unwrap_or(Value::Null);

    let response_json = match request.method.as_str() {
        "rux/ping" => {
            let resp = JsonRpcResponse {
                jsonrpc: "2.0",
                id: request_id,
                result: Some("pong"),
                error: None,
            };
            serde_json::to_string(&resp).ok()
        }
        "rux/version" => {
            let result = DaemonVersionResult {
                version: "0.1.0",
                protocol_version: "2.0",
            };
            let resp = JsonRpcResponse {
                jsonrpc: "2.0",
                id: request_id,
                result: Some(result),
                error: None,
            };
            serde_json::to_string(&resp).ok()
        }
        "rux/validate" => match handle_validate(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/format" => match handle_format(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/codegen" => match handle_codegen(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/exportCode" => match handle_export_code(ctx, request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/watchTarget" => match handle_watch_target(ctx, request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/unwatchTarget" => match handle_unwatch_target(ctx, request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/reverseParse" => match handle_reverse_parse(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/importFigma" => match handle_import_figma(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/compileWasm" => match handle_compile_wasm(ctx, request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/getWasmPreviewStatus" => match handle_get_wasm_preview_status(ctx) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/importAsset" => match handle_import_asset(request.params) {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        "rux/getFrameworkSyncStatus" => match handle_get_framework_sync_status() {
            Ok(result) => {
                let resp = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: Some(result),
                    error: None,
                };
                serde_json::to_string(&resp).ok()
            }
            Err((code, message)) => {
                let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                    jsonrpc: "2.0",
                    id: request_id,
                    result: None,
                    error: Some(JsonRpcErrorResponse {
                        code,
                        message,
                        data: None,
                    }),
                };
                serde_json::to_string(&resp).ok()
            }
        },
        unknown_method => {
            let resp: JsonRpcResponse<Value> = JsonRpcResponse {
                jsonrpc: "2.0",
                id: request_id,
                result: None,
                error: Some(JsonRpcErrorResponse {
                    code: -32601,
                    message: format!("Method not found: {}", unknown_method),
                    data: None,
                }),
            };
            serde_json::to_string(&resp).ok()
        }
    };

    response_json
}

fn run_stdio_loop() {
    let stdin = io::stdin();
    let stdout_lock = Arc::new(Mutex::new(io::stdout()));
    let ctx = AppContext::new(Arc::clone(&stdout_lock));

    for line_result in stdin.lock().lines() {
        match line_result {
            Ok(line) => {
                if let Some(response_str) = process_json_rpc_line(&ctx, &line) {
                    if let Ok(mut out) = stdout_lock.lock() {
                        let _ = writeln!(out, "{}", response_str);
                        let _ = out.flush();
                    }
                }
            }
            Err(err) => {
                eprintln!("Error reading from stdin: {}", err);
                break;
            }
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 || args[1] == "--stdio" {
        run_stdio_loop();
        return;
    }

    match args[1].as_str() {
        "validate" => {
            if args.len() < 3 {
                eprintln!("Usage: rux-daemon validate <path-to-rux-file>");
                process::exit(1);
            }
            let file_path = &args[2];
            let content = match fs::read_to_string(file_path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Failed to read file '{}': {}", file_path, e);
                    process::exit(1);
                }
            };

            let validator = DocumentValidator::new();
            match validator.validate_json(&content) {
                Ok(doc) => {
                    println!(
                        "Document '{}' is valid. Root widget: '{}'",
                        doc.metadata.app_name, doc.root.id
                    );
                }
                Err(errors) => {
                    eprintln!("Validation failed with {} errors:", errors.len());
                    for err in errors {
                        eprintln!("  - {}", err);
                    }
                    process::exit(2);
                }
            }
        }
        "generate" => {
            let mut input_file: Option<String> = None;
            let mut out_dir_str: Option<String> = None;
            let mut framework_str: Option<String> = None;

            let mut idx = 2;
            while idx < args.len() {
                if args[idx] == "--out-dir" && idx + 1 < args.len() {
                    out_dir_str = Some(args[idx + 1].clone());
                    idx += 2;
                } else if args[idx] == "--framework" && idx + 1 < args.len() {
                    framework_str = Some(args[idx + 1].clone());
                    idx += 2;
                } else if input_file.is_none() {
                    input_file = Some(args[idx].clone());
                    idx += 1;
                } else {
                    idx += 1;
                }
            }

            let input_file = match input_file {
                Some(f) => f,
                None => {
                    eprintln!("Usage: rux-daemon generate <input.rux> [--framework <framework>] --out-dir <dir>");
                    process::exit(1);
                }
            };

            let out_dir_str = match out_dir_str {
                Some(d) => d,
                None => {
                    eprintln!("Usage: rux-daemon generate <input.rux> [--framework <framework>] --out-dir <dir>");
                    process::exit(1);
                }
            };

            let framework = resolve_target_framework(framework_str.as_deref(), None);

            let content = match fs::read_to_string(&input_file) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("Failed to read input file '{}': {}", input_file, e);
                    process::exit(1);
                }
            };

            let doc = match RuxDocument::from_json(&content) {
                Ok(d) => d,
                Err(e) => {
                    eprintln!("Failed to parse RUX JSON: {}", e);
                    process::exit(1);
                }
            };

            let out_dir = Path::new(&out_dir_str);
            if !out_dir.exists() {
                if let Err(e) = fs::create_dir_all(out_dir) {
                    eprintln!("Failed to create out-dir: {}", e);
                    process::exit(1);
                }
            }

            let controller_path = out_dir.join(framework.default_controller_filename());
            let existing_controller = if controller_path.exists() {
                fs::read_to_string(&controller_path).ok()
            } else {
                None
            };

            let registry = PluginRegistry::new();
            let options = CodegenOptions::default();
            let result = match registry.generate(framework, &doc, existing_controller.as_deref(), &options) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("Code generation failed: {}", e);
                    process::exit(1);
                }
            };

            let ui_generated_path = out_dir.join(&result.ui_generated_filename);
            let controller_path = out_dir.join(&result.controller_filename);

            if let Err(e) = fs::write(&ui_generated_path, &result.ui_generated_code) {
                eprintln!("Failed to write {}: {}", result.ui_generated_filename, e);
                process::exit(1);
            }

            if let Err(e) = fs::write(&controller_path, &result.controller_code) {
                eprintln!("Failed to write {}: {}", result.controller_filename, e);
                process::exit(1);
            }

            for aux in &result.auxiliary_files {
                let aux_path = out_dir.join(&aux.filename);
                if let Err(e) = fs::write(&aux_path, &aux.content) {
                    eprintln!("Failed to write auxiliary file {}: {}", aux.filename, e);
                    process::exit(1);
                }
            }

            println!(
                "Successfully generated (Framework: {} {}):\n  - {}\n  - {}",
                framework.display_name(),
                framework.version(),
                ui_generated_path.display(),
                controller_path.display()
            );
            for aux in &result.auxiliary_files {
                println!("  - {}", out_dir.join(&aux.filename).display());
            }
        }
        "watch" => {
            if args.len() < 3 {
                eprintln!("Usage: rux-daemon watch <dir> [--rux <input.rux>] [--framework <framework>]");
                process::exit(1);
            }
            let watch_dir_str = &args[2];
            let mut rux_path_str: Option<String> = None;
            let mut framework_str: Option<String> = None;

            let mut idx = 3;
            while idx < args.len() {
                if args[idx] == "--rux" && idx + 1 < args.len() {
                    rux_path_str = Some(args[idx + 1].clone());
                    idx += 2;
                } else if args[idx] == "--framework" && idx + 1 < args.len() {
                    framework_str = Some(args[idx + 1].clone());
                    idx += 2;
                } else {
                    idx += 1;
                }
            }

            let framework = resolve_target_framework(framework_str.as_deref(), None);
            let stdout_lock = Arc::new(Mutex::new(io::stdout()));
            let ctx = AppContext::new(stdout_lock);

            let watch_path = PathBuf::from(watch_dir_str);
            if !watch_path.exists() {
                eprintln!("Watch directory '{}' does not exist", watch_dir_str);
                process::exit(1);
            }

            if let Err(e) = ctx.ensure_watcher() {
                eprintln!("Failed to initialize watcher: {}", e.1);
                process::exit(1);
            }

            let mut watcher_opt = ctx.watcher.lock().unwrap();
            if let Some(ref mut w) = *watcher_opt {
                if let Err(e) = w.watch_dir(&watch_path) {
                    eprintln!("Failed to watch directory: {}", e);
                    process::exit(1);
                }
            }

            let mut targets = ctx.watch_targets.lock().unwrap();
            targets.insert(
                watch_path.clone(),
                WatchTargetState {
                    watch_dir: watch_path,
                    rux_path: rux_path_str.map(PathBuf::from),
                    framework,
                },
            );

            println!("Monitoring '{}' for two-way synchronization...", watch_dir_str);

            loop {
                thread::sleep(Duration::from_secs(1));
            }
        }
        "version" => {
            println!("rux-daemon 0.1.0");
        }
        cmd => {
            eprintln!("Unknown command: {}", cmd);
            process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_context() -> Arc<AppContext> {
        let stdout_lock = Arc::new(Mutex::new(io::stdout()));
        AppContext::new(stdout_lock)
    }

    #[test]
    fn test_ping_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":1,"method":"rux/ping"}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["result"], "pong");
    }

    #[test]
    fn test_version_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":2,"method":"rux/version"}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["result"]["version"], "0.1.0");
    }

    #[test]
    fn test_validate_empty_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":3,"method":"rux/validate","params":{"content":""}}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["result"]["valid"], true);
        assert!(val["result"]["errors"].as_array().expect("array").is_empty());
    }

    #[test]
    fn test_validate_valid_json_rpc() {
        let ctx = create_test_context();
        let sample = include_str!("../../../examples/sample_app.rux");
        let params = serde_json::json!({ "content": sample });
        let req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "rux/validate",
            "params": params
        });
        let response = process_json_rpc_line(&ctx, &req.to_string()).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["result"]["valid"], true);
    }

    #[test]
    fn test_validate_invalid_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":5,"method":"rux/validate","params":{"content":"{ invalid json"}}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["result"]["valid"], false);
        assert!(!val["result"]["errors"].as_array().expect("array").is_empty());
    }

    #[test]
    fn test_format_empty_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":6,"method":"rux/format","params":{"content":""}}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert!(val["result"]["formatted"].as_str().expect("string").contains("schema_version"));
    }

    #[test]
    fn test_framework_sync_status_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":7,"method":"rux/getFrameworkSyncStatus"}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        let frameworks = val["result"]["frameworks"].as_array().expect("frameworks array");
        assert_eq!(frameworks.len(), 6);
    }

    #[test]
    fn test_unknown_method_json_rpc() {
        let ctx = create_test_context();
        let request = r#"{"jsonrpc":"2.0","id":8,"method":"rux/nonExistent"}"#;
        let response = process_json_rpc_line(&ctx, request).expect("response");
        let val: Value = serde_json::from_str(&response).expect("valid json");
        assert_eq!(val["error"]["code"], -32601);
    }
}
