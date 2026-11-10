import type {
    WidgetType,
    WidgetNode,
    WidgetProperties,
    WidgetLayout,
    Size,
} from "@ruxel/shared-types";

export interface PaletteCategory {
    readonly name: string;
    readonly types: readonly WidgetType[];
}

export const PALETTE_CATEGORIES: readonly PaletteCategory[] = [
    {
        name: "Enterprise & Advanced",
        types: ["data_grid", "chart", "tree_view", "viewport3_d"],
    },
    {
        name: "Containers",
        types: [
            "v_box",
            "h_box",
            "anchor_pane",
            "border_pane",
            "grid",
            "scroll_pane",
            "split_pane",
            "tab_pane",
            "accordion",
        ],
    },
    {
        name: "Controls",
        types: [
            "button",
            "label",
            "text_input",
            "checkbox",
            "radio_button",
            "slider",
            "progress_bar",
            "combo_box",
            "table_view",
            "data_grid",
            "tree_view",
        ],
    },
    {
        name: "Menu",
        types: ["menu_bar", "menu", "menu_item", "menu_separator"],
    },
    {
        name: "Miscellaneous",
        types: [],
    },
    {
        name: "Shapes",
        types: ["rectangle", "circle", "ellipse", "line", "path"],
    },
    {
        name: "Charts",
        types: ["chart", "line_chart", "bar_chart", "pie_chart", "scatter_chart"],
    },
    {
        name: "3D",
        types: ["viewport3_d", "canvas3_d"],
    },
    {
        name: "Custom",
        types: ["custom_component", "conditional_node", "generic_widget"],
    },
];

const CONTAINER_TYPES: ReadonlySet<WidgetType> = new Set<WidgetType>([
    "v_box",
    "h_box",
    "anchor_pane",
    "border_pane",
    "grid",
    "scroll_pane",
    "split_pane",
    "tab_pane",
    "accordion",
    "menu_bar",
    "menu",
    "tree_view",
    "conditional_node",
    "generic_widget",
]);

export function isContainerWidget(widgetType: WidgetType): boolean {
    return CONTAINER_TYPES.has(widgetType);
}

const WIDGET_TYPE_LABELS: Readonly<Record<WidgetType, string>> = {
    v_box: "VBox",
    h_box: "HBox",
    anchor_pane: "AnchorPane",
    border_pane: "BorderPane",
    grid: "Grid",
    scroll_pane: "ScrollPane",
    split_pane: "SplitPane",
    tab_pane: "TabPane",
    accordion: "Accordion",
    button: "Button",
    label: "Label",
    text_input: "TextInput",
    checkbox: "CheckBox",
    radio_button: "RadioButton",
    slider: "Slider",
    progress_bar: "ProgressBar",
    combo_box: "ComboBox",
    table_view: "TableView",
    data_grid: "DataGrid",
    tree_view: "TreeView",
    menu_bar: "MenuBar",
    menu: "Menu",
    menu_item: "MenuItem",
    menu_separator: "MenuSeparator",
    rectangle: "Rectangle",
    circle: "Circle",
    ellipse: "Ellipse",
    line: "Line",
    path: "Path",
    chart: "Chart",
    line_chart: "LineChart",
    bar_chart: "BarChart",
    pie_chart: "PieChart",
    scatter_chart: "ScatterChart",
    viewport3_d: "Viewport3D",
    canvas3_d: "Canvas3D",
    image: "Image",
    custom_component: "CustomComponent",
    conditional_node: "Condition Switcher",
    generic_widget: "Generic Widget",
};

export function getWidgetTypeLabel(widgetType: WidgetType): string {
    return WIDGET_TYPE_LABELS[widgetType];
}

const WIDGET_TYPE_ICONS: Readonly<Record<WidgetType, string>> = {
    v_box: "⬜",
    h_box: "⬜",
    anchor_pane: "📌",
    border_pane: "🔲",
    grid: "▦",
    scroll_pane: "📜",
    split_pane: "⬛",
    tab_pane: "📑",
    accordion: "🪗",
    button: "🔘",
    label: "🏷️",
    text_input: "📝",
    checkbox: "☑️",
    radio_button: "🔵",
    slider: "🎚️",
    progress_bar: "📊",
    combo_box: "📋",
    table_view: "📅",
    data_grid: "⊞",
    tree_view: "🌳",
    menu_bar: "☰",
    menu: "📂",
    menu_item: "▸",
    menu_separator: "─",
    rectangle: "▬",
    circle: "●",
    ellipse: "⬭",
    line: "╱",
    path: "〰",
    chart: "📈",
    line_chart: "📈",
    bar_chart: "📊",
    pie_chart: "🥧",
    scatter_chart: "⊙",
    viewport3_d: "🧊",
    canvas3_d: "🧊",
    image: "🖼️",
    custom_component: "🧩",
    conditional_node: "🔀",
    generic_widget: "⚡",
};

