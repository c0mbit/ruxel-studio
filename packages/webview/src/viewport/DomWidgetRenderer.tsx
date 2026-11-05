import { FC, useEffect, useRef } from "react";
import type {
    RuxDocument,
    ThemeConfig,
    WidgetNode,
    WidgetProperties,
    WidgetType,
} from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useViewportStore } from "../state/viewportStore";

interface DomWidgetRendererProps {
    readonly document: RuxDocument;
}

export const DomWidgetRenderer: FC<DomWidgetRendererProps> = ({ document }) => {
    const windowContainerRef = useRef<HTMLDivElement>(null);
    const camera = useViewportStore((state) => state.camera);
    const registerNodeBounds = useViewportStore(
        (state) => state.registerNodeBounds
    );
    const setHoveredNodeId = useViewportStore(
        (state) => state.setHoveredNodeId
    );
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);

    const { window: winConfig, root, theme } = document;

    useEffect(() => {
        const container = windowContainerRef.current;
        if (!container) {
            return;
        }

        const updateAllBounds = () => {
            const containerRect = container.getBoundingClientRect();
            if (containerRect.width === 0 || containerRect.height === 0) {
                return;
            }

            const elements = container.querySelectorAll<HTMLElement>("[data-node-id]");
            elements.forEach((el) => {
                const id = el.getAttribute("data-node-id");
                if (!id) {
                    return;
                }

                const elRect = el.getBoundingClientRect();
                const worldX = (elRect.left - containerRect.left) / camera.zoom;
                const worldY = (elRect.top - containerRect.top) / camera.zoom;
                const worldWidth = elRect.width / camera.zoom;
                const worldHeight = elRect.height / camera.zoom;

                registerNodeBounds({
                    id,
                    rect: {
                        x: Math.round(worldX),
                        y: Math.round(worldY),
                        width: Math.round(worldWidth),
                        height: Math.round(worldHeight),
                    },
                });
            });
        };

        updateAllBounds();

        const observer = new ResizeObserver(() => {
            updateAllBounds();
        });

        observer.observe(container);
        return () => {
            observer.disconnect();
        };
    }, [document, camera, registerNodeBounds]);

    const activePalette =
        theme.color_palettes[
            theme.active_scheme === "light" ? "light" : "dark"
        ];

    return (
        <div
            className="absolute top-0 left-0 select-none pointer-events-auto"
            style={{
                transform: `translate3d(${camera.panX}px, ${camera.panY}px, 0) scale(${camera.zoom})`,
                transformOrigin: "0 0",
            }}
        >
            <div
                ref={windowContainerRef}
                style={{
                    width: `${winConfig.initial_width}px`,
                    height: `${winConfig.initial_height}px`,
                    backgroundColor: activePalette.background,
                    color: activePalette.on_background,
                }}
                className="relative shadow-2xl flex flex-col overflow-hidden border border-zinc-700/80 rounded-t-lg"
            >
                {winConfig.decorations && (
                    <header className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0 select-none">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                            <span className="ml-2 text-xs font-medium text-zinc-300">
                                {winConfig.title}
                            </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                            {winConfig.initial_width} &times; {winConfig.initial_height}
                        </span>
                    </header>
                )}

                <div className="flex-1 relative overflow-hidden flex flex-col">
                    <WidgetDomNode
                        node={root}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            </div>
        </div>
    );
};

interface WidgetDomNodeProps {
    readonly node: WidgetNode;
    readonly selectedNodeId: string | null;
    readonly setHoveredNodeId: (id: string | null) => void;
}

const WidgetDomNode: FC<WidgetDomNodeProps> = ({
    node,
    selectedNodeId,
    setHoveredNodeId,
}) => {
    const isSelected = node.id === selectedNodeId;
    const { id, widget_type, properties, layout, children } = node;
    const theme = useEditorStore((state) => state.document?.theme);

    const style = computeNodeStyle(properties, layout, theme);

    const handleMouseEnter = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHoveredNodeId(id);
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHoveredNodeId(null);
    };

    return (
        <div
            data-node-id={id}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={style}
            className={`relative transition-shadow ${
                isSelected ? "outline-none" : ""
            } ${getContainerClasses(widget_type, layout)}`}
        >
            {renderWidgetContent(node, selectedNodeId, setHoveredNodeId, theme)}
            {children &&
                children.length > 0 &&
                !isSpecialSlotContainer(widget_type) &&
                children.map((child) => (
                    <WidgetDomNode
                        key={child.id}
                        node={child}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                ))}
            {isSpecialSlotContainer(widget_type) &&
                renderSlotChildren(node, selectedNodeId, setHoveredNodeId)}
        </div>
    );
};

