import { FC, useEffect, useRef } from "react";
import type { PeerPresence, PeerCursor } from "@ruxel/shared-types";
import { useCrdtStore } from "../state/crdtStore";
import { useEditorStore } from "../state/editorStore";
import { useViewportStore } from "../state/viewportStore";
import { getResizeHandles, rectToScreen, worldToScreen } from "./geometry";
import type { Camera, Rect } from "./types";

interface CanvasOverlayProps {
    readonly width: number;
    readonly height: number;
    readonly targetWindowRect: Rect;
}

const RULER_THICKNESS = 20;

export const CanvasOverlay: FC<CanvasOverlayProps> = ({
    width,
    height,
    targetWindowRect,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const camera = useViewportStore((state) => state.camera);
    const showGrid = useViewportStore((state) => state.showGrid);
    const showRulers = useViewportStore((state) => state.showRulers);
    const activeGuides = useViewportStore((state) => state.activeGuides);
    const distanceIndicators = useViewportStore(
        (state) => state.distanceIndicators
    );
    const activeDrag = useViewportStore((state) => state.activeDrag);
    const hoveredNodeId = useViewportStore((state) => state.hoveredNodeId);
    const nodeBounds = useViewportStore((state) => state.nodeBounds);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const peers = useCrdtStore((state) => state.peers);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        if (showGrid) {
            drawAdaptiveGrid(ctx, width, height, camera);
        }

        drawTargetWindowBoundary(ctx, targetWindowRect, camera);

        for (const peer of peers) {
            if (peer.selectedNodeId) {
                const peerBounds = nodeBounds.get(peer.selectedNodeId);
                if (peerBounds) {
                    drawRemoteSelectionBox(ctx, peerBounds.rect, camera, peer);
                }
            }
        }

        if (hoveredNodeId && hoveredNodeId !== selectedNodeId) {
            const hoverBounds = nodeBounds.get(hoveredNodeId);
            if (hoverBounds) {
                drawHoverBox(ctx, hoverBounds.rect, camera);
            }
        }

        let currentSelectedRect: Rect | null = null;
        if (selectedNodeId) {
            if (activeDrag && activeDrag.nodeId === selectedNodeId) {
                currentSelectedRect = activeDrag.currentRect;
            } else {
                const bounds = nodeBounds.get(selectedNodeId);
                if (bounds) {
                    currentSelectedRect = bounds.rect;
                }
            }
        }

        if (currentSelectedRect) {
            drawSelectionBox(ctx, currentSelectedRect, camera, selectedNodeId!);
        }

        if (activeGuides.length > 0) {
            drawSmartGuides(ctx, activeGuides, camera);
        }

        if (distanceIndicators.length > 0) {
            drawDistanceIndicators(ctx, distanceIndicators, camera);
        }

        for (const peer of peers) {
            if (peer.cursor) {
                drawRemoteCursor(ctx, peer.cursor, camera, peer);
            }
        }

        if (showRulers) {
            drawRulers(ctx, width, height, camera);
        }
    }, [
        width,
        height,
        camera,
        showGrid,
        showRulers,
        activeGuides,
        distanceIndicators,
        activeDrag,
        hoveredNodeId,
        nodeBounds,
        selectedNodeId,
        targetWindowRect,
        peers,
    ]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none select-none z-10"
            style={{ width: `${width}px`, height: `${height}px` }}
        />
    );
};

function drawAdaptiveGrid(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    camera: Camera
): void {
    const { panX, panY, zoom } = camera;

    let baseStep = 20;
    if (zoom < 0.3) {
        baseStep = 100;
    } else if (zoom < 0.7) {
        baseStep = 50;
    } else if (zoom > 2.0) {
        baseStep = 10;
    }

    const screenStep = baseStep * zoom;
    const startX = (panX % screenStep + screenStep) % screenStep;
    const startY = (panY % screenStep + screenStep) % screenStep;

    ctx.save();
    ctx.lineWidth = 1;

    ctx.strokeStyle = "rgba(63, 63, 70, 0.25)";
    ctx.beginPath();

    for (let x = startX; x < viewWidth; x += screenStep) {
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, viewHeight);
    }

    for (let y = startY; y < viewHeight; y += screenStep) {
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(viewWidth, Math.floor(y) + 0.5);
    }
    ctx.stroke();

    const majorStep = baseStep * 5 * zoom;
    const majorStartX = (panX % majorStep + majorStep) % majorStep;
    const majorStartY = (panY % majorStep + majorStep) % majorStep;

    ctx.strokeStyle = "rgba(82, 82, 91, 0.4)";
    ctx.beginPath();

    for (let x = majorStartX; x < viewWidth; x += majorStep) {
        ctx.moveTo(Math.floor(x) + 0.5, 0);
        ctx.lineTo(Math.floor(x) + 0.5, viewHeight);
    }

    for (let y = majorStartY; y < viewHeight; y += majorStep) {
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(viewWidth, Math.floor(y) + 0.5);
    }
    ctx.stroke();

    ctx.restore();
}

