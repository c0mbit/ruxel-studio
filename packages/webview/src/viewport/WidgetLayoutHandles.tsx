import React, { FC, useState, useRef, useCallback } from "react";
import type { WidgetNode } from "@ruxel/shared-types";

export interface WidgetLayoutHandlesProps {
    readonly node: WidgetNode;
    readonly cameraZoom: number;
    readonly onLayoutChange: (
        description: string,
        updater: (node: WidgetNode) => WidgetNode
    ) => void;
}

type DragMode = "width" | "height" | "corner" | "padding" | "spacing" | null;

export const WidgetLayoutHandles: FC<WidgetLayoutHandlesProps> = ({
    node,
    cameraZoom,
    onLayoutChange,
}) => {
    const [dragMode, setDragMode] = useState<DragMode>(null);
    const [liveValue, setLiveValue] = useState<string | null>(null);

    const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const initialDimsRef = useRef<{ width: number; height: number; padding: number; spacing: number }>({
        width: 100,
        height: 100,
        padding: 0,
        spacing: 0,
    });

    const isContainer =
        node.widget_type === "v_box" ||
        node.widget_type === "h_box" ||
        node.widget_type === "grid" ||
        node.widget_type === "border_pane" ||
        node.widget_type === "generic_widget";

    const currentWidth =
        typeof node.layout?.dimensions?.width === "object" &&
        node.layout.dimensions.width &&
        "value" in node.layout.dimensions.width
            ? Number(node.layout.dimensions.width.value)
            : 120;

    const currentHeight =
        typeof node.layout?.dimensions?.height === "object" &&
        node.layout.dimensions.height &&
        "value" in node.layout.dimensions.height
            ? Number(node.layout.dimensions.height.value)
            : 60;

    const currentPadding: number =
        typeof node.layout?.spacing?.padding?.top === "number"
            ? node.layout.spacing.padding.top
            : typeof node.layout?.spacing?.padding?.left === "number"
            ? node.layout.spacing.padding.left
            : 0;

    const currentSpacing: number =
        node.layout?.container?.type === "flex" && typeof node.layout.container.gap === "number"
            ? node.layout.container.gap
            : 8;

    const handlePointerDown = useCallback(
        (mode: DragMode, e: React.PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);

            startPosRef.current = { x: e.clientX, y: e.clientY };
            initialDimsRef.current = {
                width: currentWidth,
                height: currentHeight,
                padding: currentPadding,
                spacing: currentSpacing,
            };
            setDragMode(mode);
        },
        [currentWidth, currentHeight, currentPadding, currentSpacing]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragMode) return;
            e.stopPropagation();

            const deltaScreenX = e.clientX - startPosRef.current.x;
            const deltaScreenY = e.clientY - startPosRef.current.y;
            const deltaWorldX = deltaScreenX / (cameraZoom || 1);
            const deltaWorldY = deltaScreenY / (cameraZoom || 1);

            switch (dragMode) {
                case "width": {
                    const newW = Math.max(10, Math.round(initialDimsRef.current.width + deltaWorldX));
                    setLiveValue(`Width: ${newW}px`);
                    break;
                }
                case "height": {
                    const newH = Math.max(10, Math.round(initialDimsRef.current.height + deltaWorldY));
                    setLiveValue(`Height: ${newH}px`);
                    break;
                }
                case "corner": {
                    const newW = Math.max(10, Math.round(initialDimsRef.current.width + deltaWorldX));
                    const newH = Math.max(10, Math.round(initialDimsRef.current.height + deltaWorldY));
                    setLiveValue(`${newW} × ${newH}`);
                    break;
                }
                case "padding": {
                    const newP = Math.max(0, Math.round(initialDimsRef.current.padding + deltaWorldX));
                    setLiveValue(`Padding: ${newP}px`);
                    break;
                }
                case "spacing": {
                    const newS = Math.max(0, Math.round(initialDimsRef.current.spacing + deltaWorldY));
                    setLiveValue(`Spacing: ${newS}px`);
                    break;
                }
            }
        },
        [dragMode, cameraZoom]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!dragMode) return;
            e.stopPropagation();

            try {
                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // Ignore if pointer capture release throws
            }

            const deltaScreenX = e.clientX - startPosRef.current.x;
            const deltaScreenY = e.clientY - startPosRef.current.y;
            const deltaWorldX = deltaScreenX / (cameraZoom || 1);
            const deltaWorldY = deltaScreenY / (cameraZoom || 1);

            switch (dragMode) {
                case "width": {
                    const newW = Math.max(10, Math.round(initialDimsRef.current.width + deltaWorldX));
                    onLayoutChange(`Resize width to ${newW}px on ${node.id}`, (n) => ({
                        ...n,
                        layout: {
                            ...n.layout,
                            dimensions: {
                                ...n.layout?.dimensions,
                                width: { type: "fixed", value: newW },
                            },
                        },
                    }));
                    break;
                }
                case "height": {
                    const newH = Math.max(10, Math.round(initialDimsRef.current.height + deltaWorldY));
                    onLayoutChange(`Resize height to ${newH}px on ${node.id}`, (n) => ({
                        ...n,
                        layout: {
                            ...n.layout,
                            dimensions: {
                                ...n.layout?.dimensions,
                                height: { type: "fixed", value: newH },
                            },
                        },
                    }));
                    break;
                }
                case "corner": {
                    const newW = Math.max(10, Math.round(initialDimsRef.current.width + deltaWorldX));
                    const newH = Math.max(10, Math.round(initialDimsRef.current.height + deltaWorldY));
                    onLayoutChange(`Resize dimensions to ${newW}x${newH} on ${node.id}`, (n) => ({
                        ...n,
                        layout: {
                            ...n.layout,
                            dimensions: {
                                ...n.layout?.dimensions,
                                width: { type: "fixed", value: newW },
                                height: { type: "fixed", value: newH },
                            },
                        },
                    }));
                    break;
                }
                case "padding": {
                    const newP = Math.max(0, Math.round(initialDimsRef.current.padding + deltaWorldX));
                    onLayoutChange(`Set padding ${newP}px on ${node.id}`, (n) => ({
                        ...n,
                        layout: {
                            ...n.layout,
                            spacing: {
                                ...n.layout?.spacing,
                                padding: { top: newP, right: newP, bottom: newP, left: newP },
                            },
                        },
                    }));
                    break;
                }
                case "spacing": {
                    const newS = Math.max(0, Math.round(initialDimsRef.current.spacing + deltaWorldY));
                    onLayoutChange(`Set spacing ${newS}px on ${node.id}`, (n) => ({
                        ...n,
                        layout: {
                            ...n.layout,
                            container:
                                n.layout?.container?.type === "flex"
                                    ? { ...n.layout.container, gap: newS }
                                    : {
                                          type: "flex",
                                          direction: n.widget_type === "h_box" ? "row" : "column",
                                          gap: newS,
                                      },
                        },
                    }));
                    break;
                }
            }

            setDragMode(null);
            setLiveValue(null);
        },
        [dragMode, cameraZoom, node.id, onLayoutChange]
    );

    return (
        <div className="absolute inset-0 pointer-events-none z-30 select-none">
            {/* Live Size/Padding Tooltip Pill */}
            {liveValue && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-semibold shadow-lg whitespace-nowrap z-50 pointer-events-none animate-pulse">
                    {liveValue}
                </div>
            )}

            {/* East / Right Edge Handle (Width) */}
            <div
                title="Drag to resize Width"
                onPointerDown={(e) => handlePointerDown("width", e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-8 bg-blue-500/90 hover:bg-blue-400 border border-white/80 rounded-full cursor-ew-resize pointer-events-auto shadow-md transition-transform hover:scale-125 z-40"
            />

            {/* South / Bottom Edge Handle (Height) */}
            <div
                title="Drag to resize Height"
                onPointerDown={(e) => handlePointerDown("height", e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-8 bg-blue-500/90 hover:bg-blue-400 border border-white/80 rounded-full cursor-ns-resize pointer-events-auto shadow-md transition-transform hover:scale-125 z-40"
            />

            {/* Corner Handle (Width & Height) */}
            <div
                title="Drag to resize Width & Height"
                onPointerDown={(e) => handlePointerDown("corner", e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded cursor-nwse-resize pointer-events-auto shadow-md transition-transform hover:scale-125 z-40"
            />

            {/* Padding Handle (Top-Right Badge Grip) */}
            <div
                title="Drag horizontally to adjust Padding"
                onPointerDown={(e) => handlePointerDown("padding", e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute -top-2.5 right-2 px-1.5 py-0.2 rounded bg-amber-600 hover:bg-amber-500 text-white font-mono text-[9px] cursor-ew-resize pointer-events-auto shadow-md border border-amber-300 flex items-center gap-1 transition-transform hover:scale-110 z-40"
            >
                <span>↔</span>
                <span>Pad</span>
            </div>

            {/* Spacing / Gap Handle (for Container widgets) */}
            {isContainer && (
                <div
                    title="Drag vertically to adjust Container Spacing/Gap"
                    onPointerDown={(e) => handlePointerDown("spacing", e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="absolute -bottom-2.5 right-6 px-1.5 py-0.2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[9px] cursor-ns-resize pointer-events-auto shadow-md border border-emerald-300 flex items-center gap-1 transition-transform hover:scale-110 z-40"
                >
                    <span>↕</span>
                    <span>Gap</span>
                </div>
            )}
        </div>
    );
};
