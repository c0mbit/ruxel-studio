import { create } from "zustand";
import type {
    Camera,
    DistanceIndicator,
    DragOperation,
    GuideLine,
    NodeBounds,
    Point,
    Rect,
} from "../viewport/types";

function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export type DevicePreset = "mobile" | "tablet" | "desktop" | "responsive";
export type DeviceOrientation = "portrait" | "landscape";

export interface ViewportDimensions {
    readonly width: number;
    readonly height: number;
}

export interface DevicePresetConfig {
    readonly id: DevicePreset;
    readonly label: string;
    readonly width: number;
    readonly height: number;
    readonly icon: string;
}

export const DEVICE_PRESETS: Record<"mobile" | "tablet" | "desktop", ViewportDimensions> = {
    mobile: { width: 375, height: 812 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
};

export const MIN_VIEWPORT_WIDTH = 280;
export const MAX_VIEWPORT_WIDTH = 3840;
export const MIN_VIEWPORT_HEIGHT = 200;
export const MAX_VIEWPORT_HEIGHT = 2560;

/**
 * Calculates effective dimensions for a given device mode, orientation, and custom dimensions.
 */
export function calculateEffectiveDimensions(
    mode: DevicePreset,
    orientation: DeviceOrientation,
    customDimensions: ViewportDimensions,
    fallbackDimensions?: ViewportDimensions
): ViewportDimensions {
    if (mode === "responsive") {
        return {
            width: clamp(customDimensions.width, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH),
            height: clamp(customDimensions.height, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT),
        };
    }

    const preset = DEVICE_PRESETS[mode];
    if (!preset) {
        return fallbackDimensions ?? { width: 1200, height: 800 };
    }

    if (mode === "desktop") {
        // Desktop default is landscape (1440x900). Portrait is 900x1440.
        if (orientation === "portrait") {
            return {
                width: Math.min(preset.width, preset.height),
                height: Math.max(preset.width, preset.height),
            };
        }
        return {
            width: Math.max(preset.width, preset.height),
            height: Math.min(preset.width, preset.height),
        };
    }

    // Mobile / Tablet default is portrait.
    if (orientation === "landscape") {
        return {
            width: Math.max(preset.width, preset.height),
            height: Math.min(preset.width, preset.height),
        };
    }

    return {
        width: Math.min(preset.width, preset.height),
        height: Math.max(preset.width, preset.height),
    };
}

/**
 * Calculates the proportional scale factor when a device frame exceeds available panel bounds.
 */
export function calculateProportionalScale(
    availableWidth: number,
    availableHeight: number,
    targetWidth: number,
    targetHeight: number,
    padding = 32
): number {
    if (targetWidth <= 0 || targetHeight <= 0) {
        return 1.0;
    }
    const maxUsableWidth = Math.max(100, availableWidth - padding * 2);
    const maxUsableHeight = Math.max(100, availableHeight - padding * 2);

    const scaleX = maxUsableWidth / targetWidth;
    const scaleY = maxUsableHeight / targetHeight;

    const fit = Math.min(scaleX, scaleY);
    if (fit < 1.0) {
        return Math.max(0.1, Number(fit.toFixed(3)));
    }
    return 1.0;
}

/**
 * Calculates centered viewport frame bounds and transform parameters.
 */
export function calculateViewportFrameBounds(
    availableWidth: number,
    availableHeight: number,
    targetWidth: number,
    targetHeight: number,
    scale: number
): { x: number; y: number; width: number; height: number; scale: number } {
    const scaledWidth = targetWidth * scale;
    const scaledHeight = targetHeight * scale;

    const x = Math.max(16, (availableWidth - scaledWidth) / 2);
    const y = Math.max(16, (availableHeight - scaledHeight) / 2);

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(targetWidth),
        height: Math.round(targetHeight),
        scale,
    };
}

/**
 * Adjusts pointer screen coordinates relative to a scaled viewport frame.
 */
export function mapPointerToViewport(
    screenX: number,
    screenY: number,
    frameX: number,
    frameY: number,
    scale: number
): { x: number; y: number } {
    const safeScale = scale > 0 ? scale : 1.0;
    return {
        x: Math.round((screenX - frameX) / safeScale),
        y: Math.round((screenY - frameY) / safeScale),
    };
}

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

    // Responsive Preview State
    readonly deviceMode: DevicePreset;
    readonly orientation: DeviceOrientation;
    readonly customDimensions: ViewportDimensions;
    readonly isCustomResizing: boolean;
    readonly autoFitScale: boolean;
    readonly previewScale: number;

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

    // Responsive Preview Actions
    readonly setDeviceMode: (mode: DevicePreset) => void;
    readonly setOrientation: (orientation: DeviceOrientation) => void;
    readonly toggleOrientation: () => void;
    readonly setCustomDimensions: (
        dimensions:
            | ViewportDimensions
            | ((prev: ViewportDimensions) => ViewportDimensions)
    ) => void;
    readonly setCustomWidth: (width: number) => void;
    readonly setCustomHeight: (height: number) => void;
    readonly setIsCustomResizing: (isResizing: boolean) => void;
    readonly setAutoFitScale: (autoFit: boolean) => void;
    readonly setPreviewScale: (scale: number) => void;
    readonly getEffectiveDimensions: () => ViewportDimensions;
    readonly resetToDefaultResolution: (
        defaultWidth?: number,
        defaultHeight?: number
    ) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4.0;

