import { FC } from "react";
import type { BreadcrumbItem, DaemonStatus, TargetFramework, ViewMode } from "@ruxel/shared-types";
import { useCrdtStore } from "../state/crdtStore";
import { useEditorStore } from "../state/editorStore";
import { useHistoryStore } from "../state/historyStore";
import { useExtensionIpc } from "../hooks/useExtensionIpc";

interface BottomBarProps {
    readonly onSwitchMode: (mode: ViewMode) => void;
    readonly onSelectNode: (nodeId: string) => void;
    readonly onUndo?: () => void;
    readonly onRedo?: () => void;
}

export const BottomBar: FC<BottomBarProps> = ({
    onSwitchMode,
    onSelectNode,
    onUndo,
    onRedo,
}) => {
    const viewMode = useEditorStore((state) => state.viewMode);
    const setViewMode = useEditorStore((state) => state.setViewMode);
    const breadcrumbs = useEditorStore((state) => state.breadcrumbs);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const validationResult = useEditorStore((state) => state.validationResult);
    const daemonStatus = useEditorStore((state) => state.daemonStatus);
    const rawText = useEditorStore((state) => state.rawText);
    const targetFramework = useEditorStore((state) => state.targetFramework);
    const setTargetFramework = useEditorStore((state) => state.setTargetFramework);
    const targetLanguage = useEditorStore((state) => state.targetLanguage);
    const setIsThemeEditorOpen = useEditorStore((state) => state.setIsThemeEditorOpen);
    const setIsFigmaImportOpen = useEditorStore((state) => state.setIsFigmaImportOpen);
    const setIsFrameworkSyncModalOpen = useEditorStore((state) => state.setIsFrameworkSyncModalOpen);
    const isAnimationTimelineOpen = useEditorStore((state) => state.isAnimationTimelineOpen);
    const setIsAnimationTimelineOpen = useEditorStore((state) => state.setIsAnimationTimelineOpen);
    const isValidationDrawerOpen = useEditorStore((state) => state.isValidationDrawerOpen);
    const setIsValidationDrawerOpen = useEditorStore((state) => state.setIsValidationDrawerOpen);
    const docTheme = useEditorStore((state) => state.document?.theme);
    const connectionStatus = useCrdtStore((state) => state.connectionStatus);
    const peers = useCrdtStore((state) => state.peers);
    const setIsMultiplayerModalOpen = useCrdtStore((state) => state.setIsMultiplayerModalOpen);

    const undo = useHistoryStore((state) => state.undo);
    const redo = useHistoryStore((state) => state.redo);
    const canUndo = useHistoryStore((state) => state.canUndo);
    const canRedo = useHistoryStore((state) => state.canRedo);

    const { sendExportCode } = useExtensionIpc();

    const handleModeClick = (mode: ViewMode) => {
        setViewMode(mode);
        onSwitchMode(mode);
    };

    const handleBreadcrumbClick = (item: BreadcrumbItem) => {
        setSelectedNodeId(item.id);
        onSelectNode(item.id);
    };

    const handleUndoClick = () => {
        undo();
        onUndo?.();
    };

    const handleRedoClick = () => {
        redo();
        onRedo?.();
    };

    const handleExportClick = () => {
        sendExportCode(rawText, undefined, targetLanguage, targetFramework);
    };

    const renderDaemonStatusBadge = (status: DaemonStatus) => {
        let colorClass = "bg-zinc-500";
        let label = "Disconnected";

        switch (status) {
            case "connected":
                colorClass = "bg-emerald-500";
                label = "Connected";
                break;
            case "validating":
                colorClass = "bg-amber-500 animate-pulse";
                label = "Validating";
                break;
            case "error":
                colorClass = "bg-rose-500";
                label = "Error";
                break;
            case "disconnected":
                colorClass = "bg-zinc-500";
                label = "Offline";
                break;
        }

        return (
            <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-300"
                title={`AST Daemon status: ${status}`}
            >
                <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                <span className="font-mono text-[11px]">{label}</span>
            </div>
        );
    };

    const renderValidationBadge = () => {
        if (validationResult.valid && validationResult.errors.length === 0) {
            return (
                <button
                    type="button"
                    onClick={() => setIsValidationDrawerOpen(!isValidationDrawerOpen)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-800/60 text-xs text-emerald-400 transition-colors"
                    title="AST is completely valid (Click to inspect)"
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                        />
                    </svg>
                    <span className="font-mono text-[11px]">Valid</span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setIsValidationDrawerOpen(!isValidationDrawerOpen)}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/60 text-xs text-rose-400 transition-colors animate-pulse"
                title={`${validationResult.errors.length} validation errors found (Click to view and auto-fix)`}
            >
                <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
                <span className="font-mono text-[11px]">
                    {validationResult.errors.length} error{validationResult.errors.length === 1 ? "" : "s"}
                </span>
            </button>
        );
    };

    return (
        <footer className="h-7 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-3 select-none text-xs shrink-0 z-20">
            <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5">
                    <button
                        type="button"
                        onClick={() => handleModeClick("scene_builder")}
                        className={`px-2 py-0.5 rounded transition-colors text-[11px] ${
                            viewMode === "scene_builder"
                                ? "bg-zinc-800 text-zinc-100 font-medium"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        title="Switch to Visual Scene Builder"
                    >
                        Scene Builder
                    </button>
                    <button
                        type="button"
                        onClick={() => handleModeClick("text")}
                        className={`px-2 py-0.5 rounded transition-colors text-[11px] ${
                            viewMode === "text"
                                ? "bg-zinc-800 text-zinc-100 font-medium"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        title="Switch to Raw JSON Code Editor"
                    >
                        Code
                    </button>
                </div>

                <div className="flex items-center gap-1 border-l border-zinc-800 pl-3">
                    <button
                        type="button"
                        onClick={handleUndoClick}
                        disabled={!canUndo}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:hover:bg-transparent"
                        title="Undo (Ctrl+Z)"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 10h10a5 5 0 015 5v2m0 0l-4-4m4 4l4-4"
                            />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={handleRedoClick}
                        disabled={!canRedo}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:hover:bg-transparent"
                        title="Redo (Ctrl+Y)"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M21 10H11a5 5 0 00-5 5v2m0 0l4-4m-4 4l-4-4"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 mx-4 overflow-x-auto flex items-center scrollbar-none">
                {breadcrumbs.length > 0 ? (
                    <nav className="flex items-center gap-1 text-zinc-400">
                        {breadcrumbs.map((crumb, index) => {
                            const isSelected = crumb.id === selectedNodeId;
                            return (
                                <div
                                    key={crumb.id}
                                    className="flex items-center gap-1 whitespace-nowrap"
                                >
                                    {index > 0 && (
                                        <svg
                                            className="w-3 h-3 text-zinc-600"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleBreadcrumbClick(crumb)}
                                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors text-[11px] ${
                                            isSelected
                                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 font-semibold"
                                                : "hover:bg-zinc-800 text-zinc-300"
                                        }`}
                                    >
                                        <span className="text-zinc-500 text-[10px] font-mono">
                                            {crumb.widgetType}
                                        </span>
                                        <span>{crumb.id}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </nav>
                ) : (
                    <span className="text-zinc-600 text-xs italic">
                        No selection
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => setIsAnimationTimelineOpen(!isAnimationTimelineOpen)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs transition-colors ${
                        isAnimationTimelineOpen
                            ? "bg-purple-900/40 border-purple-600/70 text-purple-300"
                            : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
                    }`}
                    title="Toggle Animation Timeline"
                >
                    <span>⏱️</span>
                    <span className="font-mono text-[11px]">Timeline</span>
                </button>

                <button
                    type="button"
                    onClick={() => setIsThemeEditorOpen(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-amber-300 transition-colors"
                    title="Open Theme & Design System Builder"
                >
                    <span>🎨</span>
                    <span className="font-mono text-[11px]">Theme</span>
                </button>

                <button
                    type="button"
                    onClick={() => setIsFigmaImportOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs transition-colors bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-rose-300"
                    title="Import Figma Frame to Rust AST"
                >
                    <span className="font-bold text-[10px] bg-gradient-to-tr from-rose-500 to-indigo-500 text-white rounded px-1">
                        F
                    </span>
                    <span className="font-mono text-[11px]">Figma</span>
                </button>

                <button
                    type="button"
                    onClick={() => setIsFrameworkSyncModalOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs transition-colors bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-emerald-400"
                    title="Open Framework Sync Status (AI-Driven Framework Sync)"
                >
                    <span>⚡</span>
                    <span className="font-mono text-[11px]">AI Sync</span>
                </button>

                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded">
                    <select
                        value={targetFramework}
                        onChange={(e) => setTargetFramework(e.target.value as TargetFramework)}
                        className="bg-transparent text-[11px] font-mono text-zinc-300 px-1.5 py-0.5 outline-none border-r border-zinc-800 cursor-pointer"
                        title="Select Target Framework for Code Export"
                    >
                        <option value="iced" className="bg-zinc-900 text-zinc-200">ICED (Rust)</option>
                        <option value="egui" className="bg-zinc-900 text-zinc-200">EGUI (Rust)</option>
                        <option value="slint" className="bg-zinc-900 text-zinc-200">SLINT (Rust)</option>
                        <option value="dioxus" className="bg-zinc-900 text-zinc-200">DIOXUS (Rust)</option>
                        <option value="fyne" className="bg-zinc-900 text-zinc-200">FYNE (Go)</option>
                        <option value="flet" className="bg-zinc-900 text-zinc-200">FLET (Python)</option>
                    </select>
                    <button
                        type="button"
                        onClick={handleExportClick}
                        className="flex items-center gap-1 px-2 py-0.5 hover:bg-zinc-800 text-xs text-emerald-400 transition-colors"
                        title={`Export ${targetFramework} code to workspace`}
                    >
                        <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                        </svg>
                        <span className="font-mono text-[11px] uppercase">Export</span>
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setIsMultiplayerModalOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs transition-colors bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
                    title="Open Multiplayer Collaboration (CRDT)"
                >
                    <span
                        className={`w-2 h-2 rounded-full ${
                            connectionStatus === "connected"
                                ? "bg-sky-400 animate-pulse"
                                : connectionStatus === "connecting"
                                ? "bg-amber-400 animate-pulse"
                                : "bg-zinc-600"
                        }`}
                    />
                    <span className="font-mono text-[11px]">
                        {connectionStatus === "connected"
                            ? `Live (${peers.length + 1})`
                            : connectionStatus === "connecting"
                            ? "Connecting"
                            : "Offline"}
                    </span>
                </button>
                {renderValidationBadge()}
                {renderDaemonStatusBadge(daemonStatus)}
            </div>
        </footer>
    );
};