function drawTargetWindowBoundary(
    ctx: CanvasRenderingContext2D,
    windowRect: Rect,
    camera: Camera
): void {
    const screenRect = rectToScreen(windowRect, camera);

    ctx.save();
    ctx.strokeStyle = "#3f3f46";
    ctx.lineWidth = 1;
    ctx.strokeRect(
        Math.floor(screenRect.x) + 0.5,
        Math.floor(screenRect.y) + 0.5,
        Math.floor(screenRect.width),
        Math.floor(screenRect.height)
    );

    ctx.fillStyle = "rgba(113, 113, 122, 0.7)";
    ctx.font = "10px monospace";
    ctx.fillText(
        `${windowRect.width} × ${windowRect.height}`,
        screenRect.x + screenRect.width - 64,
        screenRect.y + screenRect.height + 14
    );
    ctx.restore();
}

function drawHoverBox(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    camera: Camera
): void {
    const screenRect = rectToScreen(rect, camera);

    ctx.save();
    ctx.strokeStyle = "rgba(59, 130, 246, 0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
        Math.floor(screenRect.x) + 0.5,
        Math.floor(screenRect.y) + 0.5,
        Math.floor(screenRect.width),
        Math.floor(screenRect.height)
    );
    ctx.restore();
}

function drawSelectionBox(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    camera: Camera,
    nodeId: string
): void {
    const screenRect = rectToScreen(rect, camera);

    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
        Math.floor(screenRect.x) + 0.5,
        Math.floor(screenRect.y) + 0.5,
        Math.floor(screenRect.width),
        Math.floor(screenRect.height)
    );

    const handles = getResizeHandles(rect);
    const handleScreenSize = 7;
    const halfHandle = handleScreenSize / 2;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5;

    for (const h of handles) {
        const hp = worldToScreen({ x: h.x, y: h.y }, camera);
        ctx.fillRect(
            Math.floor(hp.x - halfHandle) + 0.5,
            Math.floor(hp.y - halfHandle) + 0.5,
            handleScreenSize,
            handleScreenSize
        );
        ctx.strokeRect(
            Math.floor(hp.x - halfHandle) + 0.5,
            Math.floor(hp.y - halfHandle) + 0.5,
            handleScreenSize,
            handleScreenSize
        );
    }

    const badgeText = `${nodeId} (${Math.round(rect.width)} × ${Math.round(rect.height)})`;
    ctx.font = "10px sans-serif";
    const textMetrics = ctx.measureText(badgeText);
    const badgeWidth = textMetrics.width + 12;
    const badgeHeight = 16;
    const badgeX = screenRect.x;
    const badgeY = Math.max(22, screenRect.y - badgeHeight - 4);

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 3);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, badgeX + 6, badgeY + 11);

    ctx.restore();
}

function drawRemoteSelectionBox(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    camera: Camera,
    peer: PeerPresence
): void {
    const screenRect = rectToScreen(rect, camera);

    ctx.save();
    ctx.strokeStyle = peer.userColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
        Math.floor(screenRect.x) + 0.5,
        Math.floor(screenRect.y) + 0.5,
        Math.floor(screenRect.width),
        Math.floor(screenRect.height)
    );

    const badgeText = `${peer.userName} (${peer.selectedNodeId})`;
    ctx.font = "9px sans-serif";
    const textMetrics = ctx.measureText(badgeText);
    const badgeWidth = textMetrics.width + 10;
    const badgeHeight = 15;
    const badgeX = screenRect.x + screenRect.width - badgeWidth;
    const badgeY = Math.max(22, screenRect.y - badgeHeight - 3);

    ctx.fillStyle = peer.userColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 3);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, badgeX + 5, badgeY + 11);

    ctx.restore();
}

function drawRemoteCursor(
    ctx: CanvasRenderingContext2D,
    cursor: PeerCursor,
    camera: Camera,
    peer: PeerPresence
): void {
    const screenPos = worldToScreen(cursor, camera);

    ctx.save();
    ctx.translate(screenPos.x, screenPos.y);

    ctx.fillStyle = peer.userColor;
    ctx.strokeStyle = "#09090b";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4, 12);
    ctx.lineTo(9, 21);
    ctx.lineTo(12, 19);
    ctx.lineTo(7, 10);
    ctx.lineTo(13, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 10px sans-serif";
    const nameText = peer.userName;
    const metrics = ctx.measureText(nameText);
    const badgeWidth = metrics.width + 10;
    const badgeHeight = 17;
    const badgeX = 14;
    const badgeY = 10;

    ctx.fillStyle = peer.userColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(nameText, badgeX + 5, badgeY + 12);

    ctx.restore();
}

