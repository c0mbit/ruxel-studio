import { create } from "zustand";
import { clamp } from "../viewport/geometry";
import type {
    Camera,
    DistanceIndicator,
    DragOperation,
    GuideLine,
    NodeBounds,
    Point,
    Rect,
} from "../viewport/types";

export interface ViewportState {
    readonly camera: Camera;
    readonly isPanning: boolean;
    readonly isSpacePressed: boolean;
    readonly showGrid: boolean;
    readonly snapToGrid: boolean;
    readonly snapToObjects: boolean;
    readonly showRulers: boolean;
    readonly gridSize: number;
    readonly activeDrag: DragOperation | null;
    readonly activeGuides: readonly GuideLine[];
    readonly distanceIndicators: readonly DistanceIndicator[];
    readonly hoveredNodeId: string | null;
    readonly nodeBounds: ReadonlyMap<string, NodeBounds>;

    readonly setCamera: (panX: number, panY: number, zoom: number) => void;
    readonly panBy: (deltaX: number, deltaY: number) => void;
    readonly zoomAt: (cursorScreenPoint: Point, zoomFactor: number) => void;
    readonly fitToScreen: (
        viewportWidth: number,
        viewportHeight: number,
        targetWidth: number,
        targetHeight: number,
        padding?: number
    ) => void;
    readonly resetZoom: (
        viewportWidth: number,
        viewportHeight: number,
        targetWidth: number,
        targetHeight: number
    ) => void;
    readonly setSpacePressed: (pressed: boolean) => void;
    readonly setIsPanning: (panning: boolean) => void;
    readonly setShowGrid: (show: boolean) => void;
    readonly setSnapToGrid: (snap: boolean) => void;
    readonly setSnapToObjects: (snap: boolean) => void;
    readonly setShowRulers: (show: boolean) => void;
    readonly setHoveredNodeId: (id: string | null) => void;
    readonly startDrag: (op: DragOperation) => void;
    readonly updateDrag: (
        currentRect: Rect,
        guides: readonly GuideLine[],
        distanceIndicators: readonly DistanceIndicator[]
    ) => void;
    readonly endDrag: () => void;
    readonly registerNodeBounds: (bounds: NodeBounds) => void;
    readonly unregisterNodeBounds: (id: string) => void;
    readonly clearAllBounds: () => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4.0;

export const useViewportStore = create<ViewportState>((set, get) => ({
    camera: {
        panX: 120,
        panY: 80,
        zoom: 1.0,
    },
    isPanning: false,
    isSpacePressed: false,
    showGrid: true,
    snapToGrid: true,
    snapToObjects: true,
    showRulers: true,
    gridSize: 10,
    activeDrag: null,
    activeGuides: [],
    distanceIndicators: [],
    hoveredNodeId: null,
    nodeBounds: new Map(),

    setCamera: (panX, panY, zoom) => {
        set({
            camera: {
                panX,
                panY,
                zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
            },
        });
    },

    panBy: (deltaX, deltaY) => {
        const { camera } = get();
        set({
            camera: {
                ...camera,
                panX: camera.panX + deltaX,
                panY: camera.panY + deltaY,
            },
        });
    },

    zoomAt: (cursorScreenPoint, zoomFactor) => {
        const { camera } = get();
        const newZoom = clamp(camera.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
        if (newZoom === camera.zoom) {
            return;
        }

        const worldX = (cursorScreenPoint.x - camera.panX) / camera.zoom;
        const worldY = (cursorScreenPoint.y - camera.panY) / camera.zoom;

        const newPanX = cursorScreenPoint.x - worldX * newZoom;
        const newPanY = cursorScreenPoint.y - worldY * newZoom;

        set({
            camera: {
                panX: newPanX,
                panY: newPanY,
                zoom: newZoom,
            },
        });
    },

    fitToScreen: (
        viewportWidth,
        viewportHeight,
        targetWidth,
        targetHeight,
        padding = 48
    ) => {
        const availableWidth = Math.max(100, viewportWidth - padding * 2);
        const availableHeight = Math.max(100, viewportHeight - padding * 2);

        const scaleX = availableWidth / targetWidth;
        const scaleY = availableHeight / targetHeight;
        const fittedZoom = clamp(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM);

        const panX = (viewportWidth - targetWidth * fittedZoom) / 2;
        const panY = (viewportHeight - targetHeight * fittedZoom) / 2;

        set({
            camera: {
                panX,
                panY,
                zoom: fittedZoom,
            },
        });
    },

    resetZoom: (viewportWidth, viewportHeight, targetWidth, targetHeight) => {
        const zoom = 1.0;
        const panX = (viewportWidth - targetWidth * zoom) / 2;
        const panY = (viewportHeight - targetHeight * zoom) / 2;

        set({
            camera: {
                panX,
                panY,
                zoom,
            },
        });
    },

    setSpacePressed: (pressed) => {
        set({ isSpacePressed: pressed });
    },

    setIsPanning: (panning) => {
        set({ isPanning: panning });
    },

    setShowGrid: (show) => {
        set({ showGrid: show });
    },

    setSnapToGrid: (snap) => {
        set({ snapToGrid: snap });
    },

    setSnapToObjects: (snap) => {
        set({ snapToObjects: snap });
    },

    setShowRulers: (show) => {
        set({ showRulers: show });
    },

    setHoveredNodeId: (id) => {
        set({ hoveredNodeId: id });
    },

    startDrag: (op) => {
        set({
            activeDrag: op,
            activeGuides: [],
            distanceIndicators: [],
        });
    },

    updateDrag: (currentRect, guides, distanceIndicators) => {
        const { activeDrag } = get();
        if (!activeDrag) {
            return;
        }

        set({
            activeDrag: {
                ...activeDrag,
                currentRect,
            },
            activeGuides: guides,
            distanceIndicators,
        });
    },

    endDrag: () => {
        set({
            activeDrag: null,
            activeGuides: [],
            distanceIndicators: [],
        });
    },

    registerNodeBounds: (bounds) => {
        const nextMap = new Map(get().nodeBounds);
        nextMap.set(bounds.id, bounds);
        set({ nodeBounds: nextMap });
    },

    unregisterNodeBounds: (id) => {
        const nextMap = new Map(get().nodeBounds);
        nextMap.delete(id);
        set({ nodeBounds: nextMap });
    },

    clearAllBounds: () => {
        set({ nodeBounds: new Map() });
    },
}));

