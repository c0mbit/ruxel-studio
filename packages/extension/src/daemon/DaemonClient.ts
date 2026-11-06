import * as child_process from "child_process";
import * as vscode from "vscode";
import type {
    AstPatchedFromCodePayload,
    DaemonCodegenParams,
    DaemonCodegenResult,
    DaemonCompileWasmParams,
    DaemonCompileWasmResult,
    DaemonExportCodeParams,
    DaemonExportCodeResult,
    DaemonFormatParams,
    DaemonFrameworkSyncStatusResult,
    DaemonImportAssetParams,
    DaemonImportAssetResult,
    DaemonImportFigmaParams,
    DaemonImportFigmaResult,
    DaemonReverseParseParams,
    DaemonReverseParseResult,
    DaemonStatus,
    DaemonUnwatchParams,
    DaemonUnwatchResult,
    DaemonValidateParams,
    DaemonValidationResult,
    DaemonVersionResult,
    DaemonWasmPreviewStatus,
    DaemonWatchParams,
    DaemonWatchResult,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { resolveBinary } from "./BinaryResolver";
import { JsonRpcConnection } from "./JsonRpcConnection";

function sanitizeRuxContent(content: string): string {
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object") {
            return serializeRuxDocument(parsed as Record<string, unknown>);
        }
    } catch {}
    return content;
}

export class DaemonClient implements vscode.Disposable {
    private process: child_process.ChildProcess | null = null;
    private connection: JsonRpcConnection | null = null;
    private currentStatus: DaemonStatus = "disconnected";
    private readonly statusEmitter: vscode.EventEmitter<DaemonStatus> =
        new vscode.EventEmitter<DaemonStatus>();
    private readonly astPatchedEmitter: vscode.EventEmitter<AstPatchedFromCodePayload> =
        new vscode.EventEmitter<AstPatchedFromCodePayload>();
    private restartTimeout: NodeJS.Timeout | null = null;
    private isExplicitlyDisposed: boolean = false;

    public readonly onDidChangeStatus: vscode.Event<DaemonStatus> =
        this.statusEmitter.event;
    public readonly onDidReceiveAstPatched: vscode.Event<AstPatchedFromCodePayload> =
        this.astPatchedEmitter.event;

    constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    public get status(): DaemonStatus {
        return this.currentStatus;
    }

