import type { Camera, Point, Rect, ResizeHandle, ResizeHandleType } from "./types";

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function screenToWorld(point: Point, camera: Camera): Point {
    return {
        x: (point.x - camera.panX) / camera.zoom,
        y: (point.y - camera.panY) / camera.zoom,
    };
}

export function worldToScreen(point: Point, camera: Camera): Point {
    return {
        x: point.x * camera.zoom + camera.panX,
        y: point.y * camera.zoom + camera.panY,
    };
}

export function rectToScreen(rect: Rect, camera: Camera): Rect {
    return {
        x: rect.x * camera.zoom + camera.panX,
        y: rect.y * camera.zoom + camera.panY,
        width: rect.width * camera.zoom,
        height: rect.height * camera.zoom,
    };
}

export function getResizeHandles(rect: Rect): readonly ResizeHandle[] {
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;

    return [
        { type: "nw", x: rect.x, y: rect.y, cursor: "nwse-resize" },
        { type: "n", x: rect.x + halfWidth, y: rect.y, cursor: "ns-resize" },
        { type: "ne", x: rect.x + rect.width, y: rect.y, cursor: "nesw-resize" },
        { type: "e", x: rect.x + rect.width, y: rect.y + halfHeight, cursor: "ew-resize" },
        { type: "se", x: rect.x + rect.width, y: rect.y + rect.height, cursor: "nwse-resize" },
        { type: "s", x: rect.x + halfWidth, y: rect.y + rect.height, cursor: "ns-resize" },
        { type: "sw", x: rect.x, y: rect.y + rect.height, cursor: "nesw-resize" },
        { type: "w", x: rect.x, y: rect.y + halfHeight, cursor: "ew-resize" },
    ];
}

export function findHandleAtScreenPoint(
    screenPoint: Point,
    rect: Rect,
    camera: Camera,
    hitRadius: number = 8
): ResizeHandle | null {
    const handles = getResizeHandles(rect);

    for (const handle of handles) {
        const screenHandlePoint = worldToScreen({ x: handle.x, y: handle.y }, camera);
        const distance = Math.hypot(
            screenPoint.x - screenHandlePoint.x,
            screenPoint.y - screenHandlePoint.y
        );

        if (distance <= hitRadius) {
            return handle;
        }
    }

    return null;
}

export function applyResizeDelta(
    handle: ResizeHandleType,
    initialRect: Rect,
    deltaWorldX: number,
    deltaWorldY: number,
    minWidth: number = 10,
    minHeight: number = 10
): Rect {
    let { x, y, width, height } = initialRect;

    switch (handle) {
        case "nw": {
            const newWidth = Math.max(minWidth, initialRect.width - deltaWorldX);
            const newHeight = Math.max(minHeight, initialRect.height - deltaWorldY);
            x = initialRect.x + (initialRect.width - newWidth);
            y = initialRect.y + (initialRect.height - newHeight);
            width = newWidth;
            height = newHeight;
            break;
        }
        case "n": {
            const newHeight = Math.max(minHeight, initialRect.height - deltaWorldY);
            y = initialRect.y + (initialRect.height - newHeight);
            height = newHeight;
            break;
        }
        case "ne": {
            width = Math.max(minWidth, initialRect.width + deltaWorldX);
            const newHeight = Math.max(minHeight, initialRect.height - deltaWorldY);
            y = initialRect.y + (initialRect.height - newHeight);
            height = newHeight;
            break;
        }
        case "e": {
            width = Math.max(minWidth, initialRect.width + deltaWorldX);
            break;
        }
        case "se": {
            width = Math.max(minWidth, initialRect.width + deltaWorldX);
            height = Math.max(minHeight, initialRect.height + deltaWorldY);
            break;
        }
        case "s": {
            height = Math.max(minHeight, initialRect.height + deltaWorldY);
            break;
        }
        case "sw": {
            const newWidth = Math.max(minWidth, initialRect.width - deltaWorldX);
            x = initialRect.x + (initialRect.width - newWidth);
            width = newWidth;
            height = Math.max(minHeight, initialRect.height + deltaWorldY);
            break;
        }
        case "w": {
            const newWidth = Math.max(minWidth, initialRect.width - deltaWorldX);
            x = initialRect.x + (initialRect.width - newWidth);
            width = newWidth;
            break;
        }
    }

    return { x, y, width, height };
}

export function isPointInsideRect(point: Point, rect: Rect): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