export function getWidgetTypeIcon(widgetType: WidgetType): string {
    return WIDGET_TYPE_ICONS[widgetType];
}

function generateBasePrefix(widgetType: WidgetType): string {
    return widgetType.replace(/3_d$/, "3d");
}

function generateUniqueId(
    widgetType: WidgetType,
    existingIds: ReadonlySet<string>
): string {
    const prefix = generateBasePrefix(widgetType);
    let counter = 1;

    while (existingIds.has(`${prefix}_${counter}`)) {
        counter++;
    }

    return `${prefix}_${counter}`;
}

export function collectAllIds(node: WidgetNode): Set<string> {
    const ids = new Set<string>();
    const stack: WidgetNode[] = [node];

    while (stack.length > 0) {
        const current = stack.pop()!;
        ids.add(current.id);
        if (current.children) {
            for (const child of current.children) {
                stack.push(child);
            }
        }
    }

    return ids;
}

function fixedSize(value: number): Size {
    return { type: "fixed", value };
}

interface DefaultWidgetConfig {
    readonly width: number;
    readonly height: number;
    readonly properties?: WidgetProperties;
    readonly layoutOverrides?: Partial<WidgetLayout>;
    readonly children?: readonly WidgetNode[];
}

function getDefaultConfig(widgetType: WidgetType): DefaultWidgetConfig {
    switch (widgetType) {
        case "v_box":
            return {
                width: 200,
                height: 300,
                layoutOverrides: {
                    container: { type: "flex", direction: "column", gap: 8 },
                },
            };
        case "h_box":
            return {
                width: 400,
                height: 60,
                layoutOverrides: {
                    container: { type: "flex", direction: "row", gap: 8 },
                },
            };
        case "anchor_pane":
            return {
                width: 400,
                height: 300,
                layoutOverrides: { container: { type: "anchor" } },
            };
        case "border_pane":
            return {
                width: 400,
                height: 300,
                layoutOverrides: { container: { type: "border" } },
            };
        case "grid":
            return {
                width: 400,
                height: 300,
                layoutOverrides: {
                    container: { type: "grid", rows: 3, columns: 3, gap: 8 },
                },
            };
        case "scroll_pane":
            return {
                width: 300,
                height: 200,
                layoutOverrides: {
                    container: {
                        type: "flex",
                        direction: "column",
                    },
                },
            };
        case "split_pane":
            return {
                width: 400,
                height: 300,
                layoutOverrides: {
                    container: {
                        type: "flex",
                        direction: "row",
                    },
                },
            };
        case "tab_pane":
            return {
                width: 400,
                height: 300,
                layoutOverrides: { container: { type: "flex", direction: "column" } },
            };
        case "accordion":
            return { width: 300, height: 400 };
        case "button":
            return {
                width: 120,
                height: 36,
                properties: { text: "Button" },
            };
        case "label":
            return {
                width: 100,
                height: 24,
                properties: { text: "Label" },
            };
        case "text_input":
            return {
                width: 200,
                height: 32,
                properties: { placeholder: "Enter text..." },
            };
        case "checkbox":
            return {
                width: 120,
                height: 24,
                properties: { text: "Checkbox", checked: false },
            };
        case "radio_button":
            return {
                width: 120,
                height: 24,
                properties: { text: "RadioButton", checked: false },
            };
        case "slider":
            return {
                width: 200,
                height: 24,
                properties: { min_value: 0, max_value: 100, current_value: 50 },
            };
        case "progress_bar":
            return {
                width: 200,
                height: 16,
                properties: { min_value: 0, max_value: 100, current_value: 40 },
            };
        case "combo_box":
            return {
                width: 160,
                height: 32,
                properties: {
                    text: "Select option",
                    options: ["Option 1", "Option 2", "Option 3"],
                },
            };
        case "table_view":
            return {
                width: 400,
                height: 250,
                properties: {
                    columns: [
                        { id: "col_1", title: "Column 1", width: 150 },
                        { id: "col_2", title: "Column 2", width: 150 },
                    ],
                },
            };
        case "data_grid":
            return {
                width: 480,
                height: 260,
                properties: {
                    grid_virtualized: true,
                    row_height: 28,
                    total_rows: 100000,
                    columns: [
                        { id: "col_id", title: "ID", width: 60, field: "id" },
                        { id: "col_name", title: "Name", width: 140, field: "name" },
                        { id: "col_role", title: "Role", width: 120, field: "role" },
                        { id: "col_status", title: "Status", width: 100, field: "status" },
                    ],
                },
            };
        case "tree_view":
            return {
                width: 240,
                height: 280,
                properties: {
                    tree_expand_all: false,
                    tree_show_root: true,
                    text: "Workspace Root",
                },
            };
        case "menu_bar":
            return { width: 400, height: 30 };
        case "menu":
            return {
                width: 120,
                height: 30,
                properties: { text: "Menu" },
            };
        case "menu_item":
            return {
                width: 150,
                height: 28,
                properties: { text: "Menu Item" },
            };
        case "menu_separator":
            return { width: 150, height: 2 };
        case "rectangle":
            return {
                width: 100,
                height: 80,
                properties: {
                    background_color: "#3b82f6",
                    corner_radius: 4,
                },
            };
        case "circle":
            return {
                width: 80,
                height: 80,
                properties: { background_color: "#8b5cf6" },
            };
        case "ellipse":
            return {
                width: 120,
                height: 80,
                properties: { background_color: "#06b6d4" },
            };
        case "line":
            return {
                width: 150,
                height: 2,
                properties: { border_color: "#71717a", border_width: 2 },
            };
        case "path":
            return {
                width: 100,
                height: 100,
                properties: { border_color: "#71717a", border_width: 1 },
            };
        case "chart":
            return {
                width: 440,
                height: 260,
                properties: {
                    chart_type: "line",
                    chart_show_legend: true,
                    chart_show_grid: true,
                    chart_x_axis: "Quarter",
                    chart_y_axis: "Revenue ($M)",
                    chart_series: [
                        { id: "s1", name: "Enterprise ARR", color: "#3b82f6", values: [15, 28, 42, 65, 88, 120] },
                        { id: "s2", name: "Operational Costs", color: "#ef4444", values: [10, 18, 25, 34, 45, 55] },
                    ],
                },
            };
        case "line_chart":
            return { width: 400, height: 250 };
        case "bar_chart":
            return { width: 400, height: 250 };
        case "pie_chart":
            return { width: 300, height: 300 };
        case "scatter_chart":
            return { width: 400, height: 250 };
        case "viewport3_d":
            return {
                width: 380,
                height: 260,
                properties: {
                    model_3d_path: "assets/mesh_model.gltf",
                    camera_fov: 60,
                    auto_rotate: true,
                },
            };
        case "canvas3_d":
            return { width: 400, height: 300 };
        case "image":
            return {
                width: 200,
                height: 150,
                properties: {
                    background_color: "#27272a",
                    corner_radius: 6,
                },
            };
        case "custom_component":
            return { width: 200, height: 200 };
        case "conditional_node":
            return {
                width: 250,
                height: 120,
                properties: { condition: "if condition" },
            };
        case "generic_widget":
            return {
                width: 200,
                height: 80,
                properties: { custom_type: "CustomWidget", raw_args: "" },
            };
    }
}