function drawSmartGuides(
    ctx: CanvasRenderingContext2D,
    guides: readonly {
        orientation: "horizontal" | "vertical";
        position: number;
        start: number;
        end: number;
    }[],
    camera: Camera
): void {
    ctx.save();
    ctx.strokeStyle = "#ec4899";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (const guide of guides) {
        ctx.beginPath();
        if (guide.orientation === "vertical") {
            const p1 = worldToScreen({ x: guide.position, y: guide.start }, camera);
            const p2 = worldToScreen({ x: guide.position, y: guide.end }, camera);
            ctx.moveTo(Math.floor(p1.x) + 0.5, p1.y);
            ctx.lineTo(Math.floor(p2.x) + 0.5, p2.y);
        } else {
            const p1 = worldToScreen({ x: guide.start, y: guide.position }, camera);
            const p2 = worldToScreen({ x: guide.end, y: guide.position }, camera);
            ctx.moveTo(p1.x, Math.floor(p1.y) + 0.5);
            ctx.lineTo(p2.x, Math.floor(p2.y) + 0.5);
        }
        ctx.stroke();
    }

    ctx.restore();
}

function drawDistanceIndicators(
    ctx: CanvasRenderingContext2D,
    indicators: readonly {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        distance: number;
        orientation: "horizontal" | "vertical";
    }[],
    camera: Camera
): void {
    ctx.save();
    ctx.strokeStyle = "#ec4899";
    ctx.fillStyle = "#ec4899";
    ctx.lineWidth = 1;
    ctx.font = "9px monospace";

    for (const ind of indicators) {
        const p1 = worldToScreen({ x: ind.x1, y: ind.y1 }, camera);
        const p2 = worldToScreen({ x: ind.x2, y: ind.y2 }, camera);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const tickLen = 4;
        if (ind.orientation === "horizontal") {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y - tickLen);
            ctx.lineTo(p1.x, p1.y + tickLen);
            ctx.moveTo(p2.x, p2.y - tickLen);
            ctx.lineTo(p2.x, p2.y + tickLen);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(p1.x - tickLen, p1.y);
            ctx.lineTo(p1.x + tickLen, p1.y);
            ctx.moveTo(p2.x - tickLen, p2.y);
            ctx.lineTo(p2.x + tickLen, p2.y);
            ctx.stroke();
        }

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const pillText = `${Math.round(ind.distance)}px`;
        const metrics = ctx.measureText(pillText);
        const pillW = metrics.width + 6;
        const pillH = 12;

        ctx.fillStyle = "rgba(236, 72, 153, 0.9)";
        ctx.beginPath();
        ctx.roundRect(midX - pillW / 2, midY - pillH / 2, pillW, pillH, 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.fillText(pillText, midX - pillW / 2 + 3, midY + 3);
    }

    ctx.restore();
}

function drawRulers(
    ctx: CanvasRenderingContext2D,
    viewWidth: number,
    viewHeight: number,
    camera: Camera
): void {
    const { panX, panY, zoom } = camera;

    ctx.save();
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, viewWidth, RULER_THICKNESS);
    ctx.fillRect(0, 0, RULER_THICKNESS, viewHeight);

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_THICKNESS + 0.5);
    ctx.lineTo(viewWidth, RULER_THICKNESS + 0.5);
    ctx.moveTo(RULER_THICKNESS + 0.5, 0);
    ctx.lineTo(RULER_THICKNESS + 0.5, viewHeight);
    ctx.stroke();

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, RULER_THICKNESS, RULER_THICKNESS);

    let step = 100;
    if (zoom < 0.3) {
        step = 500;
    } else if (zoom < 0.7) {
        step = 200;
    } else if (zoom > 2.0) {
        step = 50;
    }

    const subStep = step / 5;

    ctx.font = "9px monospace";
    ctx.fillStyle = "#71717a";
    ctx.strokeStyle = "#3f3f46";

    const minWorldX = -panX / zoom;
    const maxWorldX = (viewWidth - panX) / zoom;
    const startMajorX = Math.floor(minWorldX / step) * step;

    for (let wx = startMajorX; wx <= maxWorldX; wx += subStep) {
        const sx = wx * zoom + panX;
        if (sx < RULER_THICKNESS) {
            continue;
        }

        const isMajor = Math.abs(wx % step) < 0.001;
        const tickHeight = isMajor ? 10 : 5;

        ctx.beginPath();
        ctx.moveTo(Math.floor(sx) + 0.5, RULER_THICKNESS);
        ctx.lineTo(Math.floor(sx) + 0.5, RULER_THICKNESS - tickHeight);
        ctx.stroke();

        if (isMajor) {
            ctx.fillText(String(Math.round(wx)), sx + 2, 11);
        }
    }

    const minWorldY = -panY / zoom;
    const maxWorldY = (viewHeight - panY) / zoom;
    const startMajorY = Math.floor(minWorldY / step) * step;

    for (let wy = startMajorY; wy <= maxWorldY; wy += subStep) {
        const sy = wy * zoom + panY;
        if (sy < RULER_THICKNESS) {
            continue;
        }

        const isMajor = Math.abs(wy % step) < 0.001;
        const tickWidth = isMajor ? 10 : 5;

        ctx.beginPath();
        ctx.moveTo(RULER_THICKNESS, Math.floor(sy) + 0.5);
        ctx.lineTo(RULER_THICKNESS - tickWidth, Math.floor(sy) + 0.5);
        ctx.stroke();

        if (isMajor) {
            ctx.save();
            ctx.translate(11, sy + 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(String(Math.round(wy)), 0, 0);
            ctx.restore();
        }
    }

    ctx.restore();
}
