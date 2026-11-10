import { create } from "zustand";
import {
    type BreadcrumbItem,
    type CodegenDiagnostic,
    type DaemonCodegenResult,
    type DaemonExportCodeResult,
    type DaemonFrameworkSyncStatusResult,
    type DaemonStatus,
    type DaemonValidationResult,
    type GeneratedFile,
    type RuxDocument,
    type TargetFramework,
    type TargetLanguage,
    type ViewMode,
    createDefaultStarterDocument,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { findNodePath, safeParseJson } from "../utils/treeTraversal.ts";
import { CRDT_ORIGIN_INIT } from "../crdt/crdtBridge.ts";
import { sharedCrdtBridge, sharedCrdtClient } from "./crdtStore.ts";
import { useHistoryStore } from "./historyStore.ts";

function extractNodeText(node: { id: string; properties?: { text?: unknown } }): string {
    const t = node.properties?.text;
    if (typeof t === "string") return t;
    if (typeof t === "object" && t && "value" in t) return String((t as { value: unknown }).value);
    return node.id;
}

export interface EditorState {
    readonly document: RuxDocument | null;
    readonly rawText: string;
    readonly viewMode: ViewMode;
    readonly selectedNodeId: string | null;
    readonly breadcrumbs: readonly BreadcrumbItem[];
    readonly validationResult: DaemonValidationResult;
    readonly daemonStatus: DaemonStatus;
    readonly isDirty: boolean;
    readonly isReadOnly: boolean;
    readonly generatedUiCode: string;
    readonly generatedControllerCode: string;
    readonly uiGeneratedFilename: string;
    readonly controllerFilename: string;
    readonly auxiliaryFiles: readonly GeneratedFile[];
    readonly frameworkVersion: string;
    readonly codegenDiagnostics: readonly CodegenDiagnostic[];
    readonly isGeneratingCode: boolean;
    readonly lastExportResult: DaemonExportCodeResult | null;
    readonly targetLanguage: TargetLanguage;
    readonly targetFramework: TargetFramework;
    readonly isThemeEditorOpen: boolean;
    readonly isAnimationTimelineOpen: boolean;
    readonly isFigmaImportOpen: boolean;
    readonly figmaImportProgress: { readonly step: string; readonly progress: number } | null;
    readonly isImportingFigma: boolean;
    readonly wasmPreviewUrl: string | null;
    readonly isCompilingWasm: boolean;
    readonly wasmError: string | null;
    readonly isNativePreview: boolean;
    readonly importedAssets: readonly {
        readonly alias: string;
        readonly relativePath: string;
        readonly fullPath: string;
        readonly assetType: string;
    }[];

    readonly setInitialDocument: (
        rawText: string,
        document: RuxDocument | null,
        isDirty: boolean,
        isReadOnly: boolean
    ) => void;
    readonly updateDocumentFromExternal: (
        rawText: string,
        document: RuxDocument | null
    ) => void;
    readonly reconcileAstFromCode: (
        document: RuxDocument,
        rawText: string
    ) => void;
    readonly setRawText: (rawText: string) => void;
    readonly setViewMode: (viewMode: ViewMode) => void;
    readonly setSelectedNodeId: (selectedNodeId: string | null) => void;
    readonly setValidationResult: (validationResult: DaemonValidationResult) => void;
    readonly setDaemonStatus: (daemonStatus: DaemonStatus) => void;
    readonly setCodegenResult: (result: DaemonCodegenResult) => void;
    readonly setExportResult: (result: DaemonExportCodeResult) => void;
    readonly setIsGeneratingCode: (isGeneratingCode: boolean) => void;
    readonly setTargetLanguage: (targetLanguage: TargetLanguage) => void;
    readonly setTargetFramework: (targetFramework: TargetFramework) => void;
    readonly setIsThemeEditorOpen: (isOpen: boolean) => void;
    readonly setIsAnimationTimelineOpen: (isOpen: boolean) => void;
    readonly setIsFigmaImportOpen: (isOpen: boolean) => void;
    readonly setFigmaImportProgress: (
        progress: { readonly step: string; readonly progress: number } | null
    ) => void;
    readonly setIsImportingFigma: (isImporting: boolean) => void;
    readonly applyImportedFigmaDocument: (document: RuxDocument) => void;
    readonly setWasmPreviewUrl: (url: string | null) => void;
    readonly setIsCompilingWasm: (isCompiling: boolean) => void;
    readonly setWasmError: (error: string | null) => void;
    readonly setIsNativePreview: (isNative: boolean) => void;
    readonly addImportedAsset: (asset: {
        readonly alias: string;
        readonly relativePath: string;
        readonly fullPath: string;
        readonly assetType: string;
    }) => void;
    readonly frameworkSyncStatus: DaemonFrameworkSyncStatusResult | null;
    readonly isFrameworkSyncModalOpen: boolean;
    readonly isValidationDrawerOpen: boolean;
    readonly setFrameworkSyncStatus: (status: DaemonFrameworkSyncStatusResult) => void;
    readonly resolvedAssets: Readonly<Record<string, { readonly webviewUri: string; readonly exists: boolean }>>;
    readonly setResolvedAssets: (
        assets: Record<string, { readonly webviewUri: string; readonly exists: boolean }>
    ) => void;
    readonly setIsFrameworkSyncModalOpen: (isOpen: boolean) => void;
    readonly setIsValidationDrawerOpen: (isOpen: boolean) => void;
    readonly markClean: () => void;
}

const initialValidationResult: DaemonValidationResult = {
    valid: true,
    errors: [],
};

export const useEditorStore = create<EditorState>((set, get) => ({
    document: null,
    rawText: "",
    viewMode: "scene_builder",
    selectedNodeId: null,
    breadcrumbs: [],
    validationResult: initialValidationResult,
    daemonStatus: "disconnected",
    isDirty: false,
    isReadOnly: false,
    generatedUiCode: "",
    generatedControllerCode: "",
    uiGeneratedFilename: "ui_generated.rs",
    controllerFilename: "controller.rs",
    auxiliaryFiles: [],
    frameworkVersion: "0.13",
    codegenDiagnostics: [],
    isGeneratingCode: false,
    lastExportResult: null,
    targetLanguage: "rust",
    targetFramework: "iced",
    isThemeEditorOpen: false,
    isAnimationTimelineOpen: false,
    isFigmaImportOpen: false,
    figmaImportProgress: null,
    isImportingFigma: false,
    wasmPreviewUrl: null,
    isCompilingWasm: false,
    wasmError: null,
    isNativePreview: false,
    importedAssets: [],
    resolvedAssets: {},
    frameworkSyncStatus: null,
    isFrameworkSyncModalOpen: false,
    isValidationDrawerOpen: false,

    setInitialDocument: (rawText, doc, isDirty, isReadOnly) => {
        let parsed = doc ?? safeParseJson(rawText).document;
        let textToUse = rawText;
        if (!parsed && rawText.trim().length === 0) {
            parsed = createDefaultStarterDocument();
            textToUse = serializeRuxDocument(parsed);
        }
        const selectedId = get().selectedNodeId;
        const breadcrumbs =
            parsed && selectedId
                ? findNodePath(parsed.root, selectedId) ?? []
                : parsed
                ? [
                      {
                          id: parsed.root.id,
                          widgetType: parsed.root.widget_type,
                          name: extractNodeText(parsed.root),
                      },
                  ]
                : [];

        if (parsed) {
            sharedCrdtBridge.syncFromLocalDocument(parsed, CRDT_ORIGIN_INIT);
            useHistoryStore.getState().clear();
        }

        set({
            document: parsed,
            rawText: textToUse,
            isDirty,
            isReadOnly,
            selectedNodeId: selectedId ?? (parsed ? parsed.root.id : null),
            breadcrumbs,
        });
    },

    updateDocumentFromExternal: (rawText, doc) => {
        const parsed = doc ?? safeParseJson(rawText).document;
        const selectedId = get().selectedNodeId;
        const breadcrumbs =
            parsed && selectedId
                ? findNodePath(parsed.root, selectedId) ?? []
                : parsed
                ? [
                      {
                          id: parsed.root.id,
                          widgetType: parsed.root.widget_type,
                          name: extractNodeText(parsed.root),
                      },
                  ]
                : [];

        if (parsed) {
            sharedCrdtBridge.syncFromLocalDocument(parsed, CRDT_ORIGIN_INIT);
            useHistoryStore.getState().clear();
        }

        set({
            document: parsed,
            rawText,
            isDirty: false,
            breadcrumbs,
        });
    },

    reconcileAstFromCode: (doc, rawText) => {
        const currentSelectedId = get().selectedNodeId;
        const targetNodeStillExists =
            currentSelectedId && findNodePath(doc.root, currentSelectedId);

        const activeSelectedId = targetNodeStillExists
            ? currentSelectedId
            : doc.root.id;

        const breadcrumbs = findNodePath(doc.root, activeSelectedId) ?? [
            {
                id: doc.root.id,
                widgetType: doc.root.widget_type,
                name: extractNodeText(doc.root),
            },
        ];

        sharedCrdtBridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);
        useHistoryStore.getState().clear();

        set({
            document: doc,
            rawText,
            selectedNodeId: activeSelectedId,
            breadcrumbs,
            isDirty: false,
        });
    },

    setRawText: (rawText) => {
        const { document } = safeParseJson(rawText);
        const selectedId = get().selectedNodeId;
        const breadcrumbs =
            document && selectedId
                ? findNodePath(document.root, selectedId) ?? get().breadcrumbs
                : get().breadcrumbs;

        if (document) {
            sharedCrdtBridge.syncFromLocalDocument(document);
        }

        set({
            rawText,
            document: document ?? get().document,
            isDirty: true,
            breadcrumbs,
        });
    },

    setViewMode: (viewMode) => {
        if (viewMode === "scene_builder") {
            const currentRaw = get().rawText;
            const parsed = safeParseJson(currentRaw).document;
            if (parsed) {
                const selectedId = get().selectedNodeId;
                const breadcrumbs = selectedId
                    ? findNodePath(parsed.root, selectedId) ?? []
                    : [
                          {
                              id: parsed.root.id,
                              widgetType: parsed.root.widget_type,
                              name: extractNodeText(parsed.root),
                          },
                      ];
                set({
                    viewMode,
                    document: parsed,
                    breadcrumbs,
                });
                return;
            }
        }
        set({ viewMode });
    },

    setSelectedNodeId: (selectedNodeId) => {
        const currentDoc = get().document;
        const breadcrumbs =
            currentDoc && selectedNodeId
                ? findNodePath(currentDoc.root, selectedNodeId) ?? []
                : [];

        sharedCrdtClient.updateSelection(selectedNodeId);

        set({
            selectedNodeId,
            breadcrumbs,
        });
    },

    setValidationResult: (validationResult) => {
        set({ validationResult });
    },

    setDaemonStatus: (daemonStatus) => {
        set({ daemonStatus });
    },

    setCodegenResult: (result) => {
        const fw = result.target_framework ?? get().targetFramework;
        const defaultUi = fw === "fyne" ? "ui_generated.go" : fw === "flet" ? "ui_generated.py" : "ui_generated.rs";
        const defaultCtrl = fw === "fyne" ? "controller.go" : fw === "flet" ? "controller.py" : "controller.rs";

        set({
            generatedUiCode: result.ui_generated_code,
            generatedControllerCode: result.controller_code,
            uiGeneratedFilename: result.ui_generated_filename ?? defaultUi,
            controllerFilename: result.controller_filename ?? defaultCtrl,
            auxiliaryFiles: result.auxiliary_files ?? [],
            frameworkVersion: result.framework_version ?? "",
            codegenDiagnostics: result.diagnostics,
            isGeneratingCode: false,
        });
    },

    setExportResult: (result) => {
        set({
            lastExportResult: result,
            codegenDiagnostics: result.diagnostics,
        });
    },

    setIsGeneratingCode: (isGeneratingCode) => {
        set({ isGeneratingCode });
    },

    setTargetLanguage: (targetLanguage) => {
        set({ targetLanguage });
    },

    setTargetFramework: (targetFramework) => {
        const lang: TargetLanguage =
            targetFramework === "fyne"
                ? "go"
                : targetFramework === "flet"
                ? "python"
                : "rust";

        const defaultUi = targetFramework === "fyne" ? "ui_generated.go" : targetFramework === "flet" ? "ui_generated.py" : "ui_generated.rs";
        const defaultCtrl = targetFramework === "fyne" ? "controller.go" : targetFramework === "flet" ? "controller.py" : "controller.rs";

        set({
            targetFramework,
            targetLanguage: lang,
            uiGeneratedFilename: defaultUi,
            controllerFilename: defaultCtrl,
        });
    },

    setIsThemeEditorOpen: (isThemeEditorOpen) => {
        set({ isThemeEditorOpen });
    },

    setIsAnimationTimelineOpen: (isAnimationTimelineOpen) => {
        set({ isAnimationTimelineOpen });
    },

    setIsFigmaImportOpen: (isFigmaImportOpen) => {
        set({ isFigmaImportOpen });
    },

    setFigmaImportProgress: (figmaImportProgress) => {
        set({ figmaImportProgress });
    },

    setIsImportingFigma: (isImportingFigma) => {
        set({ isImportingFigma });
    },

    applyImportedFigmaDocument: (doc) => {
        const rawText = serializeRuxDocument(doc);
        sharedCrdtBridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);
        useHistoryStore.getState().clear();
        set({
            document: doc,
            rawText,
            selectedNodeId: doc.root.id,
            breadcrumbs: [
                {
                    id: doc.root.id,
                    widgetType: doc.root.widget_type,
                    name: extractNodeText(doc.root),
                },
            ],
            isDirty: true,
            isFigmaImportOpen: false,
            isImportingFigma: false,
            figmaImportProgress: null,
        });
    },

    setWasmPreviewUrl: (url) => set({ wasmPreviewUrl: url }),
    setIsCompilingWasm: (isCompiling) => set({ isCompilingWasm: isCompiling }),
    setWasmError: (error) => set({ wasmError: error }),
    setIsNativePreview: (isNative) => set({ isNativePreview: isNative }),
    addImportedAsset: (asset) =>
        set((state) => ({
            importedAssets: [...state.importedAssets, asset],
        })),
    setFrameworkSyncStatus: (status) => set({ frameworkSyncStatus: status }),
    setIsFrameworkSyncModalOpen: (isOpen) => set({ isFrameworkSyncModalOpen: isOpen }),
    setIsValidationDrawerOpen: (isOpen) => set({ isValidationDrawerOpen: isOpen }),
    setResolvedAssets: (assets) =>
        set((state) => ({
            resolvedAssets: {
                ...state.resolvedAssets,
                ...assets,
            },
        })),

    markClean: () => {
        set({ isDirty: false });
    },
}));

sharedCrdtBridge.setOnRemoteUpdate((remoteDoc) => {
    const rawText = serializeRuxDocument(remoteDoc);
    const selectedId = useEditorStore.getState().selectedNodeId;
    const breadcrumbs =
        selectedId
            ? findNodePath(remoteDoc.root, selectedId) ?? []
            : [
                  {
                      id: remoteDoc.root.id,
                      widgetType: remoteDoc.root.widget_type,
                      name: extractNodeText(remoteDoc.root),
                  },
              ];
    useEditorStore.setState({
        document: remoteDoc,
        rawText,
        breadcrumbs,
    });
});
