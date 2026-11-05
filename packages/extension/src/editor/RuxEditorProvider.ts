import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { DaemonClient } from "../daemon/DaemonClient";
import { RuxDocumentManager } from "./RuxDocumentManager";

export class RuxEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = "ruxel.ruxEditor";

    private readonly documentManagers: Map<string, RuxDocumentManager> = new Map();

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly daemonClient: DaemonClient,
        private readonly diagnosticCollection: vscode.DiagnosticCollection
    ) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode.Uri.joinPath(this.context.extensionUri, "dist"),
                vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
                vscode.Uri.joinPath(this.context.extensionUri, "packages", "webview", "dist"),
                vscode.Uri.joinPath(this.context.extensionUri, "packages", "webview"),
            ],
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        const manager = new RuxDocumentManager(
            document,
            webviewPanel,
            this.daemonClient,
            this.diagnosticCollection
        );

        const documentKey = document.uri.toString();
        this.documentManagers.set(documentKey, manager);

        webviewPanel.onDidDispose(() => {
            manager.dispose();
            this.documentManagers.delete(documentKey);
        });
    }

    public getManagerForDocument(uri: vscode.Uri): RuxDocumentManager | undefined {
        return this.documentManagers.get(uri.toString());
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = crypto.randomBytes(16).toString("hex");

        const candidatePaths = [
            path.join(this.context.extensionPath, "dist", "webview"),
            path.join(this.context.extensionPath, "packages", "webview", "dist"),
            path.join(this.context.extensionPath, "..", "webview", "dist"),
        ];

        const webviewDistPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

        let scriptUri: vscode.Uri;
        let styleUri: vscode.Uri | null = null;

        if (webviewDistPath) {
            const files = fs.readdirSync(webviewDistPath);
            const jsFile = files.find((f) => f.endsWith(".js")) ?? "index.js";
            const cssFile = files.find((f) => f.endsWith(".css"));

            scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDistPath, jsFile)));

            if (cssFile) {
                styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(webviewDistPath, cssFile)));
            }
        } else {
            scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, "packages", "webview", "src", "main.tsx")
            );
        }

        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource}; connect-src ${cspSource} ws: http:;">
    ${styleUri ? `<link rel="stylesheet" href="${styleUri}" />` : ""}
    <title>Ruxel Studio</title>
</head>
<body class="bg-zinc-950 text-zinc-100 select-none overflow-hidden m-0 p-0 w-screen h-screen">
    <div id="root" class="w-full h-full flex flex-col"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

