import { FC, useState, useCallback, useRef } from "react";
import {
    createDefaultStarterDocument,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { ComponentPalette } from "../panels/ComponentPalette";
import { HierarchyTree } from "../panels/HierarchyTree";
import { InspectorPanel } from "../panels/InspectorPanel";
import { AnimationTimeline } from "../panels/AnimationTimeline";

interface SceneBuilderViewProps {
    readonly onSelectNode?: (nodeId: string) => void;
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

const MIN_LEFT_WIDTH = 180;
const MAX_LEFT_WIDTH = 420;
const DEFAULT_LEFT_WIDTH = 250;

const MIN_RIGHT_WIDTH = 240;
const MAX_RIGHT_WIDTH = 480;
const DEFAULT_RIGHT_WIDTH = 300;

const MIN_LEFT_SPLIT_RATIO = 0.2;
const MAX_LEFT_SPLIT_RATIO = 0.8;
const DEFAULT_LEFT_SPLIT_RATIO = 0.5;

export const SceneBuilderView: FC<SceneBuilderViewProps> = ({
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const setViewMode = useEditorStore((state) => state.setViewMode);
    const setRawText = useEditorStore((state) => state.setRawText);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);

    const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
    const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
    const [leftSplitRatio, setLeftSplitRatio] = useState(DEFAULT_LEFT_SPLIT_RATIO);
    const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
    const [isRightCollapsed, setIsRightCollapsed] = useState(false);

    const leftSidebarRef = useRef<HTMLDivElement>(null);
    const isDraggingLeftRef = useRef(false);
    const isDraggingRightRef = useRef(false);
    const isDraggingSplitRef = useRef(false);

    const handleLeftResizeStart = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            isDraggingLeftRef.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        []
    );

    const handleRightResizeStart = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            isDraggingRightRef.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        []
    );

    const handleSplitResizeStart = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            isDraggingSplitRef.current = true;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        []
    );

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (isDraggingLeftRef.current) {
            const newWidth = Math.max(
                MIN_LEFT_WIDTH,
                Math.min(MAX_LEFT_WIDTH, e.clientX)
            );
            setLeftWidth(newWidth);
        } else if (isDraggingRightRef.current) {
            const newWidth = Math.max(
                MIN_RIGHT_WIDTH,
                Math.min(MAX_RIGHT_WIDTH, window.innerWidth - e.clientX)
            );
            setRightWidth(newWidth);
        } else if (isDraggingSplitRef.current && leftSidebarRef.current) {
            const rect = leftSidebarRef.current.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const newRatio = Math.max(
                MIN_LEFT_SPLIT_RATIO,
                Math.min(MAX_LEFT_SPLIT_RATIO, relativeY / rect.height)
            );
            setLeftSplitRatio(newRatio);
        }
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (isDraggingLeftRef.current) {
            isDraggingLeftRef.current = false;
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                
            }
        }
        if (isDraggingRightRef.current) {
            isDraggingRightRef.current = false;
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                
            }
        }
        if (isDraggingSplitRef.current) {
            isDraggingSplitRef.current = false;
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                
            }
        }
    }, []);

    const handleResetToDefault = useCallback(() => {
        const starter = createDefaultStarterDocument();
        const json = serializeRuxDocument(starter);
        setRawText(json);
        onDocumentChange?.(json, "Reset to Default Template");
        setSelectedNodeId("root");
    }, [setRawText, onDocumentChange, setSelectedNodeId]);

    if (!document) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 font-sans p-6 select-none">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto text-xl">
                        ⚠️
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-zinc-100">No .rux Document Loaded</h2>
                        <p className="text-xs text-zinc-400 mt-1">
                            The document buffer is either empty or contains invalid syntax.
                        </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleResetToDefault}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
                        >
                            Reset to Default Template
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("text")}
                            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
                        >
                            Open in Code Tab to Fix
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="flex-1 flex w-full h-full bg-zinc-950 overflow-hidden relative select-none"
        >
            {!isLeftCollapsed && (
                <aside
                    ref={leftSidebarRef}
                    style={{ width: `${leftWidth}px` }}
                    className="h-full flex flex-col bg-zinc-900 border-r border-zinc-800 shrink-0 overflow-hidden relative"
                >
                    <div
                        style={{ height: `${leftSplitRatio * 100}%` }}
                        className="flex flex-col overflow-hidden"
                    >
                        <ComponentPalette onDocumentChange={onDocumentChange} />
                    </div>

                    <div
                        onPointerDown={handleSplitResizeStart}
                        className="h-1 bg-zinc-800 hover:bg-blue-600 cursor-row-resize shrink-0 transition-colors"
                    />

                    <div
                        style={{ height: `${(1 - leftSplitRatio) * 100}%` }}
                        className="flex flex-col overflow-hidden"
                    >
                        <HierarchyTree onDocumentChange={onDocumentChange} />
                    </div>
                </aside>
            )}

            <div
                onPointerDown={handleLeftResizeStart}
                className="w-1 bg-zinc-800 hover:bg-blue-600 cursor-col-resize shrink-0 transition-colors z-10 relative flex items-center justify-center"
            >
                <button
                    type="button"
                    onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
                    className="absolute -left-2 w-4 h-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-sm flex items-center justify-center z-20 text-[9px]"
                    title={isLeftCollapsed ? "Show Left Panel" : "Hide Left Panel"}
                >
                    {isLeftCollapsed ? "›" : "‹"}
                </button>
            </div>

            <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
                <div className="flex-1 relative overflow-hidden">
                    <ViewportContainer
                        document={document}
                        onDocumentChange={onDocumentChange}
                    />
                </div>
                <AnimationTimeline onDocumentChange={onDocumentChange} />
            </main>

            <div
                onPointerDown={handleRightResizeStart}
                className="w-1 bg-zinc-800 hover:bg-blue-600 cursor-col-resize shrink-0 transition-colors z-10 relative flex items-center justify-center"
            >
                <button
                    type="button"
                    onClick={() => setIsRightCollapsed(!isRightCollapsed)}
                    className="absolute -right-2 w-4 h-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-sm flex items-center justify-center z-20 text-[9px]"
                    title={isRightCollapsed ? "Show Inspector" : "Hide Inspector"}
                >
                    {isRightCollapsed ? "‹" : "›"}
                </button>
            </div>

            {!isRightCollapsed && (
                <aside
                    style={{ width: `${rightWidth}px` }}
                    className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800 shrink-0 overflow-hidden"
                >
                    <InspectorPanel onDocumentChange={onDocumentChange} />
                </aside>
            )}
        </div>
    );
};
