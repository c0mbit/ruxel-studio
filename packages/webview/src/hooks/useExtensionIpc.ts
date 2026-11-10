import { useCallback, useEffect } from "react";
import * as Y from "yjs";
import {
    type ExtensionToWebviewMessage,
    type TargetFramework,
    type TargetLanguage,
    type ViewMode,
    type WebviewToExtensionMessage,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { CRDT_ORIGIN_REMOTE } from "../crdt/crdtBridge";
import { sharedCrdtBridge } from "../state/crdtStore";
import { useEditorStore } from "../state/editorStore";
import { useHistoryStore } from "../state/historyStore";
import { vscodeApi } from "../vscode";

function cleanPayloadText(rawText: string): string {
    try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object") {
            return serializeRuxDocument(parsed as Record<string, unknown>);
        }
    } catch {}
    return rawText;
}

let listenerRefCount = 0;
let activeMessageListener: ((event: MessageEvent<ExtensionToWebviewMessage>) => void) | null = null;

function dispatchIncomingExtensionMessage(event: MessageEvent<ExtensionToWebviewMessage>) {
    const message = event.data;
    if (!message || typeof message !== "object") {
        return;
    }

    switch (message.type) {
        case "DOCUMENT_INIT":
            useHistoryStore.getState().clear();
            useEditorStore.getState().setInitialDocument(
                message.rawText,
                message.document,
                message.isDirty,
                message.isReadOnly
            );
            break;
        case "DOCUMENT_UPDATE":
            useHistoryStore.getState().clear();
            useEditorStore.getState().updateDocumentFromExternal(
                message.rawText,
                message.document
            );
            break;
        case "VALIDATION_RESULT":
            useEditorStore.getState().setValidationResult(message.result);
            break;
        case "DAEMON_STATUS":
            useEditorStore.getState().setDaemonStatus(message.status);
            break;
        case "SELECT_NODE_EXTERNAL":
            useEditorStore.getState().setSelectedNodeId(message.nodeId);
            break;
        case "GENERATE_CODE_RESULT":
            useEditorStore.getState().setCodegenResult(message.result);
            break;
        case "EXPORT_CODE_RESULT":
            useEditorStore.getState().setExportResult(message.result);
            break;
        case "AST_UPDATED_FROM_CODE":
            useEditorStore.getState().reconcileAstFromCode(message.document, message.rawText);
            break;
        case "FIGMA_IMPORT_PROGRESS":
            useEditorStore.getState().setFigmaImportProgress({
                step: message.step,
                progress: message.progress,
            });
            break;
        case "FIGMA_IMPORT_RESULT":
            useEditorStore.getState().setIsImportingFigma(false);
            if (message.success && message.result) {
                useEditorStore.getState().applyImportedFigmaDocument(message.result.document);
            } else {
                useEditorStore.getState().setFigmaImportProgress(null);
            }
            break;
        case "WASM_PREVIEW_RESULT":
            useEditorStore.getState().setIsCompilingWasm(false);
            if (message.success && message.previewUrl) {
                useEditorStore.getState().setWasmPreviewUrl(message.previewUrl);
                useEditorStore.getState().setWasmError(null);
            } else if (message.error) {
                useEditorStore.getState().setWasmError(message.error);
            }
            break;
        case "IMPORT_ASSET_RESULT":
            if (message.success && message.result) {
                useEditorStore.getState().addImportedAsset({
                    alias: message.result.alias,
                    relativePath: message.result.relative_path,
                    fullPath: message.result.full_path,
                    assetType: message.result.asset_type,
                });
            }
            break;
        case "FRAMEWORK_SYNC_STATUS_RESULT":
            useEditorStore.getState().setFrameworkSyncStatus(message.result);
            break;
        case "ASSET_MAP_UPDATE":
            useEditorStore.getState().setResolvedAssets(message.assets);
            break;
        case "CRDT_DELTA_UPDATE": {
            try {
                const binaryStr = window.atob(message.deltaBase64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                Y.applyUpdate(sharedCrdtBridge.getYDoc(), bytes, CRDT_ORIGIN_REMOTE);
            } catch (err) {
                console.error("Failed to apply CRDT delta from extension:", err);
            }
            break;
        }
        case "CRDT_SYNC_RESPONSE": {
            if (message.deltaBase64) {
                try {
                    const binaryStr = window.atob(message.deltaBase64);
                    const bytes = new Uint8Array(binaryStr.length);
                    for (let i = 0; i < binaryStr.length; i++) {
                        bytes[i] = binaryStr.charCodeAt(i);
                    }
                    Y.applyUpdate(sharedCrdtBridge.getYDoc(), bytes, CRDT_ORIGIN_REMOTE);
                } catch (err) {
                    console.error("Failed to apply CRDT sync response in webview:", err);
                }
            }
            break;
        }
        case "ERROR":
            useEditorStore.getState().setIsGeneratingCode(false);
            useEditorStore.getState().setIsImportingFigma(false);
            useEditorStore.getState().setFigmaImportProgress(null);
            break;
    }
}

export function useExtensionIpc() {
    useEffect(() => {
        if (listenerRefCount === 0) {
            activeMessageListener = dispatchIncomingExtensionMessage;
            window.addEventListener("message", activeMessageListener);
            vscodeApi.postMessage({ type: "READY" });
        }
        listenerRefCount++;

        return () => {
            listenerRefCount--;
            if (listenerRefCount <= 0) {
                listenerRefCount = 0;
                if (activeMessageListener) {
                    window.removeEventListener("message", activeMessageListener);
                    activeMessageListener = null;
                }
            }
        };
    }, []);

    const postMessage = useCallback((message: WebviewToExtensionMessage) => {
        vscodeApi.postMessage(message);
    }, []);

    const sendDocumentChange = useCallback(
        (rawText: string, summary?: string) => {
            postMessage({
                type: "DOCUMENT_CHANGE",
                rawText: cleanPayloadText(rawText),
                summary,
            });
        },
        [postMessage]
    );

    const sendSelectNode = useCallback(
        (nodeId: string | null) => {
            postMessage({
                type: "SELECT_NODE",
                nodeId,
            });
        },
        [postMessage]
    );

    const sendValidateRequest = useCallback(
        (rawText: string) => {
            postMessage({
                type: "VALIDATE_REQUEST",
                rawText: cleanPayloadText(rawText),
            });
        },
        [postMessage]
    );

    const sendSwitchViewMode = useCallback(
        (mode: ViewMode) => {
            postMessage({
                type: "SWITCH_VIEW_MODE",
                mode,
            });
        },
        [postMessage]
    );

    const sendRequestSave = useCallback((rawText?: string) => {
        const textToSave = rawText ?? useEditorStore.getState().rawText;
        postMessage({
            type: "REQUEST_SAVE",
            rawText: cleanPayloadText(textToSave),
        });
    }, [postMessage]);

    const sendGenerateCode = useCallback(
        (
            rawText: string,
            existingController?: string,
            targetLanguage?: TargetLanguage,
            targetFramework?: TargetFramework
        ) => {
            useEditorStore.getState().setIsGeneratingCode(true);
            postMessage({
                type: "GENERATE_CODE_REQUEST",
                rawText: cleanPayloadText(rawText),
                existingController,
                targetLanguage,
                targetFramework,
            });
        },
        [postMessage]
    );

    const sendExportCode = useCallback(
        (
            rawText: string,
            outputDir?: string,
            targetLanguage?: TargetLanguage,
            targetFramework?: TargetFramework
        ) => {
            postMessage({
                type: "EXPORT_CODE_TO_DISK",
                rawText: cleanPayloadText(rawText),
                outputDir,
                targetLanguage,
                targetFramework,
            });
        },
        [postMessage]
    );

    const sendExecuteCommand = useCallback(
        (command: "undo" | "redo" | "save" | "format") => {
            postMessage({
                type: "EXECUTE_COMMAND",
                command,
            });
        },
        [postMessage]
    );

    const sendImportFigma = useCallback(
        (figmaToken?: string, fileKeyOrUrl?: string, nodeId?: string, figmaJson?: string) => {
            useEditorStore.getState().setIsImportingFigma(true);
            useEditorStore.getState().setFigmaImportProgress({
                step: figmaJson ? "Ingesting Figma Plugin JSON..." : "Connecting to Figma REST API...",
                progress: 10,
            });
            postMessage({
                type: "FIGMA_IMPORT_REQUEST",
                figmaToken,
                fileKeyOrUrl,
                nodeId,
                figmaJson,
            });
        },
        [postMessage]
    );

    const sendCompileWasm = useCallback(
        (rawText: string, targetFramework?: TargetFramework) => {
            useEditorStore.getState().setIsCompilingWasm(true);
            useEditorStore.getState().setWasmError(null);
            postMessage({
                type: "COMPILE_WASM_REQUEST",
                rawText: cleanPayloadText(rawText),
                targetFramework,
            });
        },
        [postMessage]
    );

    const sendGetWasmStatus = useCallback(() => {
        postMessage({
            type: "GET_WASM_STATUS_REQUEST",
        });
    }, [postMessage]);

    const sendImportAsset = useCallback(
        (
            assetName: string,
            assetType: "image" | "font",
            dataBase64?: string,
            sourcePath?: string
        ) => {
            postMessage({
                type: "IMPORT_ASSET_REQUEST",
                assetName,
                assetType,
                dataBase64,
                sourcePath,
            });
        },
        [postMessage]
    );

    const requestFrameworkSyncStatus = useCallback(() => {
        postMessage({
            type: "GET_FRAMEWORK_SYNC_STATUS_REQUEST",
        });
    }, [postMessage]);

    const sendCrdtDelta = useCallback(
        (deltaBase64: string, stateVectorBase64?: string, summary?: string) => {
            postMessage({
                type: "CRDT_DELTA_CHANGE",
                deltaBase64,
                stateVectorBase64,
                summary,
            });
        },
        [postMessage]
    );

    const sendCrdtSyncRequest = useCallback(
        (stateVectorBase64?: string) => {
            postMessage({
                type: "CRDT_SYNC_REQUEST",
                stateVectorBase64,
            });
        },
        [postMessage]
    );

    return {
        sendDocumentChange,
        sendCrdtDelta,
        sendCrdtSyncRequest,
        sendSelectNode,
        sendValidateRequest,
        sendSwitchViewMode,
        sendRequestSave,
        sendGenerateCode,
        sendExportCode,
        sendExecuteCommand,
        sendImportFigma,
        sendCompileWasm,
        sendGetWasmStatus,
        sendImportAsset,
        requestFrameworkSyncStatus,
    };
}
