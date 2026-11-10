import { create } from "zustand";
import * as Y from "yjs";
import { sharedCrdtBridge, type CrdtDocumentBridge } from "../crdt/crdtBridge.ts";

export type UndoStackItem = ReturnType<Y.UndoManager["undo"]>;

export interface HistoryState {
    readonly undoManager: Y.UndoManager;
    readonly undoStack: readonly unknown[];
    readonly redoStack: readonly unknown[];
    readonly maxHistory: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly isExecutingHistory: boolean;

    readonly bindUndoManager: (undoManager: Y.UndoManager, bridge?: CrdtDocumentBridge) => void;
    readonly pushCommand: (command?: unknown) => void;
    readonly undo: () => UndoStackItem;
    readonly redo: () => UndoStackItem;
    readonly stopCapturing: () => void;
    readonly clear: () => void;
}

const DEFAULT_MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => {
    let initialUndoManager = sharedCrdtBridge.getUndoManager();
    let cleanupListeners: (() => void) | null = null;

    const setupListeners = (um: Y.UndoManager) => {
        const updateState = () => {
            const { maxHistory } = get();
            if (um.undoStack.length > maxHistory) {
                um.undoStack.splice(0, um.undoStack.length - maxHistory);
            }
            set({
                canUndo: um.canUndo(),
                canRedo: um.canRedo(),
                undoStack: [...um.undoStack],
                redoStack: [...um.redoStack],
            });
        };

        um.on("stack-item-added", updateState);
        um.on("stack-item-popped", updateState);
        um.on("stack-cleared", updateState);
        um.on("stack-item-updated", updateState);

        return () => {
            um.off("stack-item-added", updateState);
            um.off("stack-item-popped", updateState);
            um.off("stack-cleared", updateState);
            um.off("stack-item-updated", updateState);
        };
    };

    cleanupListeners = setupListeners(initialUndoManager);

    return {
        undoManager: initialUndoManager,
        undoStack: [...initialUndoManager.undoStack],
        redoStack: [...initialUndoManager.redoStack],
        maxHistory: DEFAULT_MAX_HISTORY,
        canUndo: initialUndoManager.canUndo(),
        canRedo: initialUndoManager.canRedo(),
        isExecutingHistory: false,

        bindUndoManager: (newUm: Y.UndoManager, _bridge?: CrdtDocumentBridge) => {
            if (cleanupListeners) {
                cleanupListeners();
            }
            cleanupListeners = setupListeners(newUm);
            set({
                undoManager: newUm,
                canUndo: newUm.canUndo(),
                canRedo: newUm.canRedo(),
                undoStack: [...newUm.undoStack],
                redoStack: [...newUm.redoStack],
                isExecutingHistory: false,
            });
        },

        pushCommand: (_command?: unknown) => {
            get().undoManager.stopCapturing();
        },

        undo: () => {
            const { undoManager, isExecutingHistory } = get();
            if (!undoManager.canUndo() || isExecutingHistory) {
                return null;
            }

            set({ isExecutingHistory: true });
            let popped: UndoStackItem = null;
            try {
                popped = undoManager.undo();
                return popped;
            } finally {
                set({
                    isExecutingHistory: false,
                    canUndo: undoManager.canUndo(),
                    canRedo: undoManager.canRedo(),
                    undoStack: [...undoManager.undoStack],
                    redoStack: [...undoManager.redoStack],
                });
            }
        },

        redo: () => {
            const { undoManager, isExecutingHistory } = get();
            if (!undoManager.canRedo() || isExecutingHistory) {
                return null;
            }

            set({ isExecutingHistory: true });
            let popped: UndoStackItem = null;
            try {
                popped = undoManager.redo();
                return popped;
            } finally {
                set({
                    isExecutingHistory: false,
                    canUndo: undoManager.canUndo(),
                    canRedo: undoManager.canRedo(),
                    undoStack: [...undoManager.undoStack],
                    redoStack: [...undoManager.redoStack],
                });
            }
        },

        stopCapturing: () => {
            get().undoManager.stopCapturing();
        },

        clear: () => {
            const { undoManager } = get();
            undoManager.clear();
            set({
                canUndo: false,
                canRedo: false,
                undoStack: [],
                redoStack: [],
                isExecutingHistory: false,
            });
        },
    };
});
