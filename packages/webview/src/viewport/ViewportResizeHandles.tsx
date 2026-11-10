import { FC, useRef, useCallback } from "react";
import { useViewportStore, type ViewportDimensions } from "../state/viewportStore";

interface ViewportResizeHandlesProps {
    readonly effectiveDimensions: ViewportDimensions;
    readonly zoom: number;
}

export const ViewportResizeHandles: FC<ViewportResizeHandlesProps> = ({
    effectiveDimensions,
    zoom,
}) => {
    const isCustomResizing = useViewportStore((state) => state.isCustomResizing);
    const setIsCustomResizing = useViewportStore(
        (state) => state.setIsCustomResizing
    );
    const setCustomDimensions = useViewportStore(
        (state) => state.setCustomDimensions
    );

    const dragStartRef = useRef<{
        pointerX: number;
        pointerY: number;
        startWidth: number;
        startHeight: number;
        handleType: "e" | "s" | "se";
    } | null>(null);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent, handleType: "e" | "s" | "se") => {
            e.preventDefault();
            e.stopPropagation();

            dragStartRef.current = {
                pointerX: e.clientX,
                pointerY: e.clientY,
                startWidth: effectiveDimensions.width,
                startHeight: effectiveDimensions.height,
                handleType,
            };

            setIsCustomResizing(true);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        [effectiveDimensions, setIsCustomResizing]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragStartRef.current) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const { pointerX, pointerY, startWidth, startHeight, handleType } =
                dragStartRef.current;
            const safeZoom = zoom > 0 ? zoom : 1.0;
            const deltaX = (e.clientX - pointerX) / safeZoom;
            const deltaY = (e.clientY - pointerY) / safeZoom;

            let nextWidth = startWidth;
            let nextHeight = startHeight;

            if (handleType === "e" || handleType === "se") {
                nextWidth = Math.max(280, Math.round(startWidth + deltaX));
            }
            if (handleType === "s" || handleType === "se") {
                nextHeight = Math.max(200, Math.round(startHeight + deltaY));
            }

            setCustomDimensions({ width: nextWidth, height: nextHeight });
        },
        [zoom, setCustomDimensions]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (dragStartRef.current) {
                dragStartRef.current = null;
                setIsCustomResizing(false);
                try {
                    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                } catch {
                    // Ignore release pointer errors
                }
            }
        },
        [setIsCustomResizing]
    );

    return (
        <div className="absolute inset-0 pointer-events-none z-30">
            {/* Right (East) Resize Handle */}
            <div
                data-testid="viewport-resize-handle-e"
                onPointerDown={(e) => handlePointerDown(e, "e")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute top-0 right-0 -mr-2.5 w-5 h-full cursor-ew-resize flex items-center justify-center group pointer-events-auto select-none"
                title="Drag horizontally to resize viewport width"
            >
                <div
                    className={`w-1.5 h-16 rounded-full transition-all ${
                        isCustomResizing
                            ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                            : "bg-zinc-600/70 group-hover:bg-blue-400 group-hover:scale-110 shadow-sm"
                    }`}
                />
            </div>

            {/* Bottom (South) Resize Handle */}
            <div
                data-testid="viewport-resize-handle-s"
                onPointerDown={(e) => handlePointerDown(e, "s")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute bottom-0 left-0 -mb-2.5 w-full h-5 cursor-ns-resize flex items-center justify-center group pointer-events-auto select-none"
                title="Drag vertically to resize viewport height"
            >
                <div
                    className={`h-1.5 w-16 rounded-full transition-all ${
                        isCustomResizing
                            ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                            : "bg-zinc-600/70 group-hover:bg-blue-400 group-hover:scale-110 shadow-sm"
                    }`}
                />
            </div>

            {/* Bottom-Right Corner (South-East) Resize Handle */}
            <div
                data-testid="viewport-resize-handle-se"
                onPointerDown={(e) => handlePointerDown(e, "se")}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute bottom-0 right-0 -mr-3 -mb-3 w-7 h-7 cursor-nwse-resize flex items-center justify-center group pointer-events-auto select-none z-40"
                title="Drag diagonally to resize viewport width and height"
            >
                <div
                    className={`w-3.5 h-3.5 rounded-sm border-r-2 border-b-2 transition-all ${
                        isCustomResizing
                            ? "border-blue-400 bg-blue-500/30 scale-125 shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                            : "border-zinc-400 group-hover:border-blue-400 group-hover:scale-110"
                    }`}
                />
            </div>
        </div>
    );
};
