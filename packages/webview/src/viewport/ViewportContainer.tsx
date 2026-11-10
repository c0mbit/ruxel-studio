import { FC, useEffect, useRef, useState, useCallback } from "react";
import {
    type RuxDocument,
    type WidgetNode,
    type WidgetType,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { DocumentMutationCommand } from "../history/types";
import { useCrdtStore } from "../state/crdtStore";
import { useEditorStore } from "../state/editorStore";
import { useHistoryStore } from "../state/historyStore";
import {
    useViewportStore,
    calculateProportionalScale,
    type DevicePreset,
} from "../state/viewportStore";
import { findNodeById, insertChild, normalizeWidgetNode } from "../utils/treeTraversal";
import {
    collectAllIds,
    createDefaultWidgetNode,
    getWidgetTypeLabel,
    isContainerWidget,
} from "../utils/widgetFactory";
import { CanvasOverlay } from "./CanvasOverlay";
import { DomWidgetRenderer } from "./DomWidgetRenderer";
import { ViewportControlsToolbar } from "./ViewportControlsToolbar";
import {
    applyResizeDelta,
    findHandleAtScreenPoint,
    screenToWorld,
} from "./geometry";
import { computeSnapping } from "./snapping";
import type { Point, Rect, ResizeHandleType } from "./types";
import { useExtensionIpc } from "../hooks/useExtensionIpc";

interface ViewportContainerProps {
    readonly document: RuxDocument;
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

export const ViewportContainer: FC<ViewportContainerProps> = ({
    document,
    onDocumentChange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
        width: 800,
        height: 600,
    });
    const [cursorCoords, setCursorCoords] = useState<Point>({ x: 0, y: 0 });

    const camera = useViewportStore((state) => state.camera);
    const setCamera = useViewportStore((state) => state.setCamera);
    const zoomAt = useViewportStore((state) => state.zoomAt);
    const panBy = useViewportStore((state) => state.panBy);
    const fitToScreen = useViewportStore((state) => state.fitToScreen);
    const resetZoom = useViewportStore((state) => state.resetZoom);
    const isPanning = useViewportStore((state) => state.isPanning);
    const setIsPanning = useViewportStore((state) => state.setIsPanning);
    const isSpacePressed = useViewportStore((state) => state.isSpacePressed);
    const setSpacePressed = useViewportStore((state) => state.setSpacePressed);

    const showGrid = useViewportStore((state) => state.showGrid);
    const setShowGrid = useViewportStore((state) => state.setShowGrid);
    const snapToGrid = useViewportStore((state) => state.snapToGrid);
    const setSnapToGrid = useViewportStore((state) => state.setSnapToGrid);
    const snapToObjects = useViewportStore((state) => state.snapToObjects);
    const setSnapToObjects = useViewportStore((state) => state.setSnapToObjects);
    const showRulers = useViewportStore((state) => state.showRulers);
    const setShowRulers = useViewportStore((state) => state.setShowRulers);
    const gridSize = useViewportStore((state) => state.gridSize);

    const activeDrag = useViewportStore((state) => state.activeDrag);
    const startDrag = useViewportStore((state) => state.startDrag);
    const updateDrag = useViewportStore((state) => state.updateDrag);
    const endDrag = useViewportStore((state) => state.endDrag);
    const nodeBounds = useViewportStore((state) => state.nodeBounds);

    const setPreviewScale = useViewportStore((state) => state.setPreviewScale);
    const getEffectiveDimensions = useViewportStore(
        (state) => state.getEffectiveDimensions
    );
    const effectiveDimensions = getEffectiveDimensions();

    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const setRawText = useEditorStore((state) => state.setRawText);
    const setLocalCursor = useCrdtStore((state) => state.setLocalCursor);
    const isNativePreview = useEditorStore((state) => state.isNativePreview);
    const setIsNativePreview = useEditorStore((state) => state.setIsNativePreview);
    const wasmPreviewUrl = useEditorStore((state) => state.wasmPreviewUrl);
    const isCompilingWasm = useEditorStore((state) => state.isCompilingWasm);
    const wasmError = useEditorStore((state) => state.wasmError);
    const targetFramework = useEditorStore((state) => state.targetFramework);
    const { sendCompileWasm, sendImportAsset } = useExtensionIpc();

    const pushCommand = useHistoryStore((state) => state.pushCommand);
    const undo = useHistoryStore((state) => state.undo);
    const redo = useHistoryStore((state) => state.redo);
    const canUndo = useHistoryStore((state) => state.canUndo);
    const canRedo = useHistoryStore((state) => state.canRedo);

    const panStartRef = useRef<Point | null>(null);
    const dragStartDocRef = useRef<RuxDocument | null>(null);
    const dragStartRectRef = useRef<Rect | null>(null);

    const fitAndCenterPreset = useCallback(
        (width: number, height: number, force = false) => {
            if (!force && !useViewportStore.getState().autoFitScale) {
                return;
            }
            const containerW = containerSize.width;
            const containerH = containerSize.height;
            if (containerW <= 0 || containerH <= 0) return;

            const scale = calculateProportionalScale(
                containerW,
                containerH,
                width,
                height,
                48
            );
            const panX = Math.round((containerW - width * scale) / 2);
            const panY = Math.max(24, Math.round((containerH - height * scale) / 2));

            setCamera(panX, panY, scale);
            setPreviewScale(scale);
        },
        [containerSize, setCamera, setPreviewScale]
    );

    const handlePresetSelected = useCallback(
        (_preset: DevicePreset) => {
            const nextEffective = useViewportStore.getState().getEffectiveDimensions();
            fitAndCenterPreset(nextEffective.width, nextEffective.height, true);
        },
        [fitAndCenterPreset]
    );

    useEffect(() => {
        setPreviewScale(camera.zoom);
    }, [camera.zoom, setPreviewScale]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setContainerSize({ width: rect.width, height: rect.height });
            }
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(container);

        return () => {
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
                setSpacePressed(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                setSpacePressed(false);
                setIsPanning(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [setSpacePressed, setIsPanning]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();

        const container = containerRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();
        const cursorScreen: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        if (e.ctrlKey || e.metaKey) {
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
            zoomAt(cursorScreen, zoomFactor);
        } else {
            panBy(-e.deltaX, -e.deltaY);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();
        const screenPoint: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        const isMiddleClick = e.button === 1;
        const isSpaceDrag = e.button === 0 && isSpacePressed;

        if (isMiddleClick || isSpaceDrag) {
            e.preventDefault();
            setIsPanning(true);
            panStartRef.current = { x: e.clientX, y: e.clientY };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
        }

        if (e.button === 0) {
            if (selectedNodeId) {
                const currentBounds = nodeBounds.get(selectedNodeId);
                if (currentBounds) {
                    const hitHandle = findHandleAtScreenPoint(
                        screenPoint,
                        currentBounds.rect,
                        camera,
                        8
                    );

                    if (hitHandle) {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);

                        dragStartDocRef.current = document;
                        dragStartRectRef.current = currentBounds.rect;

                        startDrag({
                            type: "resize",
                            nodeId: selectedNodeId,
                            handle: hitHandle.type,
                            startPoint: screenPoint,
                            initialRect: currentBounds.rect,
                            currentRect: currentBounds.rect,
                        });
                        return;
                    }
                }
            }

            const target = e.target as HTMLElement;
            const nodeEl = target.closest<HTMLElement>("[data-node-id]");

            if (nodeEl) {
                const nodeId = nodeEl.getAttribute("data-node-id");
                if (nodeId) {
                    setSelectedNodeId(nodeId);
                    const bounds = nodeBounds.get(nodeId);
                    if (bounds) {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);

                        dragStartDocRef.current = document;
                        dragStartRectRef.current = bounds.rect;

                        startDrag({
                            type: "move",
                            nodeId,
                            startPoint: screenPoint,
                            initialRect: bounds.rect,
                            currentRect: bounds.rect,
                        });
                        return;
                    }
                }
            } else {
                setSelectedNodeId(null);
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();
        const screenPoint: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        const worldCoord = screenToWorld(screenPoint, camera);
        const roundedX = Math.round(worldCoord.x);
        const roundedY = Math.round(worldCoord.y);
        setCursorCoords({
            x: roundedX,
            y: roundedY,
        });
        setLocalCursor({ x: roundedX, y: roundedY });

        if (isPanning && panStartRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            panStartRef.current = { x: e.clientX, y: e.clientY };
            panBy(dx, dy);
            return;
        }

        if (activeDrag) {
            const deltaScreenX = screenPoint.x - activeDrag.startPoint.x;
            const deltaScreenY = screenPoint.y - activeDrag.startPoint.y;
            const deltaWorldX = deltaScreenX / camera.zoom;
            const deltaWorldY = deltaScreenY / camera.zoom;

            let candidateRect: Rect;

            if (activeDrag.type === "move") {
                candidateRect = {
                    x: activeDrag.initialRect.x + deltaWorldX,
                    y: activeDrag.initialRect.y + deltaWorldY,
                    width: activeDrag.initialRect.width,
                    height: activeDrag.initialRect.height,
                };
            } else {
                candidateRect = applyResizeDelta(
                    activeDrag.handle,
                    activeDrag.initialRect,
                    deltaWorldX,
                    deltaWorldY
                );
            }

            const targetBounds = nodeBounds.get(activeDrag.nodeId);
            const parentRect: Rect | null =
                targetBounds?.parentId && nodeBounds.has(targetBounds.parentId)
                    ? nodeBounds.get(targetBounds.parentId)!.rect
                    : {
                          x: 0,
                          y: 0,
                          width: document.window.initial_width,
                          height: document.window.initial_height,
                      };

            const siblingRects: Rect[] = [];
            for (const [id, nb] of nodeBounds) {
                if (id !== activeDrag.nodeId && id !== targetBounds?.parentId) {
                    siblingRects.push(nb.rect);
                }
            }

            const snappingResult = computeSnapping(
                candidateRect,
                parentRect,
                siblingRects,
                {
                    snapToGrid,
                    snapToObjects,
                    gridSize,
                    threshold: 6 / camera.zoom,
                }
            );

            updateDrag(
                snappingResult.snappedRect,
                snappingResult.guides,
                snappingResult.distanceIndicators
            );
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isPanning) {
            setIsPanning(false);
            panStartRef.current = null;
            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                
            }
            return;
        }

        if (activeDrag) {
            const finalRect = activeDrag.currentRect;
            const nodeId = activeDrag.nodeId;
            const initialRect = dragStartRectRef.current ?? activeDrag.initialRect;
            const initialDoc = dragStartDocRef.current ?? document;

            const hasChanged =
                Math.round(finalRect.x) !== Math.round(initialRect.x) ||
                Math.round(finalRect.y) !== Math.round(initialRect.y) ||
                Math.round(finalRect.width) !== Math.round(initialRect.width) ||
                Math.round(finalRect.height) !== Math.round(initialRect.height);

            if (hasChanged) {
                const updatedRoot = updateNodeRecursive(
                    initialDoc.root,
                    nodeId,
                    finalRect
                );
                const updatedDoc: RuxDocument = {
                    ...initialDoc,
                    root: updatedRoot,
                };

                const description =
                    activeDrag.type === "move"
                        ? `Move ${nodeId}`
                        : `Resize ${nodeId}`;

                const applyDoc = (docToApply: RuxDocument, summary: string) => {
                    const updatedJson = serializeRuxDocument(docToApply);
                    setRawText(updatedJson);
                    if (onDocumentChange) {
                        onDocumentChange(updatedJson, summary);
                    }
                };

                const command = new DocumentMutationCommand(
                    description,
                    initialDoc,
                    updatedDoc,
                    applyDoc
                );

                pushCommand(command);
                command.execute();
            }

            endDrag();
            dragStartDocRef.current = null;
            dragStartRectRef.current = null;

            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                
            }
        }
    };

    const handleCanvasDragOver = (e: React.DragEvent) => {
        if (
            e.dataTransfer.types.includes("application/ruxel-widget-type") ||
            e.dataTransfer.types.includes("application/ruxel-preset-json")
        ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        }
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        const widgetType = e.dataTransfer.getData(
            "application/ruxel-widget-type"
        ) as WidgetType;
        const presetJson = e.dataTransfer.getData(
            "application/ruxel-preset-json"
        );
        const hasFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;

        if (!widgetType && !presetJson && !hasFiles) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const container = containerRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();
        const screenPoint: Point = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        const worldCoord = screenToWorld(screenPoint, camera);
        const existingIds = collectAllIds(document.root);

        let newNode: WidgetNode;
        let mutationDescription: string;

        if (hasFiles) {
            const file = e.dataTransfer.files[0];
            const lowerName = file.name.toLowerCase();
            const isImage =
                lowerName.endsWith(".png") ||
                lowerName.endsWith(".jpg") ||
                lowerName.endsWith(".jpeg") ||
                lowerName.endsWith(".svg") ||
                lowerName.endsWith(".webp");
            const isFont =
                lowerName.endsWith(".ttf") ||
                lowerName.endsWith(".otf") ||
                lowerName.endsWith(".woff") ||
                lowerName.endsWith(".woff2");
            const assetType = isFont ? "font" : "image";

            const reader = new FileReader();
            reader.onload = () => {
                const b64Data = (reader.result as string).split(",")[1];
                sendImportAsset(file.name, assetType, b64Data);
            };
            reader.readAsDataURL(file);

            let baseId = file.name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
            let count = 1;
            let id = `asset_${baseId}`;
            while (existingIds.has(id)) {
                id = `asset_${baseId}_${count++}`;
            }

            if (isImage) {
                newNode = {
                    id,
                    widget_type: "rectangle" as WidgetType,
                    properties: {
                        background_color: "#27272a",
                        border_color: "#3f3f46",
                        border_width: 1,
                        corner_radius: 6,
                        text: file.name,
                        custom_properties: {
                            image_path: `assets/${file.name}`,
                        },
                    },
                    layout: {
                        dimensions: {
                            width: { type: "fixed", value: 200 },
                            height: { type: "fixed", value: 150 },
                        },
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                };
                mutationDescription = `Import Image Asset: ${file.name}`;
            } else {
                newNode = {
                    id,
                    widget_type: "label" as WidgetType,
                    properties: {
                        text: `Sample Font (${file.name})`,
                        font_size: 16,
                        font_alias: file.name.split(".")[0],
                    },
                    layout: {
                        dimensions: {
                            width: { type: "fixed", value: 240 },
                            height: { type: "fixed", value: 40 },
                        },
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                };
                mutationDescription = `Import Font Asset: ${file.name}`;
            }
        } else if (presetJson) {
            try {
                const parsedNode = normalizeWidgetNode(JSON.parse(presetJson) as Record<string, unknown>);
                newNode = regenerateNodeIds(parsedNode, existingIds);
                mutationDescription = `Insert Cloud Preset: ${newNode.id}`;
            } catch {
                return;
            }
        } else {
            newNode = createDefaultWidgetNode(widgetType, existingIds);
            mutationDescription = `Insert ${getWidgetTypeLabel(widgetType)}`;
        }

        const nodeWithPosition: WidgetNode = {
            ...newNode,
            layout: {
                ...newNode.layout,
                absolute: {
                    x: Math.round(worldCoord.x),
                    y: Math.round(worldCoord.y),
                },
            },
        };

        let targetParentId = document.root.id;
        const targetEl = (e.target as HTMLElement).closest("[data-node-id]");
        if (targetEl) {
            const targetId = targetEl.getAttribute("data-node-id");
            if (targetId) {
                const targetNode = findNodeById(document.root, targetId);
                if (targetNode && isContainerWidget(targetNode.widget_type)) {
                    targetParentId = targetId;
                }
            }
        }

        const updatedRoot = insertChild(
            document.root,
            targetParentId,
            nodeWithPosition
        );
        const updatedDoc: RuxDocument = {
            ...document,
            root: updatedRoot,
        };

        const applyDoc = (docToApply: RuxDocument, summary: string) => {
            const updatedJson = serializeRuxDocument(docToApply);
            setRawText(updatedJson);
            if (onDocumentChange) {
                onDocumentChange(updatedJson, summary);
            }
        };

        const command = new DocumentMutationCommand(
            mutationDescription,
            document,
            updatedDoc,
            applyDoc
        );

        pushCommand(command);
        command.execute();
        setSelectedNodeId(newNode.id);
    };

    const targetWindowRect: Rect = {
        x: 0,
        y: 0,
        width: effectiveDimensions.width,
        height: effectiveDimensions.height,
    };

    const getCursorStyle = (): string => {
        if (isPanning || isSpacePressed) {
            return isPanning ? "grabbing" : "grab";
        }
        if (activeDrag) {
            if (activeDrag.type === "move") {
                return "move";
            }
            return getHandleCursor(activeDrag.handle);
        }
        return "default";
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden relative select-none">
            {/* Directive 1: Responsive Design Viewport Controls Toolbar */}
            <ViewportControlsToolbar onPresetSelected={handlePresetSelected} />

            <header className="h-9 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0 text-xs z-20">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            undo();
                            if (onDocumentChange) {
                                const currentText = useEditorStore.getState().rawText;
                                onDocumentChange(currentText, "Undo");
                            }
                        }}
                        disabled={!canUndo}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
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
                                transform="scale(-1, 1) translate(-24, 0)"
                            />
                        </svg>
                        Undo
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            redo();
                            if (onDocumentChange) {
                                const currentText = useEditorStore.getState().rawText;
                                onDocumentChange(currentText, "Redo");
                            }
                        }}
                        disabled={!canRedo}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
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
                                d="M3 10h10a5 5 0 015 5v2m0 0l-4-4m4 4l4-4"
                            />
                        </svg>
                        Redo
                    </button>

                    <div className="h-4 w-px bg-zinc-800 mx-1" />

                    <button
                        type="button"
                        onClick={() =>
                            zoomAt(
                                {
                                    x: containerSize.width / 2,
                                    y: containerSize.height / 2,
                                },
                                0.8
                            )
                        }
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs border border-zinc-700/60 transition-colors"
                        title="Zoom out"
                    >
                        -
                    </button>
                    <span className="w-14 text-center font-mono text-zinc-200 text-xs">
                        {Math.round(camera.zoom * 100)}%
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            zoomAt(
                                {
                                    x: containerSize.width / 2,
                                    y: containerSize.height / 2,
                                },
                                1.25
                            )
                        }
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs border border-zinc-700/60 transition-colors"
                        title="Zoom in"
                    >
                        +
                    </button>

                    <div className="h-4 w-px bg-zinc-800 mx-1" />

                    <button
                        type="button"
                        onClick={() =>
                            fitToScreen(
                                containerSize.width,
                                containerSize.height,
                                targetWindowRect.width,
                                targetWindowRect.height
                            )
                        }
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700/60 transition-colors"
                        title="Fit window to screen"
                    >
                        Fit to Screen
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            resetZoom(
                                containerSize.width,
                                containerSize.height,
                                targetWindowRect.width,
                                targetWindowRect.height
                            )
                        }
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700/60 transition-colors"
                        title="Reset zoom to 100%"
                    >
                        100%
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowGrid(!showGrid)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            showGrid
                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400 font-medium"
                                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                        }`}
                    >
                        Grid
                    </button>

                    <button
                        type="button"
                        onClick={() => setSnapToGrid(!snapToGrid)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            snapToGrid
                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400 font-medium"
                                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                        }`}
                    >
                        Snap Grid
                    </button>

                    <button
                        type="button"
                        onClick={() => setSnapToObjects(!snapToObjects)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            snapToObjects
                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400 font-medium"
                                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                        }`}
                    >
                        Snap Objects
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowRulers(!showRulers)}
                        className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                            showRulers
                                ? "bg-blue-600/20 border-blue-500/50 text-blue-400 font-medium"
                                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                        }`}
                    >
                        Rulers
                    </button>

                    <div className="h-4 w-px bg-zinc-800 mx-1" />

                    <button
                        type="button"
                        onClick={() => {
                            const next = !isNativePreview;
                            setIsNativePreview(next);
                            if (next) {
                                sendCompileWasm(
                                    serializeRuxDocument(document),
                                    targetFramework
                                );
                            }
                        }}
                        className={`px-2.5 py-0.5 rounded text-xs border flex items-center gap-1.5 transition-colors ${
                            isNativePreview
                                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400 font-medium"
                                : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200"
                        }`}
                        title="Toggle Wasm Native Preview (Zero-Mockup Rendering)"
                    >
                        <span className={isCompilingWasm ? "animate-spin" : ""}>
                            {isCompilingWasm ? "⚙️" : "⚡"}
                        </span>
                        <span>{isNativePreview ? "Native Wasm: ON" : "Native Wasm"}</span>
                        {isNativePreview && wasmPreviewUrl && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                    </button>

                    <div className="h-4 w-px bg-zinc-800 mx-1" />

                    <div className="font-mono text-[11px] text-zinc-400 min-w-[120px] text-right">
                        X: {cursorCoords.x} &nbsp; Y: {cursorCoords.y}
                    </div>
                </div>
            </header>

            <main
                ref={containerRef}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setLocalCursor(null)}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                className="flex-1 w-full h-full relative overflow-hidden bg-zinc-950"
                style={{ cursor: getCursorStyle() }}
            >
                {isNativePreview ? (
                    <div
                        className="absolute inset-0 flex items-center justify-center p-8 pointer-events-auto"
                        style={{
                            transform: `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`,
                            transformOrigin: "0 0",
                        }}
                    >
                        {wasmPreviewUrl ? (
                            <iframe
                                src={wasmPreviewUrl}
                                title="Ruxel Wasm Native Preview"
                                sandbox="allow-scripts allow-same-origin"
                                className="rounded-lg shadow-2xl border border-zinc-700 bg-zinc-900"
                                style={{
                                    width: `${targetWindowRect.width}px`,
                                    height: `${targetWindowRect.height}px`,
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-300">
                                <div className="animate-spin text-2xl">⚙️</div>
                                <div className="text-sm font-medium">
                                    Compiling Wasm Native Preview...
                                </div>
                                {wasmError && (
                                    <div className="text-xs text-rose-400 max-w-md text-center">
                                        {wasmError}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <DomWidgetRenderer
                            document={document}
                            onDocumentChange={onDocumentChange}
                        />

                        <CanvasOverlay
                            width={containerSize.width}
                            height={containerSize.height}
                            targetWindowRect={targetWindowRect}
                        />
                    </>
                )}
            </main>
        </div>
    );
};

function getHandleCursor(handle: ResizeHandleType): string {
    switch (handle) {
        case "nw":
        case "se":
            return "nwse-resize";
        case "ne":
        case "sw":
            return "nesw-resize";
        case "n":
        case "s":
            return "ns-resize";
        case "e":
        case "w":
            return "ew-resize";
    }
}

function updateNodeRecursive(
    node: WidgetNode,
    targetId: string,
    newRect: Rect
): WidgetNode {
    if (node.id === targetId) {
        const currentLayout = node.layout ?? {};
        const currentAbsolute = currentLayout.absolute;
        const currentDimensions = currentLayout.dimensions ?? {};

        const updatedLayout = {
            ...currentLayout,
            absolute: currentAbsolute
                ? {
                      ...currentAbsolute,
                      x: newRect.x,
                      y: newRect.y,
                  }
                : {
                      x: newRect.x,
                      y: newRect.y,
                  },
            dimensions: {
                ...currentDimensions,
                width: { type: "fixed" as const, value: newRect.width },
                height: { type: "fixed" as const, value: newRect.height },
            },
        };

        return {
            ...node,
            layout: updatedLayout,
        };
    }

    if (node.children) {
        return {
            ...node,
            children: node.children.map((child) =>
                updateNodeRecursive(child, targetId, newRect)
            ),
        };
    }

    return node;
}

function regenerateNodeIds(
    node: WidgetNode,
    existingIds: Set<string>
): WidgetNode {
    let base = node.id.replace(/_\d+$/, "");
    let count = 1;
    let newId = `${base}_${count}`;
    while (existingIds.has(newId)) {
        count++;
        newId = `${base}_${count}`;
    }
    existingIds.add(newId);

    const children = node.children?.map((c) =>
        regenerateNodeIds(c, existingIds)
    );

    return {
        ...node,
        id: newId,
        ...(children ? { children } : {}),
    };
}