function resolveColorToken(
    value?: string,
    theme?: ThemeConfig | null
): string | undefined {
    if (!value) {
        return undefined;
    }
    if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) {
        return value;
    }
    const tokenKey = value.startsWith("theme:")
        ? value.slice("theme:".length)
        : value.startsWith("theme.")
        ? value.slice("theme.".length)
        : value;
    if (theme && theme.color_palettes) {
        const activeScheme = theme.active_scheme === "dark" ? "dark" : "light";
        const palette = theme.color_palettes[activeScheme];
        if (palette && tokenKey in palette) {
            return palette[tokenKey as keyof typeof palette];
        }
        const altPalette = activeScheme === "dark" ? theme.color_palettes.light : theme.color_palettes.dark;
        if (altPalette && tokenKey in altPalette) {
            return altPalette[tokenKey as keyof typeof altPalette];
        }
    }
    return value;
}

function computeNodeStyle(
    props?: WidgetProperties,
    layout?: WidgetNode["layout"],
    theme?: ThemeConfig | null
): React.CSSProperties {
    const style: React.CSSProperties = {};

    if (!props && !layout) {
        return style;
    }

    if (props) {
        if (props.opacity !== undefined) {
            style.opacity = props.opacity;
        }
        if (props.background_color) {
            style.backgroundColor = resolveColorToken(props.background_color, theme);
        }
        if (props.border_color) {
            style.borderColor = resolveColorToken(props.border_color, theme);
        }
        if (props.border_width !== undefined) {
            style.borderWidth = `${props.border_width}px`;
            style.borderStyle = "solid";
        }
        if (props.corner_radius !== undefined) {
            style.borderRadius = `${props.corner_radius}px`;
        }
        if (props.text_color) {
            style.color = resolveColorToken(props.text_color, theme);
        }
        if (props.font_size) {
            style.fontSize = `${props.font_size}px`;
        }
        if (props.font_weight) {
            style.fontWeight = props.font_weight;
        }
        if (props.text_align) {
            style.textAlign = props.text_align;
        }
    }

    if (layout) {
        if (layout.dimensions) {
            const dims = layout.dimensions;
            if (dims.width) {
                if (dims.width.type === "fixed") {
                    style.width = `${dims.width.value}px`;
                } else if (dims.width.type === "percentage") {
                    style.width = `${dims.width.value}%`;
                } else if (dims.width.type === "hug_content") {
                    style.width = "max-content";
                }
            }
            if (dims.height) {
                if (dims.height.type === "fixed") {
                    style.height = `${dims.height.value}px`;
                } else if (dims.height.type === "percentage") {
                    style.height = `${dims.height.value}%`;
                } else if (dims.height.type === "hug_content") {
                    style.height = "max-content";
                }
            }
            if (dims.min_width !== undefined) {
                style.minWidth = `${dims.min_width}px`;
            }
            if (dims.min_height !== undefined) {
                style.minHeight = `${dims.min_height}px`;
            }
            if (dims.max_width !== undefined) {
                style.maxWidth = `${dims.max_width}px`;
            }
            if (dims.max_height !== undefined) {
                style.maxHeight = `${dims.max_height}px`;
            }
        }

        if (layout.spacing) {
            const { padding, margin } = layout.spacing;
            if (padding) {
                style.paddingTop = `${padding.top ?? 0}px`;
                style.paddingRight = `${padding.right ?? 0}px`;
                style.paddingBottom = `${padding.bottom ?? 0}px`;
                style.paddingLeft = `${padding.left ?? 0}px`;
            }
            if (margin) {
                style.marginTop = `${margin.top ?? 0}px`;
                style.marginRight = `${margin.right ?? 0}px`;
                style.marginBottom = `${margin.bottom ?? 0}px`;
                style.marginLeft = `${margin.left ?? 0}px`;
            }
        }

        if (layout.absolute) {
            style.position = "absolute";
            style.left = `${layout.absolute.x}px`;
            style.top = `${layout.absolute.y}px`;
            if (layout.absolute.z_index !== undefined) {
                style.zIndex = layout.absolute.z_index;
            }
        }

        if (layout.anchor) {
            style.position = "absolute";
            if (layout.anchor.left !== undefined) {
                style.left = `${layout.anchor.left}px`;
            }
            if (layout.anchor.top !== undefined) {
                style.top = `${layout.anchor.top}px`;
            }
            if (layout.anchor.right !== undefined) {
                style.right = `${layout.anchor.right}px`;
            }
            if (layout.anchor.bottom !== undefined) {
                style.bottom = `${layout.anchor.bottom}px`;
            }
        }
    }

    return style;
}

