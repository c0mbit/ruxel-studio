import { FC, useCallback } from "react";
import { BottomBar } from "./components/BottomBar";
import { SceneBuilderView } from "./components/SceneBuilderView";
import { TextViewer } from "./components/TextViewer";
import { ThemeEditor } from "./panels/ThemeEditor";
import { FigmaImportModal } from "./panels/FigmaImportModal";
import { MultiplayerModal } from "./panels/MultiplayerModal";
import { SavePresetModal } from "./panels/SavePresetModal";
import { FrameworkSyncModal } from "./panels/FrameworkSyncModal";
import { ValidationDrawer } from "./panels/ValidationDrawer";
import { useExtensionIpc } from "./hooks/useExtensionIpc";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDocumentMutation } from "./hooks/useDocumentMutation";
import { useEditorStore } from "./state/editorStore";
import { removeChild, duplicateNode } from "./utils/treeTraversal";
import { collectAllIds } from "./utils/widgetFactory";

export const App: FC = () => {
    const viewMode = useEditorStore((state) => state.viewMode);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const isThemeEditorOpen = useEditorStore((state) => state.isThemeEditorOpen);
    const setIsThemeEditorOpen = useEditorStore((state) => state.setIsThemeEditorOpen);
    const isFigmaImportOpen = useEditorStore((state) => state.isFigmaImportOpen);
    const setIsFigmaImportOpen = useEditorStore((state) => state.setIsFigmaImportOpen);

    const {
        sendDocumentChange,
        sendSelectNode,
        sendValidateRequest,
        sendSwitchViewMode,
        sendRequestSave,
        sendImportFigma,
    } = useExtensionIpc();

    const { executeNodeMutation } = useDocumentMutation(sendDocumentChange);

    const handleHistoryChange = useCallback(() => {
        const currentText = useEditorStore.getState().rawText;
        sendDocumentChange(currentText, "History Rollback");
    }, [sendDocumentChange]);

    const handleDeleteSelected = useCallback(() => {
        const doc = useEditorStore.getState().document;
        if (!doc || !selectedNodeId || selectedNodeId === doc.root.id) {
            return;
        }

        executeNodeMutation(`Delete ${selectedNodeId}`, (root) =>
            removeChild(root, selectedNodeId)
        );
        setSelectedNodeId(doc.root.id);
    }, [selectedNodeId, executeNodeMutation, setSelectedNodeId]);

    const handleDuplicateSelected = useCallback(() => {
        const doc = useEditorStore.getState().document;
        if (!doc || !selectedNodeId || selectedNodeId === doc.root.id) {
            return;
        }

        const allIds = collectAllIds(doc.root);
        executeNodeMutation(`Duplicate ${selectedNodeId}`, (root) =>
            duplicateNode(root, selectedNodeId, allIds)
        );
    }, [selectedNodeId, executeNodeMutation]);

    useKeyboardShortcuts({
        onUndo: handleHistoryChange,
        onRedo: handleHistoryChange,
        onSave: sendRequestSave,
        onDelete: handleDeleteSelected,
        onDuplicate: handleDuplicateSelected,
    });

    return (
        <div className="w-screen h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden select-none">
            <div className="flex-1 flex overflow-hidden">
                {viewMode === "scene_builder" ? (
                    <SceneBuilderView
                        onSelectNode={sendSelectNode}
                        onDocumentChange={sendDocumentChange}
                    />
                ) : (
                    <TextViewer
                        onDocumentChange={sendDocumentChange}
                        onValidateRequest={sendValidateRequest}
                        onRequestSave={sendRequestSave}
                    />
                )}
            </div>

            <BottomBar
                onSwitchMode={sendSwitchViewMode}
                onSelectNode={sendSelectNode}
                onUndo={handleHistoryChange}
                onRedo={handleHistoryChange}
            />

            <ThemeEditor
                isOpen={isThemeEditorOpen}
                onClose={() => setIsThemeEditorOpen(false)}
                onDocumentChange={sendDocumentChange}
            />

            <FigmaImportModal
                isOpen={isFigmaImportOpen}
                onClose={() => setIsFigmaImportOpen(false)}
                onImport={(token, url, nodeId) => {
                    sendImportFigma(token, url, nodeId);
                }}
            />

            <MultiplayerModal />
            <SavePresetModal />
            <FrameworkSyncModal />
            <ValidationDrawer />
        </div>
    );
};

export default App;
