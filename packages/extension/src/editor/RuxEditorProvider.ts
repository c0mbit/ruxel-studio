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
        const workspaceRoots = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders.map((wf) => wf.uri)
            : [];
        const docDirUri = vscode.Uri.file(path.dirname(document.uri.fsPath));

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode.Uri.joinPath(this.context.extensionUri, "webview-dist"),
                vscode.Uri.joinPath(this.context.extensionUri, "dist"),
                vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
                ...workspaceRoots,
                docDirUri,
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
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "webview-dist", "assets", "index.js")
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "webview-dist", "assets", "index.css")
        );

        const cspSource = webview.cspSource;
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource}; font-src ${cspSource} data:; connect-src ${cspSource} ws: wss: http: https:; frame-src ${cspSource} http://127.0.0.1:* http://localhost:*;">
    <link rel="stylesheet" href="${styleUri}" />
    <title>Ruxel Studio</title>
</head>
<body class="bg-zinc-950 text-zinc-100 select-none overflow-hidden m-0 p-0 w-screen h-screen">
    <div id="root" class="w-full h-full flex flex-col"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