function getContainerClasses(
    type: WidgetType,
    layout?: WidgetNode["layout"]
): string {
    switch (type) {
        case "v_box":
            return "flex flex-col gap-2";
        case "h_box":
            return "flex flex-row items-center gap-2";
        case "anchor_pane":
            return "relative w-full h-full";
        case "border_pane":
            return "grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr_auto] w-full h-full";
        case "grid":
            return "grid gap-2";
        case "scroll_pane":
            return "overflow-auto";
        default:
            return "";
    }
}

function isSpecialSlotContainer(type: WidgetType): boolean {
    return type === "border_pane";
}

function renderSlotChildren(
    node: WidgetNode,
    selectedNodeId: string | null,
    setHoveredNodeId: (id: string | null) => void
): React.ReactNode {
    const children = node.children ?? [];
    const topChild = children.find((c) => c.slot === "top");
    const bottomChild = children.find((c) => c.slot === "bottom");
    const leftChild = children.find((c) => c.slot === "left");
    const rightChild = children.find((c) => c.slot === "right");
    const centerChild = children.find(
        (c) => c.slot === "center" || (!c.slot && c !== topChild && c !== bottomChild && c !== leftChild && c !== rightChild)
    );

    return (
        <>
            {topChild && (
                <div className="col-span-3">
                    <WidgetDomNode
                        node={topChild}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            )}
            {leftChild && (
                <div className="row-start-2 col-start-1">
                    <WidgetDomNode
                        node={leftChild}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            )}
            {centerChild && (
                <div className="row-start-2 col-start-2 w-full h-full">
                    <WidgetDomNode
                        node={centerChild}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            )}
            {rightChild && (
                <div className="row-start-2 col-start-3">
                    <WidgetDomNode
                        node={rightChild}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            )}
            {bottomChild && (
                <div className="col-span-3 row-start-3">
                    <WidgetDomNode
                        node={bottomChild}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                    />
                </div>
            )}
        </>
    );
}

