export type ScaleMode = "logical" | "physical" | "scaled";

export interface WindowConfig {
    readonly title: string;
    readonly initial_width: number;
    readonly initial_height: number;
    readonly min_width?: number;
    readonly min_height?: number;
    readonly max_width?: number;
    readonly max_height?: number;
    readonly resizable: boolean;
    readonly scale_mode: ScaleMode;
    readonly transparent: boolean;
    readonly decorations: boolean;
    readonly always_on_top: boolean;
    readonly fullscreen: boolean;
    readonly position_x?: number;
    readonly position_y?: number;
}
