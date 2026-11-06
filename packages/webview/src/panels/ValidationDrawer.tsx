import React, { FC } from "react";
import { createDefaultStarterDocument, type DaemonValidationError } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useExtensionIpc } from "../hooks/useExtensionIpc";

export const ValidationDrawer: FC = () => {
    const isOpen = useEditorStore((state) => state.isValidationDrawerOpen);
    const setIsOpen = useEditorStore((state) => state.setIsValidationDrawerOpen);
    const validationResult = useEditorStore((state) => state.validationResult);
    const setInitialDocument = useEditorStore((state) => state.setInitialDocument);
    const setViewMode = useEditorStore((state) => state.setViewMode);
    const { sendDocumentChange, sendSwitchViewMode } = useExtensionIpc();

    if (!isOpen) {
        return null;
    }

    const errors: readonly DaemonValidationError[] = validationResult.errors;

    const handleReset = () => {
        const starter = createDefaultStarterDocument();
        const starterText = JSON.stringify(starter, null, 2);
        setInitialDocument(starterText, starter, true, false);
        sendDocumentChange(starterText, "Reset to default template");
        setIsOpen(false);
    };

    const handleOpenInCode = () => {
        setViewMode("text");
        sendSwitchViewMode("text");
        setIsOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
            <div className="w-[560px] max-h-[80vh] flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-4 py-3 bg-zinc-800/80 border-b border-zinc-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${errors.length > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                        <h3 className="text-sm font-semibold text-zinc-100">
                            {errors.length > 0 ? `Document Validation (${errors.length} issue${errors.length > 1 ? "s" : ""})` : "Document Validation"}
                        </h3>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-700/60 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[50vh] space-y-2">
                    {errors.length === 0 ? (
                        <div className="p-4 rounded border border-emerald-900/40 bg-emerald-950/20 text-emerald-400 text-xs flex items-center gap-2">
                            <span>✓</span>
                            <span>Document schema and widget structure are valid. Zero syntax or validation errors found.</span>
                        </div>
                    ) : (
                        errors.map((error: DaemonValidationError, idx: number) => (
                            <div
                                key={`${error.code}-${idx}`}
                                className="p-2.5 rounded bg-red-950/30 border border-red-900/50 text-red-300 font-mono text-xs break-all"
                            >
                                <div className="font-semibold text-red-200">{error.code}</div>
                                <div className="mt-0.5">{error.message}</div>
                                {(error.line !== undefined || error.column !== undefined) && (
                                    <div className="text-[10px] text-red-400/80 mt-1">
                                        Line {error.line ?? 1}, Column {error.column ?? 1}
                                        {error.nodeId ? ` (Node: #${error.nodeId})` : ""}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="px-4 py-3 bg-zinc-950/60 border-t border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        {errors.length > 0 && (
                            <button
                                onClick={handleReset}
                                className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                            >
                                Reset to Default Template
                            </button>
                        )}
                        <button
                            onClick={handleOpenInCode}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                        >
                            Open in Code Tab
                        </button>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};