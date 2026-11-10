import { FC, useEffect, useRef, useState, useMemo, useCallback } from "react";
import type {
    FlexContainer,
    GridContainer,
    GridTrack,
    RuxDocument,
    ThemeConfig,
    WidgetNode,
    WidgetProperties,
    WidgetType,
} from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useViewportStore } from "../state/viewportStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";
import {
    validateWidgetTree,
    type WidgetValidationError,
} from "../utils/schemaValidator";
import { WidgetErrorBoundary } from "../components/WidgetErrorBoundary";
import { GenericWidgetPlaceholder } from "./GenericWidgetPlaceholder";
import { WidgetLayoutHandles } from "./WidgetLayoutHandles";
import { ViewportResizeHandles } from "./ViewportResizeHandles";
import {
    insertChild,
    moveNode,
    isDescendant,
    normalizeWidgetNode,
} from "../utils/treeTraversal";
import {
    collectAllIds,
    createDefaultWidgetNode,
    getWidgetTypeLabel,
    isContainerWidget,
} from "../utils/widgetFactory";

interface DomWidgetRendererProps {
    readonly document: RuxDocument;
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

function regenerateNodeIds(
    node: WidgetNode,
    existingIds: Set<string>
): WidgetNode {
    let base = node.id.replace(/_\d+$/, "");
    let count = 1;
    let newId = `${base}_${count}`;
    while (existingIds.has(newId)) {
        count++;
        newId = `${base}_${count}`;
    }
    existingIds.add(newId);

    return {
        ...node,
        id: newId,
        children: node.children?.map((c) =>
            regenerateNodeIds(c, existingIds)
        ),
    };
}

export const DomWidgetRenderer: FC<DomWidgetRendererProps> = ({
    document,
    onDocumentChange,
}) => {
    const windowContainerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const camera = useViewportStore((state) => state.camera);
    const registerNodeBounds = useViewportStore(
        (state) => state.registerNodeBounds
    );
    const setHoveredNodeId = useViewportStore(
        (state) => state.setHoveredNodeId
    );
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);

    const deviceMode = useViewportStore((state) => state.deviceMode);
    const effectiveDimensions = useViewportStore((state) =>
        state.getEffectiveDimensions()
    );

    const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);

    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);
    const validationMap = useMemo(() => validateWidgetTree(document.root), [document.root]);

    const { window: winConfig, root, theme } = document;

    useEffect(() => {
        const container = windowContainerRef.current;
        const scrollContainer = scrollContainerRef.current;
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
        if (scrollContainer) {
            observer.observe(scrollContainer);
            scrollContainer.addEventListener("scroll", updateAllBounds, { passive: true });
        }

        return () => {
            observer.disconnect();
            if (scrollContainer) {
                scrollContainer.removeEventListener("scroll", updateAllBounds);
            }
        };
    }, [document, camera, effectiveDimensions, registerNodeBounds]);

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
                data-testid="viewport-device-frame"
                data-device-mode={deviceMode}
                style={{
                    width: `${effectiveDimensions.width}px`,
                    height: `${effectiveDimensions.height}px`,
                    backgroundColor: activePalette.background,
                    color: activePalette.on_background,
                }}
                className={`relative shadow-2xl flex flex-col border border-zinc-700/80 rounded-t-lg transition-[width,height] duration-75 ${
                    deviceMode === "mobile"
                        ? "rounded-b-2xl border-zinc-600/90 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)]"
                        : ""
                }`}
            >
                {/* Draggable Viewport Frame Resize Handles for Custom Mode */}
                {deviceMode === "responsive" && (
                    <ViewportResizeHandles
                        effectiveDimensions={effectiveDimensions}
                        zoom={camera.zoom}
                    />
                )}

                {winConfig.decorations && (
                    <header className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0 select-none">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                            <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                            <span className="ml-2 text-xs font-medium text-zinc-300">
                                {winConfig.title}
                            </span>
                            {deviceMode !== "responsive" && (
                                <span className="ml-1.5 px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono text-[10px] uppercase font-semibold">
                                    {deviceMode}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                            {effectiveDimensions.width} &times; {effectiveDimensions.height}
                        </span>
                    </header>
                )}

                {/* Device Simulated Scroll Area */}
                <div
                    ref={scrollContainerRef}
                    data-testid="viewport-scroll-container"
                    className="flex-1 relative overflow-y-auto overflow-x-hidden flex flex-col scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
                >
                    <WidgetDomNode
                        node={root}
                        rootNode={root}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={camera.zoom}
                    />
                </div>
            </div>
        </div>
    );
};

