import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
    type AstPatchedFromCodePayload,
    type DaemonStatus,
    type DaemonValidationResult,
    type ExtensionToWebviewMessage,
    type RuxDocument,
    type TargetFramework,
    type TargetLanguage,
    type WebviewToExtensionMessage,
    createDefaultStarterDocument,
    parseRuxDocument,
} from "@ruxel/shared-types";
import type { DaemonClient } from "../daemon/DaemonClient";

export class RuxDocumentManager implements vscode.Disposable {
    private isDisposed: boolean = false;
    private lastSentText: string = "";
    private revision: number = 0;
    private validationDebounceTimer: NodeJS.Timeout | null = null;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly document: vscode.TextDocument,
        private readonly webviewPanel: vscode.WebviewPanel,
        private readonly daemonClient: DaemonClient,
        private readonly diagnosticCollection: vscode.DiagnosticCollection
    ) {
        this.setupListeners();
    }

    private setupListeners(): void {
        this.disposables.push(
            this.webviewPanel.webview.onDidReceiveMessage(
                (message: WebviewToExtensionMessage) => {
                    this.handleWebviewMessage(message);
                }
            )
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.toString() === this.document.uri.toString()) {
                    this.handleExternalDocumentChange();
                }
            })
        );

        this.disposables.push(
            this.daemonClient.onDidChangeStatus((status: DaemonStatus) => {
                this.postMessage({
                    type: "DAEMON_STATUS",
                    status,
                });
            })
        );

        this.disposables.push(
            this.daemonClient.onDidReceiveAstPatched((payload) => {
                void this.handleAstPatchedFromCode(payload);
            })
        );
    }

    private handleWebviewMessage(message: WebviewToExtensionMessage): void {
        switch (message.type) {
            case "READY":
                this.sendInitialState();
                break;
            case "DOCUMENT_CHANGE":
                void this.applyWebviewDocumentChange(
                    message.rawText,
                    message.summary
                );
                break;
            case "NODE_PATCH":
                break;
            case "VALIDATE_REQUEST":
                void this.runValidation(message.rawText);
                break;
            case "GENERATE_CODE_REQUEST":
                void this.generateCode(
                    message.existingController,
                    message.targetLanguage,
                    message.targetFramework
                );
                break;
            case "EXPORT_CODE_TO_DISK":
                void this.exportCodeToDisk(
                    message.outputDir,
                    message.targetLanguage,
                    message.targetFramework,
                    message.rawText
                );
                break;
            case "FIGMA_IMPORT_REQUEST":
                void this.importFigma(
                    message.figmaToken,
                    message.fileKeyOrUrl,
                    message.nodeId
                );
                break;
            case "COMPILE_WASM_REQUEST":
                void this.compileWasm(message.rawText, message.targetFramework);
                break;
            case "GET_WASM_STATUS_REQUEST":
                void this.getWasmStatus();
                break;
            case "GET_FRAMEWORK_SYNC_STATUS_REQUEST":
                void this.getFrameworkSyncStatus();
                break;
            case "IMPORT_ASSET_REQUEST":
                void this.importAsset(
                    message.assetName,
                    message.assetType,
                    message.dataBase64,
                    message.sourcePath
                );
                break;
            case "SELECT_NODE":
                break;
            case "SWITCH_VIEW_MODE":
                break;
            case "REQUEST_SAVE":
                void this.handleRequestSave(message.rawText);
                break;
            case "EXECUTE_COMMAND":
                void this.executeCommand(message.command);
                break;
        }
    }

    private async handleRequestSave(rawText?: string): Promise<void> {
        if (rawText) {
            await this.applyWebviewDocumentChange(rawText, "Save Document");
        }
        const saved = await this.document.save();
        this.postMessage({
            type: "SAVE_COMPLETE",
            success: saved,
        });
    }

    private sendInitialState(): void {
        let rawText = this.document.getText();
        let parsedDoc: RuxDocument | null = null;

        if (rawText.trim().length === 0) {
            parsedDoc = createDefaultStarterDocument(this.document.fileName);
            rawText = JSON.stringify(parsedDoc, null, 2);
            this.lastSentText = rawText;

            const entireRange = new vscode.Range(
                this.document.positionAt(0),
                this.document.positionAt(this.document.getText().length)
            );
            const edit = new vscode.WorkspaceEdit();
            edit.replace(this.document.uri, entireRange, rawText);
            void vscode.workspace.applyEdit(edit).then(async (applied) => {
                if (applied) {
                    await this.document.save();
                }
            });
        } else {
            this.lastSentText = rawText;
            parsedDoc = parseRuxDocument(rawText);
        }

        this.postMessage({
            type: "DOCUMENT_INIT",
            uri: this.document.uri.toString(),
            document: parsedDoc,
            rawText,
            isDirty: this.document.isDirty,
            isReadOnly: false,
        });

        this.postMessage({
            type: "DAEMON_STATUS",
            status: this.daemonClient.status,
        });

        const docDir = path.dirname(this.document.uri.fsPath);
        void this.daemonClient.watchTarget({
            watch_dir: docDir,
            rux_path: this.document.uri.fsPath,
        });

        void this.runValidation(rawText);
    }

    private handleExternalDocumentChange(): void {
        const currentText = this.document.getText();
        const normalizedCurrent = currentText.replace(/\r\n/g, "\n");
        const normalizedLast = this.lastSentText.replace(/\r\n/g, "\n");
        if (normalizedCurrent === normalizedLast) {
            return;
        }

        this.lastSentText = currentText;
        this.revision++;

        let parsedDoc: RuxDocument | null = null;
        try {
            parsedDoc = JSON.parse(currentText) as RuxDocument;
        } catch {
            parsedDoc = null;
        }

        this.postMessage({
            type: "DOCUMENT_UPDATE",
            rawText: currentText,
            document: parsedDoc,
            revision: this.revision,
        });

        this.scheduleValidation(currentText);
    }

    private async handleAstPatchedFromCode(
        payload: AstPatchedFromCodePayload
    ): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        const currentFsPath = path.normalize(this.document.uri.fsPath).toLowerCase();
        let matchesDocument = false;
        if (payload.rux_path) {
            matchesDocument =
                path.normalize(payload.rux_path).toLowerCase() === currentFsPath;
        } else {
            matchesDocument = true;
        }

        if (!matchesDocument) {
            return;
        }

        const newRawText = JSON.stringify(payload.document, null, 2);
        if (newRawText === this.document.getText()) {
            return;
        }

        this.lastSentText = newRawText;

        const entireRange = new vscode.Range(
            this.document.positionAt(0),
            this.document.positionAt(this.document.getText().length)
        );

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this.document.uri, entireRange, newRawText);

        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
            void this.document.save();
        }

        this.postMessage({
            type: "AST_UPDATED_FROM_CODE",
            document: payload.document,
            rawText: newRawText,
            changedFile: payload.changed_file,
            timestamp: payload.timestamp,
            patches: payload.patches,
        });

        this.scheduleValidation(newRawText);
    }

    private async applyWebviewDocumentChange(
        newText: string,
        _summary?: string
    ): Promise<void> {
        const normalizedNew = newText.replace(/\r\n/g, "\n");
        const normalizedDoc = this.document.getText().replace(/\r\n/g, "\n");
        if (normalizedNew === normalizedDoc) {
            return;
        }

        this.lastSentText = newText;
        const entireRange = new vscode.Range(
            this.document.positionAt(0),
            this.document.positionAt(this.document.getText().length)
        );

        const edit = new vscode.WorkspaceEdit();
        edit.replace(this.document.uri, entireRange, newText);

        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
            console.error(
                `Failed to apply edit from webview to ${this.document.uri.fsPath}`
            );
        }

        this.scheduleValidation(newText);
    }

    private scheduleValidation(content: string): void {
        if (this.validationDebounceTimer) {
            clearTimeout(this.validationDebounceTimer);
        }

        this.validationDebounceTimer = setTimeout(() => {
            this.validationDebounceTimer = null;
            void this.runValidation(content);
        }, 300);
    }

    public async runValidation(content: string): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        const result: DaemonValidationResult = await this.daemonClient.validate(
            content
        );

        this.updateVsCodeDiagnostics(result);

        this.postMessage({
            type: "VALIDATION_RESULT",
            result,
        });
    }

    private resolveControllerFilename(
        targetLanguage?: TargetLanguage,
        targetFramework?: TargetFramework
    ): string {
        if (targetFramework === "fyne" || targetLanguage === "go") {
            return "controller.go";
        }
        if (targetFramework === "flet" || targetLanguage === "python") {
            return "controller.py";
        }
        return "controller.rs";
    }

    public async generateCode(
        existingControllerOverride?: string,
        targetLanguage?: TargetLanguage,
        targetFramework?: TargetFramework
    ): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        const ctrlFileName = this.resolveControllerFilename(
            targetLanguage,
            targetFramework
        );

        let existingController = existingControllerOverride;
        if (!existingController) {
            const docDir = path.dirname(this.document.uri.fsPath);
            const controllerFile = path.join(docDir, ctrlFileName);
            if (fs.existsSync(controllerFile)) {
                try {
                    existingController = fs.readFileSync(controllerFile, "utf-8");
                } catch {
                    existingController = undefined;
                }
            }
        }

        try {
            const result = await this.daemonClient.generateCode({
                content: this.document.getText(),
                existing_controller: existingController,
                target_language: targetLanguage,
                target_framework: targetFramework,
            });
            this.postMessage({
                type: "GENERATE_CODE_RESULT",
                result,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.postMessage({
                type: "ERROR",
                code: "CODEGEN_FAILED",
                message,
            });
        }
    }

    public async exportCodeToDisk(
        customOutputDir?: string,
        targetLanguage?: TargetLanguage,
        targetFramework?: TargetFramework,
        rawTextOverride?: string
    ): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        const outputDir =
            customOutputDir || path.dirname(this.document.uri.fsPath);

        const frameworkLabel = targetFramework
            ? targetFramework.toUpperCase()
            : targetLanguage === "go"
            ? "GO FYNE"
            : targetLanguage === "python"
            ? "PYTHON FLET"
            : "RUST";

        try {
            const contentToExport = rawTextOverride || this.document.getText();
            const result = await this.daemonClient.exportCode({
                content: contentToExport,
                output_dir: outputDir,
                rux_path: this.document.uri.fsPath,
                target_language: targetLanguage,
                target_framework: targetFramework,
            });

            void this.daemonClient.watchTarget({
                watch_dir: outputDir,
                rux_path: this.document.uri.fsPath,
                target_framework: targetFramework,
            });

            this.postMessage({
                type: "EXPORT_CODE_RESULT",
                result,
            });
            const openAction = "Open View File";
            void vscode.window
                .showInformationMessage(
                    `Ruxel Studio: Exported ${frameworkLabel} code to ${outputDir}`,
                    openAction
                )
                .then(async (selection) => {
                    if (selection === openAction && result.ui_generated_path) {
                        try {
                            const targetUri = vscode.Uri.file(result.ui_generated_path);
                            const doc = await vscode.workspace.openTextDocument(targetUri);
                            await vscode.window.showTextDocument(doc, {
                                viewColumn: vscode.ViewColumn.Beside,
                                preview: false,
                            });
                        } catch {
                            
                        }
                    }
                });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(
                `Failed to export ${frameworkLabel} code: ${message}`
            );
            this.postMessage({
                type: "ERROR",
                code: "EXPORT_FAILED",
                message,
            });
        }
    }

    private async importFigma(
        figmaToken: string,
        fileKeyOrUrl: string,
        nodeId?: string
    ): Promise<void> {
        try {
            this.postMessage({
                type: "FIGMA_IMPORT_PROGRESS",
                step: "Connecting to Figma REST API...",
                progress: 20,
            });

            const projectDir = path.dirname(this.document.uri.fsPath);
            const result = await this.daemonClient.importFigma({
                figma_token: figmaToken,
                file_key: fileKeyOrUrl,
                node_id: nodeId,
                project_dir: projectDir,
            });

            this.postMessage({
                type: "FIGMA_IMPORT_PROGRESS",
                step: "Resolving Geometry & Building AST...",
                progress: 80,
            });

            const updatedRawText = JSON.stringify(result.document, null, 2);
            await this.applyWebviewDocumentChange(
                updatedRawText,
                `Import Figma frame (${result.imported_node_count} nodes)`
            );

            this.postMessage({
                type: "FIGMA_IMPORT_RESULT",
                success: true,
                result,
            });

            void vscode.window.showInformationMessage(
                `Successfully imported Figma frame with ${result.imported_node_count} widgets and ${result.assets_downloaded.length} assets.`
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            this.postMessage({
                type: "FIGMA_IMPORT_RESULT",
                success: false,
                error: errorMessage,
            });
            void vscode.window.showErrorMessage(`Figma import failed: ${errorMessage}`);
        }
    }

    private updateVsCodeDiagnostics(result: DaemonValidationResult): void {
        if (result.valid || result.errors.length === 0) {
            this.diagnosticCollection.delete(this.document.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = result.errors.map((err) => {
            const line = Math.max(0, (err.line ?? 1) - 1);
            const column = Math.max(0, (err.column ?? 1) - 1);
            const range = new vscode.Range(line, column, line, column + 1);

            const diagnostic = new vscode.Diagnostic(
                range,
                err.message,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = "Ruxel Daemon";
            diagnostic.code = err.code;
            return diagnostic;
        });

        this.diagnosticCollection.set(this.document.uri, diagnostics);
    }

    private async executeCommand(
        command: "undo" | "redo" | "save" | "format"
    ): Promise<void> {
        switch (command) {
            case "undo":
                await vscode.commands.executeCommand("undo");
                break;
            case "redo":
                await vscode.commands.executeCommand("redo");
                break;
            case "save":
                await this.document.save();
                break;
            case "format":
                await this.formatDocument();
                break;
        }
    }

    public async formatDocument(): Promise<void> {
        try {
            const currentText = this.document.getText();
            const formatted = await this.daemonClient.format(currentText);
            await this.applyWebviewDocumentChange(formatted, "Format Document");
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(
                `Failed to format .rux document: ${message}`
            );
        }
    }

    private async compileWasm(
        rawText: string,
        targetFramework?: TargetFramework
    ): Promise<void> {
        try {
            const result = await this.daemonClient.compileWasm({
                content: rawText,
                target_framework: targetFramework,
            });
            this.postMessage({
                type: "WASM_PREVIEW_RESULT",
                success: result.success,
                previewUrl: result.preview_url,
                wasmSizeBytes: result.wasm_size_bytes,
                buildTimeMs: result.build_time_ms,
                log: result.log,
            });
        } catch (error) {
            this.postMessage({
                type: "WASM_PREVIEW_RESULT",
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async getWasmStatus(): Promise<void> {
        try {
            const status = await this.daemonClient.getWasmPreviewStatus();
            this.postMessage({
                type: "WASM_PREVIEW_RESULT",
                success: status.is_running,
                previewUrl: status.preview_url,
                buildTimeMs: status.last_build_time_ms,
            });
        } catch (error) {
            this.postMessage({
                type: "WASM_PREVIEW_RESULT",
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private async getFrameworkSyncStatus(): Promise<void> {
        try {
            const result = await this.daemonClient.getFrameworkSyncStatus();
            this.postMessage({
                type: "FRAMEWORK_SYNC_STATUS_RESULT",
                result,
            });
        } catch (error) {
            this.postMessage({
                type: "ERROR",
                code: "FRAMEWORK_SYNC_STATUS_FAILED",
                message: (error as Error).message,
            });
        }
    }

    private async importAsset(
        assetName: string,
        assetType: "image" | "font",
        dataBase64?: string,
        sourcePath?: string
    ): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.document.uri);
            const workspacePath = workspaceFolder
                ? workspaceFolder.uri.fsPath
                : path.dirname(this.document.uri.fsPath);

            const result = await this.daemonClient.importAsset({
                workspace_path: workspacePath,
                asset_name: assetName,
                asset_type: assetType,
                data_base64: dataBase64,
                source_path: sourcePath,
            });

            this.postMessage({
                type: "IMPORT_ASSET_RESULT",
                success: true,
                result,
            });
        } catch (error) {
            this.postMessage({
                type: "IMPORT_ASSET_RESULT",
                success: false,
                error: (error as Error).message,
            });
        }
    }

    private postMessage(message: ExtensionToWebviewMessage): void {
        if (this.isDisposed) {
            return;
        }
        void this.webviewPanel.webview.postMessage(message);
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;

        if (this.validationDebounceTimer) {
            clearTimeout(this.validationDebounceTimer);
            this.validationDebounceTimer = null;
        }

        const docDir = path.dirname(this.document.uri.fsPath);
        void this.daemonClient.unwatchTarget({
            watch_dir: docDir,
        });

        this.diagnosticCollection.delete(this.document.uri);

        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }
}