    private setStatus(status: DaemonStatus): void {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this.statusEmitter.fire(status);
        }
    }

    public async start(): Promise<void> {
        if (this.isExplicitlyDisposed) {
            return;
        }

        this.killExistingProcess();

        const binaryPath = this.resolveDaemonBinaryPath();
        if (!binaryPath) {
            this.setStatus("error");
            console.error("Could not find rux-daemon executable binary");
            return;
        }

        try {
            const spawned = child_process.spawn(binaryPath, ["--stdio"], {
                stdio: ["pipe", "pipe", "pipe"],
                windowsHide: true,
            });

            this.process = spawned;
            this.connection = new JsonRpcConnection(spawned);

            this.connection.onNotification<AstPatchedFromCodePayload>(
                "rux/astPatchedFromCode",
                (payload) => {
                    this.astPatchedEmitter.fire(payload);
                }
            );

            spawned.on("spawn", () => {
                this.setStatus("connected");
            });

            spawned.on("error", (error: Error) => {
                console.error("Failed to spawn rux-daemon:", error);
                this.setStatus("error");
                this.scheduleRestart();
            });

            spawned.on("exit", (code: number | null, signal: string | null) => {
                console.warn(
                    `rux-daemon process exited with code ${code}, signal ${signal}`
                );
                this.setStatus("disconnected");
                this.scheduleRestart();
            });

            await this.version();
            this.setStatus("connected");
        } catch (error) {
            console.error("Error during daemon initialization:", error);
            this.setStatus("error");
            this.scheduleRestart();
        }
    }

    private scheduleRestart(): void {
        if (this.isExplicitlyDisposed || this.restartTimeout) {
            return;
        }
        this.restartTimeout = setTimeout(() => {
            this.restartTimeout = null;
            if (!this.isExplicitlyDisposed) {
                void this.start();
            }
        }, 3000);
    }

    private killExistingProcess(): void {
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }

        if (this.connection) {
            this.connection.dispose();
            this.connection = null;
        }

        if (this.process) {
            try {
                this.process.kill();
            } catch (err) {
                console.warn("Failed to kill daemon process:", err);
            }
            this.process = null;
        }
    }

    public resolveDaemonBinaryPath(): string | null {
        const configPath = vscode.workspace
            .getConfiguration("ruxel")
            .get<string>("daemonPath");
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(
            (folder) => folder.uri.fsPath
        );

        return resolveBinary("rux-daemon", {
            extensionPath: this.extensionContext.extensionPath,
            workspaceFolders,
            customConfigPath: configPath,
        });
    }

    public resolveSyncServerBinaryPath(): string | null {
        const configPath = vscode.workspace
            .getConfiguration("ruxel")
            .get<string>("syncServerPath");
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(
            (folder) => folder.uri.fsPath
        );

        return resolveBinary("rux-sync-server", {
            extensionPath: this.extensionContext.extensionPath,
            workspaceFolders,
            customConfigPath: configPath,
        });
    }

    public async validate(content: string): Promise<DaemonValidationResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            return {
                valid: false,
                errors: [
                    {
                        message: "rux-daemon is not connected",
                        code: "DAEMON_UNAVAILABLE",
                    },
                ],
            };
        }

        this.setStatus("validating");
        try {
            const params: DaemonValidateParams = {
                content: sanitizeRuxContent(content),
            };
            const result = await this.connection.sendRequest<
                DaemonValidationResult,
                DaemonValidateParams
            >("rux/validate", params);
            this.setStatus("connected");
            return result;
        } catch (error) {
            this.setStatus("error");
            return {
                valid: false,
                errors: [
                    {
                        message:
                            error instanceof Error ? error.message : String(error),
                        code: "RPC_ERROR",
                    },
                ],
            };
        }
    }

    public async format(content: string): Promise<string> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        const params: DaemonFormatParams = {
            content: sanitizeRuxContent(content),
        };
        const result = await this.connection.sendRequest<
            { formatted: string },
            DaemonFormatParams
        >("rux/format", params);
        return result.formatted;
    }

    public async generateCode(
        params: DaemonCodegenParams
    ): Promise<DaemonCodegenResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        const sanitizedParams: DaemonCodegenParams = {
            ...params,
            rux_content: sanitizeRuxContent(params.rux_content),
        };
        return this.connection.sendRequest<
            DaemonCodegenResult,
            DaemonCodegenParams
        >("rux/codegen", sanitizedParams);
    }

    public async exportCode(
        params: DaemonExportCodeParams
    ): Promise<DaemonExportCodeResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        const sanitizedParams: DaemonExportCodeParams = {
            ...params,
            rux_content: sanitizeRuxContent(params.rux_content),
        };
        return this.connection.sendRequest<
            DaemonExportCodeResult,
            DaemonExportCodeParams
        >("rux/exportCode", sanitizedParams);
    }

    public async watchTarget(
        params: DaemonWatchParams
    ): Promise<DaemonWatchResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<
            DaemonWatchResult,
            DaemonWatchParams
        >("rux/watchTarget", params);
    }

    public async unwatchTarget(
        params: DaemonUnwatchParams
    ): Promise<DaemonUnwatchResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<
            DaemonUnwatchResult,
            DaemonUnwatchParams
        >("rux/unwatchTarget", params);
    }

    public async reverseParse(
        params: DaemonReverseParseParams
    ): Promise<DaemonReverseParseResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<
            DaemonReverseParseResult,
            DaemonReverseParseParams
        >("rux/reverseParse", params);
    }

    public async importFigma(
        params: DaemonImportFigmaParams
    ): Promise<DaemonImportFigmaResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<
            DaemonImportFigmaResult,
            DaemonImportFigmaParams
        >("rux/importFigma", params);
    }

    public async compileWasm(
        params: DaemonCompileWasmParams
    ): Promise<DaemonCompileWasmResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        const sanitizedParams: DaemonCompileWasmParams = {
            ...params,
            rux_content: sanitizeRuxContent(params.rux_content),
        };
        return this.connection.sendRequest<
            DaemonCompileWasmResult,
            DaemonCompileWasmParams
        >("rux/compileWasm", sanitizedParams);
    }

    public async getWasmPreviewStatus(): Promise<DaemonWasmPreviewStatus> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<DaemonWasmPreviewStatus>(
            "rux/getWasmPreviewStatus"
        );
    }

    public async importAsset(
        params: DaemonImportAssetParams
    ): Promise<DaemonImportAssetResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<
            DaemonImportAssetResult,
            DaemonImportAssetParams
        >("rux/importAsset", params);
    }

    public async getFrameworkSyncStatus(): Promise<DaemonFrameworkSyncStatusResult> {
        if (!this.connection || this.currentStatus !== "connected") {
            throw new Error("rux-daemon is not connected");
        }

        return this.connection.sendRequest<DaemonFrameworkSyncStatusResult>(
            "rux/getFrameworkSyncStatus"
        );
    }

    public async version(): Promise<DaemonVersionResult> {
        if (!this.connection) {
            throw new Error("rux-daemon is not running");
        }

        return this.connection.sendRequest<DaemonVersionResult>("rux/version");
    }

    public async restart(): Promise<void> {
        this.killExistingProcess();
        await this.start();
    }

    public dispose(): void {
        this.isExplicitlyDisposed = true;
        this.killExistingProcess();
        this.statusEmitter.dispose();
        this.astPatchedEmitter.dispose();
        this.setStatus("disconnected");
    }
}
