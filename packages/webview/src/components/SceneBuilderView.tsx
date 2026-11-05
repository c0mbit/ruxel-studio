import { FC, useState, useCallback, useRef } from "react";
import { useEditorStore } from "../state/editorStore";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { ComponentPalette } from "../panels/ComponentPalette";
import { HierarchyTree } from "../panels/HierarchyTree";
import { InspectorPanel } from "../panels/InspectorPanel";
import { ThemeEditor } from "../panels/ThemeEditor";
import { AnimationTimeline } from "../panels/AnimationTimeline";
import { FigmaImportModal } from "../panels/FigmaImportModal";
import { MultiplayerModal } from "../panels/MultiplayerModal";
import { SavePresetModal } from "../panels/SavePresetModal";
import { FrameworkSyncModal } from "../panels/FrameworkSyncModal";
import { useExtensionIpc } from "../hooks/useExtensionIpc";

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
    const isThemeEditorOpen = useEditorStore((state) => state.isThemeEditorOpen);
    const setIsThemeEditorOpen = useEditorStore((state) => state.setIsThemeEditorOpen);
    const isFigmaImportOpen = useEditorStore((state) => state.isFigmaImportOpen);
    const setIsFigmaImportOpen = useEditorStore((state) => state.setIsFigmaImportOpen);
    const { sendImportFigma } = useExtensionIpc();

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

    if (!document) {
        return (
            <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-500 font-sans text-sm">
                No .rux document loaded
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

            <ThemeEditor
                isOpen={isThemeEditorOpen}
                onClose={() => setIsThemeEditorOpen(false)}
                onDocumentChange={onDocumentChange}
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
        </div>
    );
};
