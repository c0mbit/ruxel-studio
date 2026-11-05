import { useEffect } from "react";
import { useHistoryStore } from "../state/historyStore";

interface KeyboardShortcutsOptions {
    readonly onUndo?: () => void;
    readonly onRedo?: () => void;
    readonly onSave?: () => void;
    readonly onDelete?: () => void;
    readonly onDuplicate?: () => void;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutsOptions): void {
    const undo = useHistoryStore((state) => state.undo);
    const redo = useHistoryStore((state) => state.redo);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isInputTarget =
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement;

            const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
            const modifierKey = isMac ? e.metaKey : e.ctrlKey;

            if (modifierKey && e.key.toLowerCase() === "s") {
                e.preventDefault();
                options?.onSave?.();
                return;
            }

            if (isInputTarget) {
                return;
            }

            if (modifierKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                    options?.onRedo?.();
                } else {
                    undo();
                    options?.onUndo?.();
                }
                return;
            }

            if (modifierKey && e.key.toLowerCase() === "y") {
                e.preventDefault();
                redo();
                options?.onRedo?.();
                return;
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                options?.onDelete?.();
                return;
            }

            if (modifierKey && e.key.toLowerCase() === "d") {
                e.preventDefault();
                options?.onDuplicate?.();
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [undo, redo, options]);
}
