import type { RuxDocument } from "./document";
import type { TargetFramework } from "./metadata";

export interface DaemonValidationError {
    readonly message: string;
    readonly code: string;
    readonly line?: number;
    readonly column?: number;
    readonly nodeId?: string;
}

export interface DaemonValidationResult {
    readonly valid: boolean;
    readonly errors: readonly DaemonValidationError[];
    readonly document?: RuxDocument;
}

export type DaemonStatus = "connected" | "disconnected" | "validating" | "error";

export type ViewMode = "scene_builder" | "text";

export interface BreadcrumbItem {
    readonly id: string;
    readonly widgetType: string;
    readonly name?: string;
}

export interface NodePatch {
    readonly nodeId: string;
    readonly path: readonly string[];
    readonly value: unknown;
}

export interface CodegenDiagnostic {
    readonly level: string;
    readonly message: string;
    readonly widget_id?: string;
}

export type TargetLanguage = "rust" | "go" | "python";

export { TargetFramework };

export interface GeneratedFile {
    readonly filename: string;
    readonly content: string;
    readonly file_type: string;
}

export interface DaemonCodegenParams {
    readonly content: string;
    readonly existing_controller?: string;
    readonly target_language?: TargetLanguage;
    readonly target_framework?: TargetFramework;
}

export interface DaemonCodegenResult {
    readonly ui_generated_code: string;
    readonly controller_code: string;
    readonly ui_generated_filename?: string;
    readonly controller_filename?: string;
    readonly auxiliary_files?: readonly GeneratedFile[];
    readonly diagnostics: readonly CodegenDiagnostic[];
    readonly target_language?: TargetLanguage;
    readonly target_framework?: TargetFramework;
    readonly framework_version?: string;
}

export interface DaemonExportCodeParams {
    readonly content: string;
    readonly output_dir: string;
    readonly rux_path?: string;
    readonly target_language?: TargetLanguage;
    readonly target_framework?: TargetFramework;
}

export interface DaemonExportCodeResult {
    readonly ui_generated_path: string;
    readonly controller_path: string;
    readonly auxiliary_paths?: readonly string[];
    readonly diagnostics: readonly CodegenDiagnostic[];
    readonly target_language?: TargetLanguage;
    readonly target_framework?: TargetFramework;
    readonly framework_version?: string;
}

export interface FrameworkSyncItem {
    readonly id: string;
    readonly name: string;
    readonly repo: string;
    readonly current_version: string;
    readonly target_crate: string;
    readonly status: string;
    readonly last_checked: string;
}

export interface AutopatchReport {
    readonly framework_id: string;
    readonly from_version: string;
    readonly to_version: string;
    readonly timestamp: string;
    readonly status: string;
    readonly attempts: number;
    readonly error_message?: string;
}

export interface DaemonFrameworkSyncStatusResult {
    readonly frameworks: readonly FrameworkSyncItem[];
    readonly last_sync: string;
    readonly recent_reports: readonly AutopatchReport[];
}

export type ExtensionToWebviewMessage =
    | {
          readonly type: "DOCUMENT_INIT";
          readonly uri: string;
          readonly document: RuxDocument | null;
          readonly rawText: string;
          readonly isDirty: boolean;
          readonly isReadOnly: boolean;
      }
    | {
          readonly type: "DOCUMENT_UPDATE";
          readonly rawText: string;
          readonly document: RuxDocument | null;
          readonly revision: number;
      }
    | {
          readonly type: "VALIDATION_RESULT";
          readonly result: DaemonValidationResult;
      }
    | {
          readonly type: "DAEMON_STATUS";
          readonly status: DaemonStatus;
          readonly version?: string;
          readonly message?: string;
      }
    | {
          readonly type: "SELECT_NODE_EXTERNAL";
          readonly nodeId: string | null;
      }
    | {
          readonly type: "APPLY_PATCH_RESULT";
          readonly success: boolean;
          readonly error?: string;
      }
    | {
          readonly type: "GENERATE_CODE_RESULT";
          readonly result: DaemonCodegenResult;
      }
    | {
          readonly type: "EXPORT_CODE_RESULT";
          readonly result: DaemonExportCodeResult;
      }
    | {
          readonly type: "AST_UPDATED_FROM_CODE";
          readonly document: RuxDocument;
          readonly rawText: string;
          readonly changedFile: string;
          readonly timestamp: number;
          readonly patches?: readonly PropertyPatch[];
      }
    | {
          readonly type: "FIGMA_IMPORT_RESULT";
          readonly success: boolean;
          readonly result?: DaemonImportFigmaResult;
          readonly error?: string;
      }
    | {
          readonly type: "FIGMA_IMPORT_PROGRESS";
          readonly step: string;
          readonly progress: number;
      }
    | {
          readonly type: "WASM_PREVIEW_RESULT";
          readonly success: boolean;
          readonly previewUrl?: string;
          readonly wasmSizeBytes?: number;
          readonly buildTimeMs?: number;
          readonly log?: string;
          readonly error?: string;
      }
    | {
          readonly type: "IMPORT_ASSET_RESULT";
          readonly success: boolean;
          readonly result?: DaemonImportAssetResult;
          readonly error?: string;
      }
    | {
          readonly type: "FRAMEWORK_SYNC_STATUS_RESULT";
          readonly result: DaemonFrameworkSyncStatusResult;
      }
    | {
          readonly type: "SAVE_COMPLETE";
          readonly success: boolean;
      }
    | {
          readonly type: "ERROR";
          readonly code: string;
          readonly message: string;
      };

