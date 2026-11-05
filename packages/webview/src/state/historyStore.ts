import { create } from "zustand";
import type { Command } from "../history/types";

export interface HistoryState {
    readonly undoStack: readonly Command[];
    readonly redoStack: readonly Command[];
    readonly maxHistory: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly isExecutingHistory: boolean;

    readonly pushCommand: (command: Command) => void;
    readonly undo: () => Command | null;
    readonly redo: () => Command | null;
    readonly clear: () => void;
}

const DEFAULT_MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
    undoStack: [],
    redoStack: [],
    maxHistory: DEFAULT_MAX_HISTORY,
    canUndo: false,
    canRedo: false,
    isExecutingHistory: false,

    pushCommand: (command: Command) => {
        const { isExecutingHistory, undoStack, maxHistory } = get();
        if (isExecutingHistory) {
            return;
        }

        const nextUndo = [...undoStack, command];
        if (nextUndo.length > maxHistory) {
            nextUndo.shift();
        }

        set({
            undoStack: nextUndo,
            redoStack: [],
            canUndo: true,
            canRedo: false,
        });
    },

    undo: () => {
        const { undoStack, redoStack, isExecutingHistory } = get();
        if (undoStack.length === 0 || isExecutingHistory) {
            return null;
        }

        const nextUndo = [...undoStack];
        const command = nextUndo.pop();
        if (!command) {
            return null;
        }

        set({ isExecutingHistory: true });
        try {
            command.undo();
        } finally {
            const nextRedo = [...redoStack, command];
            set({
                undoStack: nextUndo,
                redoStack: nextRedo,
                canUndo: nextUndo.length > 0,
                canRedo: true,
                isExecutingHistory: false,
            });
        }

        return command;
    },

    redo: () => {
        const { undoStack, redoStack, isExecutingHistory } = get();
        if (redoStack.length === 0 || isExecutingHistory) {
            return null;
        }

        const nextRedo = [...redoStack];
        const command = nextRedo.pop();
        if (!command) {
            return null;
        }

        set({ isExecutingHistory: true });
        try {
            command.redo();
        } finally {
            const nextUndo = [...undoStack, command];
            set({
                undoStack: nextUndo,
                redoStack: nextRedo,
                canUndo: true,
                canRedo: nextRedo.length > 0,
                isExecutingHistory: false,
            });
        }

        return command;
    },

    clear: () => {
        set({
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
            isExecutingHistory: false,
        });
    },
}));