interface WidgetDomNodeProps {
    readonly node: WidgetNode;
    readonly rootNode: WidgetNode;
    readonly selectedNodeId: string | null;
    readonly setHoveredNodeId: (id: string | null) => void;
    readonly setSelectedNodeId: (id: string | null) => void;
    readonly validationMap: Map<string, WidgetValidationError[]>;
    readonly dragOverContainerId: string | null;
    readonly setDragOverContainerId: (id: string | null) => void;
    readonly executeNodeMutation: (
        description: string,
        mutator: (root: WidgetNode) => WidgetNode
    ) => void;
    readonly cameraZoom: number;
}

const WidgetDomNode: FC<WidgetDomNodeProps> = ({
    node,
    rootNode,
    selectedNodeId,
    setHoveredNodeId,
    setSelectedNodeId,
    validationMap,
    dragOverContainerId,
    setDragOverContainerId,
    executeNodeMutation,
    cameraZoom,
}) => {
    const isSelected = node.id === selectedNodeId;
    const { id, widget_type, properties, layout, children } = node;
    const theme = useEditorStore((state) => state.document?.theme);
    const resolvedAssets = useEditorStore((state) => state.resolvedAssets);

    const isContainer = isContainerWidget(widget_type);
    const isDropTarget = dragOverContainerId === id;
    const errors = validationMap.get(id);
    const hasErrors = errors && errors.length > 0;

    const style = computeNodeStyle(properties, layout, theme);

    const handleMouseEnter = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHoveredNodeId(id);
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHoveredNodeId(null);
    };

    const handleContainerDragOver = useCallback(
        (e: React.DragEvent) => {
            if (!isContainer) return;
            const hasTypes =
                e.dataTransfer.types.includes("application/ruxel-widget-type") ||
                e.dataTransfer.types.includes("application/ruxel-preset-json") ||
                e.dataTransfer.types.includes("application/ruxel-tree-node-id");

            if (hasTypes) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                setDragOverContainerId(id);
            }
        },
        [isContainer, id, setDragOverContainerId]
    );

    const handleContainerDragEnter = useCallback(
        (e: React.DragEvent) => {
            if (!isContainer) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverContainerId(id);
        },
        [isContainer, id, setDragOverContainerId]
    );

    const handleContainerDragLeave = useCallback(
        (e: React.DragEvent) => {
            if (!isContainer) return;
            e.stopPropagation();
            if (e.currentTarget === e.target) {
                setDragOverContainerId(null);
            }
        },
        [isContainer, setDragOverContainerId]
    );

    const handleContainerDrop = useCallback(
        (e: React.DragEvent) => {
            if (!isContainer) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverContainerId(null);

            const widgetType = e.dataTransfer.getData(
                "application/ruxel-widget-type"
            ) as WidgetType;
            const presetJson = e.dataTransfer.getData(
                "application/ruxel-preset-json"
            );
            const treeNodeId = e.dataTransfer.getData(
                "application/ruxel-tree-node-id"
            );

            if (treeNodeId) {
                if (treeNodeId !== id && !isDescendant(rootNode, treeNodeId, id)) {
                    executeNodeMutation(`Move ${treeNodeId} into ${id}`, (root) =>
                        moveNode(root, treeNodeId, id)
                    );
                    setSelectedNodeId(treeNodeId);
                }
                return;
            }

            const existingIds = collectAllIds(rootNode);

            if (presetJson) {
                try {
                    const parsed = normalizeWidgetNode(
                        JSON.parse(presetJson) as Record<string, unknown>
                    );
                    const freshNode = regenerateNodeIds(parsed, existingIds);
                    executeNodeMutation(
                        `Insert Preset into ${id}`,
                        (root) => insertChild(root, id, freshNode)
                    );
                    setSelectedNodeId(freshNode.id);
                } catch {
                    // Ignore parse error
                }
            } else if (widgetType) {
                const freshNode = createDefaultWidgetNode(widgetType, existingIds);
                executeNodeMutation(
                    `Insert ${getWidgetTypeLabel(widgetType)} into ${id}`,
                    (root) => insertChild(root, id, freshNode)
                );
                setSelectedNodeId(freshNode.id);
            }
        },
        [isContainer, id, rootNode, executeNodeMutation, setSelectedNodeId, setDragOverContainerId]
    );

    return (
        <WidgetErrorBoundary nodeId={id}>
            <div
                data-node-id={id}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onDragOver={isContainer ? handleContainerDragOver : undefined}
                onDragEnter={isContainer ? handleContainerDragEnter : undefined}
                onDragLeave={isContainer ? handleContainerDragLeave : undefined}
                onDrop={isContainer ? handleContainerDrop : undefined}
                style={style}
                className={`relative transition-all ${
                    isSelected ? "outline-none" : ""
                } ${
                    isDropTarget
                        ? "ring-2 ring-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.6)] border-blue-400 bg-blue-500/10"
                        : ""
                } ${
                    hasErrors
                        ? "ring-2 ring-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.5)] border-red-500"
                        : ""
                } ${getContainerClasses(widget_type, layout)}`}
            >
                {/* Visual Drop Zone Indicator Badge */}
                {isDropTarget && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[9px] font-semibold shadow-lg z-50 pointer-events-none flex items-center gap-1 border border-blue-400 whitespace-nowrap">
                        <span>↳</span>
                        <span>Drop into {getWidgetTypeLabel(widget_type)} (#{id})</span>
                    </div>
                )}

                {/* Visual Validation Error Badge & Tooltip */}
                {hasErrors && (
                    <div
                        className="group absolute -top-2.5 -right-2.5 z-40"
                        title={errors.map((e) => e.message).join("\n")}
                    >
                        <span className="w-5 h-5 rounded-full bg-red-600 border border-red-300 text-white text-[11px] font-bold flex items-center justify-center shadow-md cursor-help">
                            !
                        </span>
                        <div className="hidden group-hover:flex absolute right-0 top-6 px-2.5 py-1.5 rounded bg-zinc-950/95 border border-red-500 text-red-200 text-xs font-mono shadow-2xl z-50 whitespace-nowrap backdrop-blur-sm flex-col gap-0.5 pointer-events-none">
                            <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                                Validation Warning
                            </div>
                            {errors.map((err, i) => (
                                <div key={i} className="text-zinc-200 text-[11px]">
                                    • {err.message}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Visual Layout Handles for Selected Widget */}
                {isSelected && (
                    <WidgetLayoutHandles
                        node={node}
                        cameraZoom={cameraZoom}
                        onLayoutChange={executeNodeMutation}
                    />
                )}

                {renderWidgetContent(node, selectedNodeId, setHoveredNodeId, theme, resolvedAssets)}

                {children &&
                    children.length > 0 &&
                    !isSpecialSlotContainer(widget_type) &&
                    children.map((child) => (
                        <WidgetDomNode
                            key={child.id}
                            node={child}
                            rootNode={rootNode}
                            selectedNodeId={selectedNodeId}
                            setHoveredNodeId={setHoveredNodeId}
                            setSelectedNodeId={setSelectedNodeId}
                            validationMap={validationMap}
                            dragOverContainerId={dragOverContainerId}
                            setDragOverContainerId={setDragOverContainerId}
                            executeNodeMutation={executeNodeMutation}
                            cameraZoom={cameraZoom}
                        />
                    ))}

                {isSpecialSlotContainer(widget_type) &&
                    renderSlotChildren(
                        node,
                        rootNode,
                        selectedNodeId,
                        setHoveredNodeId,
                        setSelectedNodeId,
                        validationMap,
                        dragOverContainerId,
                        setDragOverContainerId,
                        executeNodeMutation,
                        cameraZoom
                    )}
            </div>
        </WidgetErrorBoundary>
    );
};

function resolvePropertyValue(prop?: unknown, fallback = ""): string {
    if (prop === undefined || prop === null) return fallback;
    if (typeof prop === "string") return prop;
    if (typeof prop === "object") {
        const obj = prop as Record<string, unknown>;
        if ("value" in obj && typeof obj.value === "string") return obj.value;
        if ("static" in obj && typeof obj.static === "string") return obj.static;
        if ("binding" in obj && typeof obj.binding === "string") return obj.binding;
    }
    return String(prop);
}

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

function formatCssFlexAlign(val?: string): string | undefined {
    if (!val) return undefined;
    switch (val) {
        case "flex_start":
            return "flex-start";
        case "flex_end":
            return "flex-end";
        case "space_between":
            return "space-between";
        case "space_around":
            return "space-around";
        case "space_evenly":
            return "space-evenly";
        default:
            return val;
    }
}

function formatGridTrack(track: GridTrack): string {
    switch (track.unit) {
        case "fixed":
            return `${track.value}px`;
        case "percentage":
            return `${track.value}%`;
        case "fr":
            return `${track.value}fr`;
        case "auto":
            return "auto";
        case "min_max":
            return `minmax(${track.value[0]}px, ${track.value[1]}px)`;
    }
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
        if (props.spacing !== undefined) {
            style.gap = `${props.spacing}px`;
        }
        if (props.padding !== undefined) {
            style.padding = `${props.padding}px`;
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
                } else if (dims.width.type === "fill") {
                    style.width = dims.width.value ? `${dims.width.value}%` : "100%";
                    style.flexGrow = 1;
                    style.minWidth = 0;
                }
            }
            if (dims.height) {
                if (dims.height.type === "fixed") {
                    style.height = `${dims.height.value}px`;
                } else if (dims.height.type === "percentage") {
                    style.height = `${dims.height.value}%`;
                } else if (dims.height.type === "hug_content") {
                    style.height = "max-content";
                } else if (dims.height.type === "fill") {
                    style.height = dims.height.value ? `${dims.height.value}%` : "100%";
                    style.flexGrow = 1;
                    style.minHeight = 0;
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

        // Rust Flexbox behaviors: fill_width and fill_height
        if (props?.fill_width) {
            style.flexGrow = layout.flex_item?.grow ?? 1;
            style.alignSelf = style.alignSelf ?? "stretch";
            style.width = "100%";
            style.minWidth = 0;
        }

        if (props?.fill_height) {
            style.flexGrow = layout.flex_item?.grow ?? 1;
            style.height = "100%";
            style.minHeight = 0;
        }

        if (layout.flex_item) {
            const fi = layout.flex_item;
            if (fi.grow !== undefined) {
                style.flexGrow = fi.grow;
            }
            if (fi.shrink !== undefined) {
                style.flexShrink = fi.shrink;
            }
            if (fi.basis) {
                if (fi.basis.type === "fixed") {
                    style.flexBasis = `${fi.basis.value}px`;
                } else if (fi.basis.type === "percentage") {
                    style.flexBasis = `${fi.basis.value}%`;
                } else if (fi.basis.type === "auto") {
                    style.flexBasis = "auto";
                }
            }
            if (fi.align_self) {
                style.alignSelf = formatCssFlexAlign(fi.align_self);
            }
        }

        if (layout.container) {
            const c = layout.container;
            if (c.type === "flex") {
                const fc = c as unknown as FlexContainer;
                if (fc.direction) {
                    style.flexDirection =
                        fc.direction === "row_reverse"
                            ? "row-reverse"
                            : fc.direction === "column_reverse"
                            ? "column-reverse"
                            : fc.direction;
                }
                if (fc.wrap) {
                    style.flexWrap =
                        fc.wrap === "wrap_reverse"
                            ? "wrap-reverse"
                            : fc.wrap === "no_wrap"
                            ? "nowrap"
                            : "wrap";
                }
                if (fc.justify_content) {
                    style.justifyContent = formatCssFlexAlign(fc.justify_content);
                }
                if (fc.align_items) {
                    style.alignItems = formatCssFlexAlign(fc.align_items);
                }
                if (fc.gap !== undefined) {
                    style.gap = `${fc.gap}px`;
                }
            } else if (c.type === "grid") {
                const gc = c as unknown as GridContainer;
                if (gc.columns && gc.columns.length > 0) {
                    style.gridTemplateColumns = gc.columns.map(formatGridTrack).join(" ");
                }
                if (gc.rows && gc.rows.length > 0) {
                    style.gridTemplateRows = gc.rows.map(formatGridTrack).join(" ");
                }
                if (gc.column_gap !== undefined) {
                    style.columnGap = `${gc.column_gap}px`;
                }
                if (gc.row_gap !== undefined) {
                    style.rowGap = `${gc.row_gap}px`;
                }
                if (gc.align_items) {
                    style.alignItems = formatCssFlexAlign(gc.align_items);
                }
                if (gc.justify_items) {
                    style.justifyItems = formatCssFlexAlign(gc.justify_items);
                }
            }
        }

        if (layout.grid) {
            const g = layout.grid;
            if (g.column !== undefined) {
                style.gridColumnStart = g.column;
            }
            if (g.column_span !== undefined) {
                style.gridColumnEnd = `span ${g.column_span}`;
            }
            if (g.row !== undefined) {
                style.gridRowStart = g.row;
            }
            if (g.row_span !== undefined) {
                style.gridRowEnd = `span ${g.row_span}`;
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
    const isFlexWrap =
        layout?.container?.type === "flex" &&
        (layout.container as unknown as FlexContainer).wrap === "wrap";

    switch (type) {
        case "v_box":
            return `flex flex-col gap-2 ${isFlexWrap ? "flex-wrap" : ""}`;
        case "h_box":
            return `flex flex-row items-center gap-2 ${isFlexWrap ? "flex-wrap" : ""}`;
        case "anchor_pane":
            return "relative w-full h-full";
        case "border_pane":
            return "grid grid-rows-[auto_1fr_auto] grid-cols-[auto_1fr_auto] w-full h-full";
        case "grid":
            return "grid gap-2";
        case "scroll_pane":
            return "overflow-auto";
        case "conditional_node":
            return "flex flex-col gap-2 p-2 rounded border border-dashed border-amber-500/30 bg-amber-950/10";
        case "generic_widget":
            return "flex flex-col gap-2 p-2 rounded border border-purple-500/30 bg-purple-950/10";
        default:
            return "";
    }
}

function isSpecialSlotContainer(type: WidgetType): boolean {
    return type === "border_pane";
}

function renderSlotChildren(
    node: WidgetNode,
    rootNode: WidgetNode,
    selectedNodeId: string | null,
    setHoveredNodeId: (id: string | null) => void,
    setSelectedNodeId: (id: string | null) => void,
    validationMap: Map<string, WidgetValidationError[]>,
    dragOverContainerId: string | null,
    setDragOverContainerId: (id: string | null) => void,
    executeNodeMutation: (
        description: string,
        mutator: (root: WidgetNode) => WidgetNode
    ) => void,
    cameraZoom: number
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
                        rootNode={rootNode}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={cameraZoom}
                    />
                </div>
            )}
            {leftChild && (
                <div className="row-start-2 col-start-1">
                    <WidgetDomNode
                        node={leftChild}
                        rootNode={rootNode}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={cameraZoom}
                    />
                </div>
            )}
            {centerChild && (
                <div className="row-start-2 col-start-2 w-full h-full">
                    <WidgetDomNode
                        node={centerChild}
                        rootNode={rootNode}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={cameraZoom}
                    />
                </div>
            )}
            {rightChild && (
                <div className="row-start-2 col-start-3">
                    <WidgetDomNode
                        node={rightChild}
                        rootNode={rootNode}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={cameraZoom}
                    />
                </div>
            )}
            {bottomChild && (
                <div className="col-span-3 row-start-3">
                    <WidgetDomNode
                        node={bottomChild}
                        rootNode={rootNode}
                        selectedNodeId={selectedNodeId}
                        setHoveredNodeId={setHoveredNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                        validationMap={validationMap}
                        dragOverContainerId={dragOverContainerId}
                        setDragOverContainerId={setDragOverContainerId}
                        executeNodeMutation={executeNodeMutation}
                        cameraZoom={cameraZoom}
                    />
                </div>
            )}
        </>
    );
}

interface CanvasImageWidgetProps {
    readonly node: WidgetNode;
    readonly resolvedAsset?: { readonly webviewUri: string; readonly exists: boolean };
    readonly theme?: ThemeConfig | null;
}

const CanvasImageWidget: FC<CanvasImageWidgetProps> = ({ node, resolvedAsset }) => {
    const [hasError, setHasError] = useState(false);
    const rawPath = node.properties?.image_path ?? "";

    useEffect(() => {
        setHasError(false);
    }, [rawPath, resolvedAsset?.webviewUri]);

    const isHttpOrData =
        rawPath.startsWith("data:") ||
        rawPath.startsWith("http://") ||
        rawPath.startsWith("https://");

    const effectiveSrc = resolvedAsset?.webviewUri || (isHttpOrData ? rawPath : null);
    const isMissingOrFailed =
        !rawPath ||
        hasError ||
        (resolvedAsset && !resolvedAsset.exists) ||
        (!effectiveSrc && !isHttpOrData);

    if (isMissingOrFailed) {
        let statusLabel = "Missing Path";
        if (rawPath) {
            if (resolvedAsset && !resolvedAsset.exists) {
                statusLabel = "File Not Found";
            } else if (hasError) {
                statusLabel = "Load Error";
            } else {
                statusLabel = "Unresolved Asset";
            }
        }

        return (
            <div
                className="w-full h-full min-h-[96px] min-w-[96px] p-3 rounded-md bg-slate-900/90 border border-slate-700/80 flex flex-col items-center justify-center gap-1.5 text-center select-none shadow-inner overflow-hidden"
                style={{
                    borderRadius:
                        node.properties?.corner_radius !== undefined
                            ? `${node.properties.corner_radius}px`
                            : undefined,
                }}
                title={rawPath ? `Image source: ${rawPath} (${statusLabel})` : "No image path specified"}
            >
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                    <svg
                        className="w-4 h-4 text-slate-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        <line x1="3" y1="3" x2="21" y2="21" stroke="#f43f5e" strokeWidth="2" />
                    </svg>
                </div>
                <div className="flex flex-col items-center max-w-full px-1 overflow-hidden">
                    <span className="text-[11px] font-mono text-slate-300 truncate max-w-[200px]">
                        {rawPath || "No image path"}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider font-semibold font-mono text-rose-400 bg-rose-950/60 border border-rose-900/60 px-1.5 py-0.2 rounded mt-0.5">
                        {statusLabel}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <img
            src={effectiveSrc ?? ""}
            alt={resolvePropertyValue(node.properties?.text, rawPath || "image")}
            onError={() => setHasError(true)}
            className="w-full h-full object-contain pointer-events-none select-none block"
            style={{
                borderRadius:
                    node.properties?.corner_radius !== undefined
                        ? `${node.properties.corner_radius}px`
                        : undefined,
            }}
        />
    );
};

function renderWidgetContent(
    node: WidgetNode,
    _selectedNodeId: string | null,
    _setHoveredNodeId: (id: string | null) => void,
    theme?: ThemeConfig | null,
    resolvedAssets?: Readonly<Record<string, { readonly webviewUri: string; readonly exists: boolean }>>
): React.ReactNode {
    const { widget_type, properties } = node;

    switch (widget_type) {
        case "image":
            return (
                <CanvasImageWidget
                    node={node}
                    resolvedAsset={
                        node.properties?.image_path
                            ? resolvedAssets?.[node.properties.image_path]
                            : undefined
                    }
                    theme={theme}
                />
            );
        case "button":
            return (
                <button
                    type="button"
                    disabled={properties?.disabled}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 select-none"
                >
                    {resolvePropertyValue(properties?.text, "Button")}
                </button>
            );
        case "label":
            return (
                <span className="text-sm text-zinc-200 select-none">
                    {resolvePropertyValue(properties?.text, "Label")}
                </span>
            );
        case "text_input":
            return (
                <input
                    type="text"
                    readOnly
                    placeholder={resolvePropertyValue(properties?.placeholder, "Input...")}
                    value={resolvePropertyValue(properties?.text, "")}
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
                    <span>{resolvePropertyValue(properties?.text, "Checkbox")}</span>
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
                    <span>{resolvePropertyValue(properties?.text, "Radio")}</span>
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
                    <span>{resolvePropertyValue(properties?.text, "Select option")}</span>
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
                            <span className="text-xs font-semibold text-zinc-200">{resolvePropertyValue(properties?.text, "Analytics & Financial Series")}</span>
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
                        <span>{resolvePropertyValue(properties?.text, "Project Explorer")}</span>
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
        case "conditional_node":
            return (
                <div className="w-full flex flex-col p-2 rounded border border-dashed border-amber-500/50 bg-amber-950/20 text-amber-300">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-semibold px-2 py-1 bg-amber-500/20 rounded w-fit mb-1 border border-amber-500/30">
                        <span>🔀 Condition Switcher:</span>
                        <span className="text-amber-100">{node.properties?.condition ?? "if condition"}</span>
                    </div>
                </div>
            );
        case "generic_widget":
            return (
                <GenericWidgetPlaceholder
                    node={node}
                    isSelected={_selectedNodeId === node.id}
                />
            );
        default:
            return null;
    }
}

