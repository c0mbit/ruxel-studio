export interface Camera {
    readonly panX: number;
    readonly panY: number;
    readonly zoom: number;
}

export interface Point {
    readonly x: number;
    readonly y: number;
}

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type ResizeHandleType =
    | "nw"
    | "n"
    | "ne"
    | "e"
    | "se"
    | "s"
    | "sw"
    | "w";

export interface ResizeHandle {
    readonly type: ResizeHandleType;
    readonly x: number;
    readonly y: number;
    readonly cursor: string;
}

export interface GuideLine {
    readonly orientation: "horizontal" | "vertical";
    readonly position: number;
    readonly start: number;
    readonly end: number;
}

export interface DistanceIndicator {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly distance: number;
    readonly orientation: "horizontal" | "vertical";
}

export interface NodeBounds {
    readonly id: string;
    readonly rect: Rect;
    readonly parentId?: string;
}

export type DragOperation =
    | {
          readonly type: "move";
          readonly nodeId: string;
          readonly startPoint: Point;
          readonly initialRect: Rect;
          readonly currentRect: Rect;
      }
    | {
          readonly type: "resize";
          readonly nodeId: string;
          readonly handle: ResizeHandleType;
          readonly startPoint: Point;
          readonly initialRect: Rect;
          readonly currentRect: Rect;
      };

