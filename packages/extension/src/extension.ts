import * as path from "path";
import * as vscode from "vscode";
import { DaemonClient } from "./daemon/DaemonClient";
import { RuxEditorProvider } from "./editor/RuxEditorProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const diagnosticCollection =
        vscode.languages.createDiagnosticCollection("ruxel");
    context.subscriptions.push(diagnosticCollection);

    const daemonClient = new DaemonClient(context);
    context.subscriptions.push(daemonClient);

    void daemonClient.start();

    const editorProvider = new RuxEditorProvider(
        context,
        daemonClient,
        diagnosticCollection
    );

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            RuxEditorProvider.viewType,
            editorProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("ruxel.restartDaemon", async () => {
            await daemonClient.restart();
            void vscode.window.showInformationMessage(
                "Ruxel AST daemon restarted successfully."
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ruxel.validateCurrentDocument",
            async () => {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor || !activeEditor.document.fileName.endsWith(".rux")) {
                    void vscode.window.showWarningMessage(
                        "No active .rux document to validate."
                    );
                    return;
                }

                const manager = editorProvider.getManagerForDocument(
                    activeEditor.document.uri
                );
                if (manager) {
                    await manager.runValidation(activeEditor.document.getText());
                } else {
                    const result = await daemonClient.validate(
                        activeEditor.document.getText()
                    );
                    if (result.valid) {
                        void vscode.window.showInformationMessage(
                            "Document is valid!"
                        );
                    } else {
                        void vscode.window.showErrorMessage(
                            `Validation failed with ${result.errors.length} errors.`
                        );
                    }
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "ruxel.formatCurrentDocument",
            async () => {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor || !activeEditor.document.fileName.endsWith(".rux")) {
                    return;
                }

                const manager = editorProvider.getManagerForDocument(
                    activeEditor.document.uri
                );
                if (manager) {
                    await manager.formatDocument();
                } else {
                    try {
                        const formatted = await daemonClient.format(
                            activeEditor.document.getText()
                        );
                        const entireRange = new vscode.Range(
                            activeEditor.document.positionAt(0),
                            activeEditor.document.positionAt(
                                activeEditor.document.getText().length
                            )
                        );
                        await activeEditor.edit((editBuilder) => {
                            editBuilder.replace(entireRange, formatted);
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error ? error.message : String(error);
                        void vscode.window.showErrorMessage(
                            `Formatting failed: ${message}`
                        );
                    }
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("ruxel.generateCode", async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || !activeEditor.document.fileName.endsWith(".rux")) {
                void vscode.window.showWarningMessage(
                    "No active .rux document to generate code from."
                );
                return;
            }

            const manager = editorProvider.getManagerForDocument(
                activeEditor.document.uri
            );
            if (manager) {
                await manager.exportCodeToDisk();
            } else {
                try {
                    const docDir = path.dirname(activeEditor.document.uri.fsPath);
                    await daemonClient.exportCode({
                        content: activeEditor.document.getText(),
                        output_dir: docDir,
                        rux_path: activeEditor.document.uri.fsPath,
                    });
                    void vscode.window.showInformationMessage(
                        `Ruxel: Generated ui_generated.rs and controller.rs in ${docDir}`
                    );
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    void vscode.window.showErrorMessage(
                        `Code generation failed: ${message}`
                    );
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("ruxel.toggleTelemetry", async () => {
            const config = vscode.workspace.getConfiguration("ruxel");
            const current = config.get<boolean>("telemetry.enabled", false);
            const updated = !current;
            await config.update(
                "telemetry.enabled",
                updated,
                vscode.ConfigurationTarget.Global
            );
            await daemonClient.setTelemetryOptIn(updated);
            void vscode.window.showInformationMessage(
                `Ruxel anonymous crash telemetry is now ${updated ? "ENABLED" : "DISABLED"}.`
            );
        })
    );

    await initializeTelemetry(context, daemonClient);
}

async function initializeTelemetry(
    context: vscode.ExtensionContext,
    daemonClient: DaemonClient
): Promise<void> {
    const TELEMETRY_PROMPTED_KEY = "ruxel.telemetryPrompted";
    const config = vscode.workspace.getConfiguration("ruxel");

    const hasPrompted = context.globalState.get<boolean>(TELEMETRY_PROMPTED_KEY, false);

    const syncWithDaemon = async (enabled: boolean) => {
        try {
            await daemonClient.setTelemetryOptIn(enabled);
        } catch {
            // Daemon may still be launching
        }
    };

    if (!hasPrompted) {
        void (async () => {
            const choice = await vscode.window.showInformationMessage(
                "Help improve Ruxel Studio by sharing anonymous parsing crash reports.",
                "Yes, Opt In",
                "No Thanks"
            );
            const optIn = choice === "Yes, Opt In";
            await context.globalState.update(TELEMETRY_PROMPTED_KEY, true);
            await config.update(
                "telemetry.enabled",
                optIn,
                vscode.ConfigurationTarget.Global
            );
            await syncWithDaemon(optIn);
        })();
    } else {
        const isEnabled = config.get<boolean>("telemetry.enabled", false);
        void syncWithDaemon(isEnabled);
    }

    context.subscriptions.push(
        daemonClient.onDidChangeStatus((status) => {
            if (status === "connected") {
                const isEnabled = vscode.workspace
                    .getConfiguration("ruxel")
                    .get<boolean>("telemetry.enabled", false);
                void syncWithDaemon(isEnabled);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration("ruxel.telemetry.enabled")) {
                const isEnabled = vscode.workspace
                    .getConfiguration("ruxel")
                    .get<boolean>("telemetry.enabled", false);
                await syncWithDaemon(isEnabled);
            }
        })
    );
}

export function deactivate(): void {}