function renderWidgetContent(
    node: WidgetNode,
    _selectedNodeId: string | null,
    _setHoveredNodeId: (id: string | null) => void,
    theme?: ThemeConfig | null
): React.ReactNode {
    const { widget_type, properties } = node;

    switch (widget_type) {
        case "button":
            return (
                <button
                    type="button"
                    disabled={properties?.disabled}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 select-none"
                >
                    {properties?.text ?? "Button"}
                </button>
            );
        case "label":
            return (
                <span className="text-sm text-zinc-200 select-none">
                    {properties?.text ?? "Label"}
                </span>
            );
        case "text_input":
            return (
                <input
                    type="text"
                    readOnly
                    placeholder={properties?.placeholder ?? "Input..."}
                    value={properties?.text ?? ""}
                    className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm outline-none w-full"
                />
            );
        case "checkbox":
            return (
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={properties?.checked ?? false}
                        readOnly
                        className="rounded border-zinc-700 bg-zinc-900 text-blue-600"
                    />
                    <span>{properties?.text ?? "Checkbox"}</span>
                </label>
            );
        case "radio_button":
            return (
                <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                    <input
                        type="radio"
                        checked={properties?.checked ?? false}
                        readOnly
                        className="border-zinc-700 bg-zinc-900 text-blue-600"
                    />
                    <span>{properties?.text ?? "Radio"}</span>
                </label>
            );
        case "slider":
            return (
                <input
                    type="range"
                    min={properties?.min_value ?? 0}
                    max={properties?.max_value ?? 100}
                    value={properties?.current_value ?? 50}
                    readOnly
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
            );
        case "progress_bar":
            return (
                <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                    <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{
                            width: `${Math.round(
                                ((properties?.current_value ?? 50) /
                                    (properties?.max_value ?? 100)) *
                                    100
                            )}%`,
                        }}
                    />
                </div>
            );
        case "combo_box":
            return (
                <div className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm flex items-center justify-between w-full">
                    <span>{properties?.text ?? "Select option"}</span>
                    <span className="text-zinc-500 text-xs">&#9662;</span>
                </div>
            );
        case "table_view":
            return (
                <div className="w-full border border-zinc-800 rounded overflow-hidden text-xs">
                    <div className="flex bg-zinc-900 text-zinc-400 font-semibold border-b border-zinc-800 p-2">
                        {properties?.columns?.map((col) => (
                            <div key={col.id} className="flex-1">
                                {col.title}
                            </div>
                        )) ?? <div className="flex-1">Columns</div>}
                    </div>
                    <div className="p-3 text-zinc-500 italic text-center">
                        Data Table Rows
                    </div>
                </div>
            );
        case "data_grid":
            return (
                <div className="w-full h-full min-h-[160px] border border-zinc-700/80 rounded bg-zinc-950 flex flex-col overflow-hidden text-xs font-sans shadow-inner">
                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px] text-zinc-400 select-none">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200">DataGrid</span>
                            <span className="px-1.5 py-0.2 rounded bg-blue-900/40 border border-blue-700/60 text-blue-300 text-[10px]">Virtualized</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">100,000 items</span>
                    </div>
                    <div className="flex bg-zinc-900/90 text-zinc-300 font-medium border-b border-zinc-800 text-[11px]">
                        {(properties?.columns && properties.columns.length > 0 ? properties.columns : [
                            { id: "col_id", title: "ID", width: 60 },
                            { id: "col_name", title: "Name", width: 140 },
                            { id: "col_role", title: "Role", width: 120 },
                            { id: "col_status", title: "Status", width: 100 },
                        ]).map((col) => (
                            <div
                                key={col.id}
                                style={{ width: col.width ? `${col.width}px` : "auto" }}
                                className="px-3 py-1.5 flex items-center justify-between border-r border-zinc-800/80 shrink-0 font-mono text-[11px]"
                            >
                                <span>{col.title}</span>
                                <span className="text-[9px] text-zinc-500">▲▼</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex-1 flex flex-col overflow-hidden relative font-mono text-[11px]">
                        {[
                            { id: "#001", name: "Alpha Service", role: "Cluster", status: "Active" },
                            { id: "#002", name: "Beta Worker", role: "Compute", status: "Active" },
                            { id: "#003", name: "Gamma Gateway", role: "Ingress", status: "Idle" },
                            { id: "#004", name: "Delta Storage", role: "Database", status: "Active" },
                            { id: "#005", name: "Epsilon Telemetry", role: "Observability", status: "Active" },
                        ].map((row, idx) => (
                            <div
                                key={row.id}
                                className={`flex items-center px-3 py-1 border-b border-zinc-900/70 ${
                                    idx % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"
                                } hover:bg-blue-950/20 text-zinc-300`}
                            >
                                <span className="w-[60px] shrink-0 text-zinc-500">{row.id}</span>
                                <span className="w-[140px] shrink-0 font-sans text-zinc-200">{row.name}</span>
                                <span className="w-[120px] shrink-0 text-zinc-400">{row.role}</span>
                                <span className="w-[100px] shrink-0 text-emerald-400 text-[10px]">● {row.status}</span>
                            </div>
                        ))}
                        <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-zinc-900/60 border-l border-zinc-800/60 flex flex-col justify-start p-0.5">
                            <div className="w-full h-8 bg-zinc-600/70 rounded-sm" />
                        </div>
                    </div>
                    <div className="px-3 py-1 bg-zinc-900/80 border-t border-zinc-800 text-[10px] text-zinc-500 flex justify-between select-none">
                        <span>Rendering rows 1-5 of 100,000 (virtual window 140px)</span>
                        <span>Row Height: {properties?.row_height ?? 28}px</span>
                    </div>
                </div>
            );
        case "chart":
        case "line_chart":
        case "bar_chart":
        case "pie_chart":
        case "scatter_chart":
            return (
                <div className="w-full h-full min-h-[180px] p-3 rounded bg-zinc-950 border border-zinc-800 flex flex-col justify-between overflow-hidden shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-200">{properties?.text ?? "Analytics & Financial Series"}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{properties?.chart_x_axis ?? "Q1-Q4"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> ARR</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Margin</span>
                        </div>
                    </div>
                    <div className="flex-1 w-full relative flex items-center justify-center">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 400 160" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="chartGradientBlue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                                </linearGradient>
                                <linearGradient id="chartGradientGreen" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                                </linearGradient>
                            </defs>
                            <line x1="0" y1="40" x2="400" y2="40" stroke="#27272a" strokeDasharray="3 3" />
                            <line x1="0" y1="80" x2="400" y2="80" stroke="#27272a" strokeDasharray="3 3" />
                            <line x1="0" y1="120" x2="400" y2="120" stroke="#27272a" strokeDasharray="3 3" />
                            <path
                                d="M0,130 C60,110 120,80 180,95 C240,110 300,50 400,30 L400,160 L0,160 Z"
                                fill="url(#chartGradientBlue)"
                            />
                            <path
                                d="M0,130 C60,110 120,80 180,95 C240,110 300,50 400,30"
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="2.5"
                            />
                            <path
                                d="M0,145 C70,130 140,115 210,120 C280,125 340,90 400,75 L400,160 L0,160 Z"
                                fill="url(#chartGradientGreen)"
                            />
                            <path
                                d="M0,145 C70,130 140,115 210,120 C280,125 340,90 400,75"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeDasharray="4 2"
                            />
                            <circle cx="180" cy="95" r="4" fill="#3b82f6" stroke="#18181b" strokeWidth="2" />
                            <circle cx="400" cy="30" r="4" fill="#3b82f6" stroke="#18181b" strokeWidth="2" />
                        </svg>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-500 font-mono">
                        <span>Jan</span>
                        <span>Mar</span>
                        <span>Jun</span>
                        <span>Sep</span>
                        <span>Dec</span>
                    </div>
                </div>
            );
        case "tree_view":
            return (
                <div className="w-full h-full min-h-[160px] p-2 rounded bg-zinc-950 border border-zinc-800 text-xs font-sans flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 px-1 py-1 font-semibold text-zinc-200 border-b border-zinc-800/60 pb-1.5 mb-1">
                        <span className="text-zinc-400">▾</span>
                        <span>📂</span>
                        <span>{properties?.text ?? "Project Explorer"}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 pl-3">
                        <div className="flex items-center gap-1.5 px-1 py-0.5 rounded text-zinc-300 hover:bg-zinc-900 cursor-pointer">
                            <span className="text-zinc-500 text-[10px]">▾</span>
                            <span>📁</span>
                            <span className="font-mono text-[11px]">src/</span>
                        </div>
                        <div className="flex flex-col gap-0.5 pl-4 border-l border-zinc-800 ml-1.5">
                            <div className="flex items-center gap-1.5 px-1 py-0.5 rounded bg-blue-900/30 text-blue-300">
                                <span>📄</span>
                                <span className="font-mono text-[11px]">main.rs</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-1 py-0.5 rounded text-zinc-400 hover:bg-zinc-900">
                                <span>📄</span>
                                <span className="font-mono text-[11px]">ui_generated.rs</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-1 py-0.5 rounded text-zinc-400 hover:bg-zinc-900">
                                <span>📄</span>
                                <span className="font-mono text-[11px]">controller.rs</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-1 py-0.5 rounded text-zinc-400 hover:bg-zinc-900 cursor-pointer">
                            <span className="text-zinc-500 text-[10px]">▸</span>
                            <span>📁</span>
                            <span className="font-mono text-[11px]">assets/</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-1 py-0.5 rounded text-zinc-400 hover:bg-zinc-900">
                            <span className="text-zinc-500 text-[10px]">▸</span>
                            <span>⚙️</span>
                            <span className="font-mono text-[11px]">Cargo.toml</span>
                        </div>
                    </div>
                </div>
            );
        case "viewport3_d":
        case "canvas3_d":
            return (
                <div className="w-full h-full min-h-[180px] rounded bg-gradient-to-b from-slate-950 via-zinc-950 to-slate-900 border border-zinc-700/80 relative flex flex-col justify-between overflow-hidden p-2 shadow-2xl">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 z-10 bg-zinc-900/70 backdrop-blur px-2 py-1 rounded border border-zinc-800">
                        <span className="font-semibold text-zinc-200 flex items-center gap-1">
                            <span>🧊</span> Viewport3D
                        </span>
                        <span className="font-mono text-zinc-400">FOV: {properties?.camera_fov ?? 60}° • GLTF PBR</span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <svg className="w-full h-full opacity-30" viewBox="0 0 200 140">
                            <line x1="100" y1="70" x2="20" y2="130" stroke="#38bdf8" strokeWidth="0.5" />
                            <line x1="100" y1="70" x2="180" y2="130" stroke="#38bdf8" strokeWidth="0.5" />
                            <line x1="100" y1="70" x2="100" y2="10" stroke="#38bdf8" strokeWidth="0.5" />
                            <polygon points="100,20 160,50 160,110 100,135 40,110 40,50" fill="none" stroke="#60a5fa" strokeWidth="0.75" strokeDasharray="2 2" />
                            <polygon points="100,45 135,65 135,100 100,115 65,100 65,65" fill="#3b82f6" fillOpacity="0.15" stroke="#38bdf8" strokeWidth="1.5" />
                            <line x1="100" y1="45" x2="100" y2="115" stroke="#38bdf8" strokeWidth="1" />
                            <line x1="100" y1="80" x2="135" y2="100" stroke="#38bdf8" strokeWidth="1" />
                            <line x1="100" y1="80" x2="65" y2="100" stroke="#38bdf8" strokeWidth="1" />
                        </svg>
                    </div>
                    <div className="z-10 flex items-end justify-between text-[9px] text-zinc-400 font-mono">
                        <div className="flex items-center gap-1.5 bg-black/50 px-1.5 py-0.5 rounded border border-zinc-800">
                            <span className="text-rose-400">X: 1.0</span>
                            <span className="text-emerald-400">Y: 0.0</span>
                            <span className="text-blue-400">Z: 0.5</span>
                        </div>
                        <span className="text-zinc-500">60 FPS • {properties?.model_3d_path ?? "mesh_model.gltf"}</span>
                    </div>
                </div>
            );
        case "menu_bar":
            return (
                <div className="flex items-center gap-4 bg-zinc-900 px-3 py-1 border-b border-zinc-800 text-xs text-zinc-300">
                    <span>File</span>
                    <span>Edit</span>
                    <span>View</span>
                    <span>Help</span>
                </div>
            );
        case "rectangle":
            return (
                <div
                    className="w-24 h-16 bg-zinc-800/80 border border-zinc-700 rounded"
                    style={{
                        backgroundColor: resolveColorToken(properties?.background_color, theme),
                        borderColor: resolveColorToken(properties?.border_color, theme),
                        borderRadius: properties?.corner_radius,
                    }}
                />
            );
        case "circle":
            return (
                <div
                    className="w-16 h-16 rounded-full bg-zinc-800/80 border border-zinc-700"
                    style={{
                        backgroundColor: resolveColorToken(properties?.background_color, theme),
                        borderColor: resolveColorToken(properties?.border_color, theme),
                    }}
                />
            );
        default:
            return null;
    }
}