export function createDefaultWidgetNode(
    widgetType: WidgetType,
    existingIds: ReadonlySet<string>
): WidgetNode {
    const id = generateUniqueId(widgetType, existingIds);
    const config = getDefaultConfig(widgetType);

    const layout: WidgetLayout = {
        dimensions: {
            width: fixedSize(config.width),
            height: fixedSize(config.height),
        },
        absolute: { x: 0, y: 0 },
        ...config.layoutOverrides,
    };

    return {
        id,
        widget_type: widgetType,
        properties: config.properties ?? {},
        layout,
        children: isContainerWidget(widgetType) ? (config.children ?? []) : undefined,
    };
}

export function filterPaletteCategoriesByQuery(
    categories: readonly PaletteCategory[],
    query: string
): readonly PaletteCategory[] {
    if (query.trim().length === 0) {
        return categories;
    }

    const lowerQuery = query.toLowerCase().trim();

    return categories
        .map((category) => ({
            name: category.name,
            types: category.types.filter((widgetType) => {
                const label = getWidgetTypeLabel(widgetType).toLowerCase();
                const rawType = widgetType.toLowerCase();
                return (
                    label.includes(lowerQuery) ||
                    rawType.includes(lowerQuery) ||
                    category.name.toLowerCase().includes(lowerQuery)
                );
            }),
        }))
        .filter((category) => category.types.length > 0);
}
