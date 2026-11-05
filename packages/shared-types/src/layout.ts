export type FlexDirection = "row" | "column" | "row_reverse" | "column_reverse";

export type FlexWrap = "no_wrap" | "wrap" | "wrap_reverse";

export type JustifyContent =
    | "flex_start"
    | "flex_end"
    | "center"
    | "space_between"
    | "space_around"
    | "space_evenly";

export type AlignItems = "flex_start" | "flex_end" | "center" | "stretch" | "baseline";

export type AlignSelf = "auto" | "flex_start" | "flex_end" | "center" | "stretch" | "baseline";

export interface FlexContainer {
    readonly direction?: FlexDirection;
    readonly wrap?: FlexWrap;
    readonly justify_content?: JustifyContent;
    readonly align_items?: AlignItems;
    readonly gap?: number;
}

export type GridTrackUnit = "fixed" | "percentage" | "fr" | "auto" | "min_max";

export type GridTrack =
    | { readonly unit: "fixed"; readonly value: number }
    | { readonly unit: "percentage"; readonly value: number }
    | { readonly unit: "fr"; readonly value: number }
    | { readonly unit: "auto" }
    | { readonly unit: "min_max"; readonly value: readonly [number, number] };

export interface GridContainer {
    readonly columns: readonly GridTrack[];
    readonly rows: readonly GridTrack[];
    readonly column_gap?: number;
    readonly row_gap?: number;
    readonly justify_items?: AlignItems;
    readonly align_items?: AlignItems;
}

export interface AbsolutePosition {
    readonly x: number;
    readonly y: number;
    readonly z_index?: number;
}

export interface AnchorConstraints {
    readonly top?: number;
    readonly bottom?: number;
    readonly left?: number;
    readonly right?: number;
}

export type BorderPosition = "top" | "bottom" | "left" | "right" | "center";

export type ContainerLayout =
    | { readonly type: "flex"; readonly [key: string]: unknown }
    | { readonly type: "grid"; readonly [key: string]: unknown }
    | { readonly type: "absolute" }
    | { readonly type: "anchor" }
    | { readonly type: "border" };

export type Size =
    | { readonly type: "fixed"; readonly value: number }
    | { readonly type: "percentage"; readonly value: number }
    | { readonly type: "fill"; readonly value: number }
    | { readonly type: "hug_content" }
    | { readonly type: "auto" };

export interface Dimensions {
    readonly width?: Size;
    readonly height?: Size;
    readonly min_width?: number;
    readonly min_height?: number;
    readonly max_width?: number;
    readonly max_height?: number;
    readonly aspect_ratio?: number;
}

export interface RectOffsets {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
}

export interface Spacing {
    readonly padding?: RectOffsets;
    readonly margin?: RectOffsets;
}

export interface GridPlacement {
    readonly column?: number;
    readonly column_span?: number;
    readonly row?: number;
    readonly row_span?: number;
}

export interface FlexItem {
    readonly grow?: number;
    readonly shrink?: number;
    readonly basis?: Size;
    readonly align_self?: AlignSelf;
}

export interface WidgetLayout {
    readonly container?: ContainerLayout;
    readonly dimensions?: Dimensions;
    readonly spacing?: Spacing;
    readonly absolute?: AbsolutePosition;
    readonly anchor?: AnchorConstraints;
    readonly border?: BorderPosition;
    readonly grid?: GridPlacement;
    readonly flex_item?: FlexItem;
}

