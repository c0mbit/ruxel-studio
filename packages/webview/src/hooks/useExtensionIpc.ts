import { useCallback, useEffect } from "react";
import type {
    ExtensionToWebviewMessage,
    TargetFramework,
    TargetLanguage,
    ViewMode,
    WebviewToExtensionMessage,
} from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { vscodeApi } from "../vscode";

export function useExtensionIpc() {
    const setInitialDocument = useEditorStore((state) => state.setInitialDocument);
    const updateDocumentFromExternal = useEditorStore(
        (state) => state.updateDocumentFromExternal
    );
    const reconcileAstFromCode = useEditorStore(
        (state) => state.reconcileAstFromCode
    );
    const setValidationResult = useEditorStore(
        (state) => state.setValidationResult
    );
    const setDaemonStatus = useEditorStore((state) => state.setDaemonStatus);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const setCodegenResult = useEditorStore((state) => state.setCodegenResult);
    const setExportResult = useEditorStore((state) => state.setExportResult);
    const setIsGeneratingCode = useEditorStore((state) => state.setIsGeneratingCode);
    const setFigmaImportProgress = useEditorStore((state) => state.setFigmaImportProgress);
    const setIsImportingFigma = useEditorStore((state) => state.setIsImportingFigma);
    const applyImportedFigmaDocument = useEditorStore((state) => state.applyImportedFigmaDocument);
    const setWasmPreviewUrl = useEditorStore((state) => state.setWasmPreviewUrl);
    const setIsCompilingWasm = useEditorStore((state) => state.setIsCompilingWasm);
    const setWasmError = useEditorStore((state) => state.setWasmError);
    const addImportedAsset = useEditorStore((state) => state.addImportedAsset);
    const setFrameworkSyncStatus = useEditorStore((state) => state.setFrameworkSyncStatus);

    useEffect(() => {
        const handleMessage = (event: MessageEvent<ExtensionToWebviewMessage>) => {
            const message = event.data;
            if (!message || typeof message !== "object") {
                return;
            }

            switch (message.type) {
                case "DOCUMENT_INIT":
                    setInitialDocument(
                        message.rawText,
                        message.document,
                        message.isDirty,
                        message.isReadOnly
                    );
                    break;
                case "DOCUMENT_UPDATE":
                    updateDocumentFromExternal(
                        message.rawText,
                        message.document
                    );
                    break;
                case "VALIDATION_RESULT":
                    setValidationResult(message.result);
                    break;
                case "DAEMON_STATUS":
                    setDaemonStatus(message.status);
                    break;
                case "SELECT_NODE_EXTERNAL":
                    setSelectedNodeId(message.nodeId);
                    break;
                case "GENERATE_CODE_RESULT":
                    setCodegenResult(message.result);
                    break;
                case "EXPORT_CODE_RESULT":
                    setExportResult(message.result);
                    break;
                case "AST_UPDATED_FROM_CODE":
                    reconcileAstFromCode(message.document, message.rawText);
                    break;
                case "FIGMA_IMPORT_PROGRESS":
                    setFigmaImportProgress({
                        step: message.step,
                        progress: message.progress,
                    });
                    break;
                case "FIGMA_IMPORT_RESULT":
                    setIsImportingFigma(false);
                    if (message.success && message.result) {
                        applyImportedFigmaDocument(message.result.document);
                    } else {
                        setFigmaImportProgress(null);
                    }
                    break;
                case "WASM_PREVIEW_RESULT":
                    setIsCompilingWasm(false);
                    if (message.success && message.previewUrl) {
                        setWasmPreviewUrl(message.previewUrl);
                        setWasmError(null);
                    } else if (message.error) {
                        setWasmError(message.error);
                    }
                    break;
                case "IMPORT_ASSET_RESULT":
                    if (message.success && message.result) {
                        addImportedAsset({
                            alias: message.result.alias,
                            relativePath: message.result.relative_path,
                            fullPath: message.result.full_path,
                            assetType: message.result.asset_type,
                        });
                    }
                    break;
                case "FRAMEWORK_SYNC_STATUS_RESULT":
                    setFrameworkSyncStatus(message.result);
                    break;
                case "ERROR":
                    setIsGeneratingCode(false);
                    setIsImportingFigma(false);
                    setFigmaImportProgress(null);
                    break;
            }
        };

        window.addEventListener("message", handleMessage);
        vscodeApi.postMessage({ type: "READY" });

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [
        setInitialDocument,
        updateDocumentFromExternal,
        reconcileAstFromCode,
        setValidationResult,
        setDaemonStatus,
        setSelectedNodeId,
        setCodegenResult,
        setExportResult,
        setIsGeneratingCode,
        setFigmaImportProgress,
        setIsImportingFigma,
        applyImportedFigmaDocument,
        setWasmPreviewUrl,
        setIsCompilingWasm,
        setWasmError,
        addImportedAsset,
    ]);

    const postMessage = useCallback((message: WebviewToExtensionMessage) => {
        vscodeApi.postMessage(message);
    }, []);

    const sendDocumentChange = useCallback(
        (rawText: string, summary?: string) => {
            postMessage({
                type: "DOCUMENT_CHANGE",
                rawText,
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
                rawText,
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

    const sendRequestSave = useCallback(() => {
        postMessage({
            type: "REQUEST_SAVE",
        });
    }, [postMessage]);

    const sendGenerateCode = useCallback(
        (
            rawText: string,
            existingController?: string,
            targetLanguage?: TargetLanguage,
            targetFramework?: TargetFramework
        ) => {
            setIsGeneratingCode(true);
            postMessage({
                type: "GENERATE_CODE_REQUEST",
                rawText,
                existingController,
                targetLanguage,
                targetFramework,
            });
        },
        [postMessage, setIsGeneratingCode]
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
                rawText,
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
        (figmaToken: string, fileKeyOrUrl: string, nodeId?: string) => {
            setIsImportingFigma(true);
            setFigmaImportProgress({
                step: "Connecting to Figma REST API...",
                progress: 10,
            });
            postMessage({
                type: "FIGMA_IMPORT_REQUEST",
                figmaToken,
                fileKeyOrUrl,
                nodeId,
            });
        },
        [postMessage, setIsImportingFigma, setFigmaImportProgress]
    );

    const sendCompileWasm = useCallback(
        (rawText: string, targetFramework?: TargetFramework) => {
            setIsCompilingWasm(true);
            setWasmError(null);
            postMessage({
                type: "COMPILE_WASM_REQUEST",
                rawText,
                targetFramework,
            });
        },
        [postMessage, setIsCompilingWasm, setWasmError]
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

    return {
        sendDocumentChange,
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