export type WebviewToExtensionMessage =
    | {
          readonly type: "READY";
      }
    | {
          readonly type: "GET_FRAMEWORK_SYNC_STATUS_REQUEST";
      }
    | {
          readonly type: "DOCUMENT_CHANGE";
          readonly rawText: string;
          readonly summary?: string;
      }
    | {
          readonly type: "NODE_PATCH";
          readonly patch: NodePatch;
      }
    | {
          readonly type: "VALIDATE_REQUEST";
          readonly rawText: string;
      }
    | {
          readonly type: "SELECT_NODE";
          readonly nodeId: string | null;
      }
    | {
          readonly type: "SWITCH_VIEW_MODE";
          readonly mode: ViewMode;
      }
    | {
          readonly type: "REQUEST_SAVE";
          readonly rawText?: string;
      }
    | {
          readonly type: "GENERATE_CODE_REQUEST";
          readonly rawText: string;
          readonly existingController?: string;
          readonly targetLanguage?: TargetLanguage;
          readonly targetFramework?: TargetFramework;
      }
    | {
          readonly type: "EXPORT_CODE_TO_DISK";
          readonly rawText: string;
          readonly outputDir?: string;
          readonly targetLanguage?: TargetLanguage;
          readonly targetFramework?: TargetFramework;
      }
    | {
          readonly type: "FIGMA_IMPORT_REQUEST";
          readonly figmaToken: string;
          readonly fileKeyOrUrl: string;
          readonly nodeId?: string;
      }
    | {
          readonly type: "COMPILE_WASM_REQUEST";
          readonly rawText: string;
          readonly targetFramework?: TargetFramework;
      }
    | {
          readonly type: "GET_WASM_STATUS_REQUEST";
      }
    | {
          readonly type: "IMPORT_ASSET_REQUEST";
          readonly assetName: string;
          readonly assetType: "image" | "font";
          readonly dataBase64?: string;
          readonly sourcePath?: string;
      }
    | {
          readonly type: "EXECUTE_COMMAND";
          readonly command: "undo" | "redo" | "save" | "format";
      };

export interface JsonRpcRequest<T = unknown> {
    readonly jsonrpc: "2.0";
    readonly id: string | number;
    readonly method: string;
    readonly params?: T;
}

export interface JsonRpcError {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
    readonly jsonrpc: "2.0";
    readonly id: string | number;
    readonly result?: T;
    readonly error?: JsonRpcError;
}

export interface DaemonValidateParams {
    readonly content: string;
}

export interface DaemonFormatParams {
    readonly content: string;
}

export interface DaemonVersionResult {
    readonly version: string;
    readonly protocol_version: string;
}

export interface PropertyPatch {
    readonly widget_id: string;
    readonly property_name: string;
    readonly old_value?: string;
    readonly new_value: string;
}

export interface AstPatchedFromCodePayload {
    readonly document: RuxDocument;
    readonly rux_path?: string;
    readonly changed_file: string;
    readonly timestamp: number;
    readonly patches_count?: number;
    readonly patches?: readonly PropertyPatch[];
}

export interface DaemonWatchParams {
    readonly watch_dir: string;
    readonly rux_path?: string;
    readonly target_framework?: TargetFramework;
}

export interface DaemonWatchResult {
    readonly watching: boolean;
    readonly watch_dir: string;
    readonly monitored_files: readonly string[];
}

export interface DaemonUnwatchParams {
    readonly watch_dir: string;
}

export interface DaemonUnwatchResult {
    readonly unwatched: boolean;
    readonly watch_dir: string;
}

export interface DaemonReverseParseParams {
    readonly content: string;
    readonly code: string;
    readonly target_framework?: TargetFramework;
}

export interface DaemonReverseParseResult {
    readonly document: RuxDocument;
    readonly patches_count: number;
    readonly patches: readonly PropertyPatch[];
}

export interface DaemonImportFigmaParams {
    readonly figma_token: string;
    readonly file_key: string;
    readonly node_id?: string;
    readonly project_dir?: string;
}

export interface DaemonImportFigmaResult {
    readonly document: RuxDocument;
    readonly imported_node_count: number;
    readonly assets_downloaded: readonly string[];
    readonly warnings: readonly string[];
}

export interface JsonRpcNotification<T = unknown> {
    readonly jsonrpc: "2.0";
    readonly method: string;
    readonly params: T;
}

export interface DaemonCompileWasmParams {
    readonly content: string;
    readonly target_framework?: string;
}

export interface DaemonCompileWasmResult {
    readonly success: boolean;
    readonly preview_url: string;
    readonly wasm_size_bytes: number;
    readonly build_time_ms: number;
    readonly log: string;
}

export interface DaemonWasmPreviewStatus {
    readonly is_running: boolean;
    readonly port: number;
    readonly preview_url: string;
    readonly has_binary: boolean;
    readonly last_build_time_ms: number;
}

export interface DaemonImportAssetParams {
    readonly workspace_path: string;
    readonly asset_name: string;
    readonly asset_type: string;
    readonly data_base64?: string;
    readonly source_path?: string;
}

export interface DaemonImportAssetResult {
    readonly relative_path: string;
    readonly full_path: string;
    readonly asset_type: string;
    readonly alias: string;
}