let cachedEffectiveDimensions: ViewportDimensions | null = null;

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

    // Responsive Preview initial state
    deviceMode: "responsive",
    orientation: "portrait",
    customDimensions: {
        width: 1200,
        height: 800,
    },
    isCustomResizing: false,
    autoFitScale: true,
    previewScale: 1.0,

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
        const current = get().nodeBounds.get(bounds.id);
        if (
            current &&
            current.rect.x === bounds.rect.x &&
            current.rect.y === bounds.rect.y &&
            current.rect.width === bounds.rect.width &&
            current.rect.height === bounds.rect.height &&
            current.parentId === bounds.parentId
        ) {
            return;
        }
        const nextMap = new Map(get().nodeBounds);
        nextMap.set(bounds.id, bounds);
        set({ nodeBounds: nextMap });
    },

    unregisterNodeBounds: (id) => {
        if (!get().nodeBounds.has(id)) {
            return;
        }
        const nextMap = new Map(get().nodeBounds);
        nextMap.delete(id);
        set({ nodeBounds: nextMap });
    },

    clearAllBounds: () => {
        if (get().nodeBounds.size === 0) {
            return;
        }
        set({ nodeBounds: new Map() });
    },

    // Responsive Preview Actions Implementation
    setDeviceMode: (mode) => {
        const currentMode = get().deviceMode;
        const targetOrientation = mode === "desktop" ? "landscape" : "portrait";
        if (currentMode === mode && get().orientation === targetOrientation) {
            return;
        }
        set({
            deviceMode: mode,
            orientation: targetOrientation,
        });
    },

    setOrientation: (orientation) => {
        if (get().orientation === orientation) {
            return;
        }
        set({ orientation });
    },

    toggleOrientation: () => {
        const current = get().orientation;
        set({ orientation: current === "portrait" ? "landscape" : "portrait" });
    },

    setCustomDimensions: (dimensions) => {
        const current = get().customDimensions;
        const next =
            typeof dimensions === "function" ? dimensions(current) : dimensions;
        const width = clamp(next.width, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH);
        const height = clamp(next.height, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT);
        if (current.width === width && current.height === height) {
            return;
        }
        set({
            customDimensions: {
                width,
                height,
            },
        });
    },

    setCustomWidth: (width) => {
        const current = get().customDimensions;
        const clampedWidth = clamp(width, MIN_VIEWPORT_WIDTH, MAX_VIEWPORT_WIDTH);
        if (current.width === clampedWidth) {
            return;
        }
        set({
            customDimensions: {
                ...current,
                width: clampedWidth,
            },
        });
    },

    setCustomHeight: (height) => {
        const current = get().customDimensions;
        const clampedHeight = clamp(height, MIN_VIEWPORT_HEIGHT, MAX_VIEWPORT_HEIGHT);
        if (current.height === clampedHeight) {
            return;
        }
        set({
            customDimensions: {
                ...current,
                height: clampedHeight,
            },
        });
    },

    setIsCustomResizing: (isResizing) => {
        set({ isCustomResizing: isResizing });
    },

    setAutoFitScale: (autoFit) => {
        set({ autoFitScale: autoFit });
    },

    setPreviewScale: (scale) => {
        set({ previewScale: scale });
    },

    getEffectiveDimensions: () => {
        const { deviceMode, orientation, customDimensions } = get();
        const calculated = calculateEffectiveDimensions(
            deviceMode,
            orientation,
            customDimensions
        );
        if (
            cachedEffectiveDimensions &&
            cachedEffectiveDimensions.width === calculated.width &&
            cachedEffectiveDimensions.height === calculated.height
        ) {
            return cachedEffectiveDimensions;
        }
        cachedEffectiveDimensions = calculated;
        return calculated;
    },

    resetToDefaultResolution: (defaultWidth = 1200, defaultHeight = 800) => {
        set({
            deviceMode: "responsive",
            orientation: "portrait",
            customDimensions: {
                width: defaultWidth,
                height: defaultHeight,
            },
        });
    },
}));
