import type { FontWeight } from "./asset";
import type { WidgetLayout } from "./layout";

export type WidgetType =
    | "v_box"
    | "h_box"
    | "anchor_pane"
    | "border_pane"
    | "grid"
    | "scroll_pane"
    | "split_pane"
    | "tab_pane"
    | "accordion"
    | "button"
    | "label"
    | "text_input"
    | "checkbox"
    | "radio_button"
    | "slider"
    | "progress_bar"
    | "combo_box"
    | "table_view"
    | "data_grid"
    | "tree_view"
    | "menu_bar"
    | "menu"
    | "menu_item"
    | "menu_separator"
    | "rectangle"
    | "circle"
    | "ellipse"
    | "line"
    | "path"
    | "chart"
    | "line_chart"
    | "bar_chart"
    | "pie_chart"
    | "scatter_chart"
    | "viewport3_d"
    | "canvas3_d"
    | "image"
    | "custom_component";

export type TextAlign = "left" | "center" | "right" | "justify";

export interface TableColumn {
    readonly id: string;
    readonly title: string;
    readonly width?: number;
    readonly field?: string;
}

export interface ChartSeriesDefinition {
    readonly id: string;
    readonly name: string;
    readonly color?: string;
    readonly data_field?: string;
    readonly values?: readonly number[];
}

export type AnimationTrigger = "on_mount" | "on_hover" | "on_click" | "state_change";

export type InterpolationCurve = "linear" | "ease_in_out" | "ease_in" | "ease_out" | "spring" | "bounce";

export type AnimatedProperty =
    | "opacity"
    | "scale"
    | "translation_x"
    | "translation_y"
    | "rotation"
    | "background_color"
    | "width"
    | "height";

export interface AnimationDefinition {
    readonly id: string;
    readonly trigger: AnimationTrigger;
    readonly property: AnimatedProperty;
    readonly from_value: number | string;
    readonly to_value: number | string;
    readonly duration_ms: number;
    readonly delay_ms?: number;
    readonly curve: InterpolationCurve;
    readonly spring_stiffness?: number;
    readonly spring_damping?: number;
    readonly iterations?: number;
    readonly auto_reverse?: boolean;
}

export interface WidgetProperties {
    readonly opacity?: number;
    readonly background_color?: string;
    readonly border_color?: string;
    readonly border_width?: number;
    readonly corner_radius?: number;
    readonly shadow_ref?: string;
    readonly text?: string;
    readonly placeholder?: string;
    readonly font_alias?: string;
    readonly font_size?: number;
    readonly font_weight?: FontWeight;
    readonly text_color?: string;
    readonly text_align?: TextAlign;
    readonly wrap_text?: boolean;
    readonly disabled?: boolean;
    readonly visible?: boolean;
    readonly is_default?: boolean;
    readonly is_cancel?: boolean;
    readonly checked?: boolean;
    readonly min_value?: number;
    readonly max_value?: number;
    readonly step_value?: number;
    readonly current_value?: number;
    readonly options?: readonly string[];
    readonly columns?: readonly TableColumn[];
    readonly grid_virtualized?: boolean;
    readonly row_height?: number;
    readonly total_rows?: number;
    readonly chart_type?: "line" | "bar" | "pie" | "scatter" | "candlestick" | "area";
    readonly chart_series?: readonly ChartSeriesDefinition[];
    readonly chart_x_axis?: string;
    readonly chart_y_axis?: string;
    readonly chart_show_legend?: boolean;
    readonly chart_show_grid?: boolean;
    readonly model_3d_path?: string;
    readonly camera_fov?: number;
    readonly auto_rotate?: boolean;
    readonly tree_expand_all?: boolean;
    readonly tree_show_root?: boolean;
    readonly image_path?: string;
    readonly image_alias?: string;
    readonly text_key?: string;
    readonly aria_label?: string;
    readonly aria_role?: string;
    readonly aria_description?: string;
    readonly custom_properties?: Readonly<Record<string, unknown>>;
}

export interface EventHandler {
    readonly handler_name: string;
    readonly message?: string;
    readonly navigate_to?: string;
}

export interface WidgetEvents {
    readonly on_click?: EventHandler;
    readonly on_change?: EventHandler;
    readonly on_hover?: EventHandler;
    readonly on_submit?: EventHandler;
    readonly on_focus?: EventHandler;
    readonly navigate?: string;
    readonly custom_events?: Readonly<Record<string, EventHandler>>;
}

export interface WidgetBindings {
    readonly value?: string;
    readonly items?: string;
    readonly selected?: string;
    readonly disabled?: string;
    readonly visible?: string;
    readonly custom_bindings?: Readonly<Record<string, string>>;
}

export interface WidgetNode {
    readonly id: string;
    readonly widget_type: WidgetType;
    readonly type?: WidgetType;
    readonly slot?: string;
    readonly properties?: WidgetProperties;
    readonly props?: WidgetProperties;
    readonly layout?: WidgetLayout;
    readonly events?: WidgetEvents;
    readonly bindings?: WidgetBindings;
    readonly animations?: readonly AnimationDefinition[];
    readonly children?: readonly WidgetNode[];
}
