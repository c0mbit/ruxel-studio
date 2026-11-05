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
}

export function deactivate(): void {}
