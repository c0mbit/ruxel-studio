import { FC, useCallback, useState } from "react";
import type {
    WidgetNode,
    WidgetLayout,
    Size,
    RectOffsets,
    Dimensions,
    FlexDirection,
    FlexWrap,
    JustifyContent,
    AlignItems,
    AlignSelf,
    BorderPosition,
    AnchorConstraints,
    GridPlacement,
    FlexItem,
    AbsolutePosition,
    FlexContainer,
    GridContainer,
    GridTrack,
} from "@ruxel/shared-types";
import { useEditorStore } from "../../state/editorStore";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { findNodeById, findParentNode } from "../../utils/treeTraversal";
import { isContainerWidget } from "../../utils/widgetFactory";
import {
    CollapsibleSection,
    PropertyRow,
    NumericInput,
    SegmentedControl,
} from "./PropertiesTab";

interface LayoutTabProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

type SizeMode = "fixed" | "percentage" | "fill" | "hug_content" | "auto";

const SIZE_MODES: readonly SizeMode[] = [
    "fixed",
    "percentage",
    "fill",
    "hug_content",
    "auto",
];

const SIZE_MODE_LABELS: Readonly<Record<SizeMode, string>> = {
    fixed: "Px",
    percentage: "%",
    fill: "Fill",
    hug_content: "Hug",
    auto: "Auto",
};

const FLEX_DIRECTIONS: readonly FlexDirection[] = [
    "row",
    "column",
    "row_reverse",
    "column_reverse",
];

const FLEX_WRAPS: readonly FlexWrap[] = ["no_wrap", "wrap", "wrap_reverse"];

const JUSTIFY_CONTENTS: readonly JustifyContent[] = [
    "flex_start",
    "flex_end",
    "center",
    "space_between",
    "space_around",
    "space_evenly",
];

const ALIGN_ITEMS_OPTIONS: readonly AlignItems[] = [
    "flex_start",
    "flex_end",
    "center",
    "stretch",
    "baseline",
];

const ALIGN_SELF_OPTIONS: readonly AlignSelf[] = [
    "auto",
    "flex_start",
    "flex_end",
    "center",
    "stretch",
    "baseline",
];

const BORDER_POSITIONS: readonly BorderPosition[] = [
    "top",
    "bottom",
    "left",
    "right",
    "center",
];

export const LayoutTab: FC<LayoutTabProps> = ({ onDocumentChange }) => {
    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(
        new Set(["spacing", "dimensions", "constraints", "container"])
    );
    const [marginLocked, setMarginLocked] = useState(false);
    const [paddingLocked, setPaddingLocked] = useState(false);

    const selectedNode =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
            : null;

    const parentNode =
        document && selectedNodeId
            ? findParentNode(document.root, selectedNodeId)
            : null;

    const toggleSection = useCallback((section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    }, []);

    const updateLayout = useCallback(
        (updater: (layout: WidgetLayout) => WidgetLayout) => {
            if (!selectedNodeId) {
                return;
            }

            executeNodeMutation(
                `Update layout on ${selectedNodeId}`,
                (root) =>
                    updateNodeLayoutInTree(root, selectedNodeId, updater)
            );
        },
        [selectedNodeId, executeNodeMutation]
    );

    if (!selectedNode) {
        return (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs p-4">
                Select a widget to inspect layout
            </div>
        );
    }

    const layout = selectedNode.layout ?? {};
    const spacing = layout.spacing ?? {};
    const dimensions = layout.dimensions ?? {};
    const isContainer = isContainerWidget(selectedNode.widget_type);
    const parentIsAnchorPane = parentNode?.layout?.container?.type === "anchor";
    const parentIsBorderPane = parentNode?.layout?.container?.type === "border";
    const parentIsFlex =
        parentNode?.layout?.container?.type === "flex";
    const parentIsGrid =
        parentNode?.layout?.container?.type === "grid";

    return (
        <div className="flex flex-col gap-0 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
            <CollapsibleSection
                title="Spacing"
                sectionKey="spacing"
                expanded={expandedSections.has("spacing")}
                onToggle={toggleSection}
            >
                <BoxModelEditor
                    label="Margin"
                    offsets={spacing.margin ?? {}}
                    locked={marginLocked}
                    onToggleLock={() => setMarginLocked(!marginLocked)}
                    onChange={(offsets) =>
                        updateLayout((l) => ({
                            ...l,
                            spacing: { ...l.spacing, margin: offsets },
                        }))
                    }
                />
                <BoxModelEditor
                    label="Padding"
                    offsets={spacing.padding ?? {}}
                    locked={paddingLocked}
                    onToggleLock={() => setPaddingLocked(!paddingLocked)}
                    onChange={(offsets) =>
                        updateLayout((l) => ({
                            ...l,
                            spacing: { ...l.spacing, padding: offsets },
                        }))
                    }
                />
            </CollapsibleSection>

            <CollapsibleSection
                title="Dimensions"
                sectionKey="dimensions"
                expanded={expandedSections.has("dimensions")}
                onToggle={toggleSection}
            >
                <SizeEditor
                    label="Width"
                    size={dimensions.width}
                    onChange={(size) =>
                        updateLayout((l) => ({
                            ...l,
                            dimensions: { ...l.dimensions, width: size },
                        }))
                    }
                />
                <SizeEditor
                    label="Height"
                    size={dimensions.height}
                    onChange={(size) =>
                        updateLayout((l) => ({
                            ...l,
                            dimensions: { ...l.dimensions, height: size },
                        }))
                    }
                />

                <PropertyRow label="Min W">
                    <NumericInput
                        value={dimensions.min_width ?? 0}
                        min={0}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                dimensions: { ...l.dimensions, min_width: v },
                            }))
                        }
                    />
                </PropertyRow>

                <PropertyRow label="Min H">
                    <NumericInput
                        value={dimensions.min_height ?? 0}
                        min={0}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                dimensions: { ...l.dimensions, min_height: v },
                            }))
                        }
                    />
                </PropertyRow>

                <PropertyRow label="Max W">
                    <NumericInput
                        value={dimensions.max_width ?? 99999}
                        min={0}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                dimensions: { ...l.dimensions, max_width: v },
                            }))
                        }
                    />
                </PropertyRow>

                <PropertyRow label="Max H">
                    <NumericInput
                        value={dimensions.max_height ?? 99999}
                        min={0}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                dimensions: { ...l.dimensions, max_height: v },
                            }))
                        }
                    />
                </PropertyRow>

                <PropertyRow label="Aspect">
                    <NumericInput
                        value={dimensions.aspect_ratio ?? 0}
                        min={0}
                        max={100}
                        step={0.01}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                dimensions: {
                                    ...l.dimensions,
                                    aspect_ratio: v > 0 ? v : undefined,
                                },
                            }))
                        }
                    />
                </PropertyRow>
            </CollapsibleSection>

            <CollapsibleSection
                title="Child Constraints"
                sectionKey="constraints"
                expanded={expandedSections.has("constraints")}
                onToggle={toggleSection}
            >
                <PropertyRow label="X">
                    <NumericInput
                        value={layout.absolute?.x ?? 0}
                        min={-99999}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                absolute: { ...(l.absolute ?? { x: 0, y: 0 }), x: v },
                            }))
                        }
                    />
                </PropertyRow>
                <PropertyRow label="Y">
                    <NumericInput
                        value={layout.absolute?.y ?? 0}
                        min={-99999}
                        max={99999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                absolute: { ...(l.absolute ?? { x: 0, y: 0 }), y: v },
                            }))
                        }
                    />
                </PropertyRow>
                <PropertyRow label="Z-Index">
                    <NumericInput
                        value={layout.absolute?.z_index ?? 0}
                        min={-9999}
                        max={9999}
                        step={1}
                        onChange={(v) =>
                            updateLayout((l) => ({
                                ...l,
                                absolute: {
                                    ...(l.absolute ?? { x: 0, y: 0 }),
                                    z_index: v,
                                },
                            }))
                        }
                    />
                </PropertyRow>

                {parentIsAnchorPane && (
                    <AnchorConstraintsEditor
                        anchor={layout.anchor ?? {}}
                        onChange={(anchor) =>
                            updateLayout((l) => ({ ...l, anchor }))
                        }
                    />
                )}

                {parentIsBorderPane && (
                    <PropertyRow label="Slot">
                        <SegmentedControl
                            options={BORDER_POSITIONS as unknown as string[]}
                            value={selectedNode.slot ?? "center"}
                            onChange={() => {}}
                        />
                    </PropertyRow>
                )}

                {parentIsFlex && (
                    <FlexItemEditor
                        flexItem={layout.flex_item ?? {}}
                        onChange={(fi) =>
                            updateLayout((l) => ({ ...l, flex_item: fi }))
                        }
                    />
                )}

                {parentIsGrid && (
                    <GridPlacementEditor
                        placement={layout.grid ?? {}}
                        onChange={(gp) =>
                            updateLayout((l) => ({ ...l, grid: gp }))
                        }
                    />
                )}
            </CollapsibleSection>

            {isContainer && (
                <CollapsibleSection
                    title="Container Layout"
                    sectionKey="container"
                    expanded={expandedSections.has("container")}
                    onToggle={toggleSection}
                >
                    <ContainerLayoutEditor
                        container={layout.container}
                        onChange={(container) =>
                            updateLayout((l) => ({ ...l, container }))
                        }
                    />
                </CollapsibleSection>
            )}
        </div>
    );
};

interface BoxModelEditorProps {
    readonly label: string;
    readonly offsets: RectOffsets;
    readonly locked: boolean;
    readonly onToggleLock: () => void;
    readonly onChange: (offsets: RectOffsets) => void;
}

const BoxModelEditor: FC<BoxModelEditorProps> = ({
    label,
    offsets,
    locked,
    onToggleLock,
    onChange,
}) => {
    const handleChange = (
        side: keyof RectOffsets,
        value: number
    ) => {
        if (locked) {
            onChange({ top: value, right: value, bottom: value, left: value });
        } else {
            onChange({ ...offsets, [side]: value });
        }
    };

    return (
        <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500 font-medium">
                    {label}
                </span>
                <button
                    type="button"
                    onClick={onToggleLock}
                    className={`w-5 h-5 flex items-center justify-center rounded ${
                        locked
                            ? "bg-blue-600/20 text-blue-400"
                            : "bg-zinc-800 text-zinc-500"
                    } hover:bg-zinc-700 transition-colors`}
                    title={locked ? "Unlock sides" : "Lock all sides"}
                >
                    <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        {locked ? (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        ) : (
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                            />
                        )}
                    </svg>
                </button>
            </div>
            <div className="grid grid-cols-4 gap-1">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                    <div key={side} className="flex flex-col items-center">
                        <span className="text-[9px] text-zinc-600 uppercase mb-0.5">
                            {side.charAt(0)}
                        </span>
                        <input
                            type="number"
                            value={offsets[side] ?? 0}
                            min={0}
                            max={9999}
                            step={1}
                            onChange={(e) =>
                                handleChange(
                                    side,
                                    parseInt(e.target.value, 10) || 0
                                )
                            }
                            className="w-full h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 text-center outline-none focus:border-blue-500/70"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

interface SizeEditorProps {
    readonly label: string;
    readonly size: Size | undefined;
    readonly onChange: (size: Size) => void;
}

const SizeEditor: FC<SizeEditorProps> = ({ label, size, onChange }) => {
    const currentMode: SizeMode = size?.type ?? "auto";
    const currentValue =
        size && "value" in size ? (size as { value: number }).value : 0;

    const handleModeChange = (mode: SizeMode) => {
        switch (mode) {
            case "fixed":
                onChange({ type: "fixed", value: currentValue || 100 });
                break;
            case "percentage":
                onChange({ type: "percentage", value: currentValue || 100 });
                break;
            case "fill":
                onChange({ type: "fill", value: currentValue || 1 });
                break;
            case "hug_content":
                onChange({ type: "hug_content" });
                break;
            case "auto":
                onChange({ type: "auto" });
                break;
        }
    };

    const hasNumericValue =
        currentMode === "fixed" ||
        currentMode === "percentage" ||
        currentMode === "fill";

    return (
        <div className="flex items-center gap-2 mb-1">
            <span className="w-20 shrink-0 text-[11px] text-zinc-500 text-right">
                {label}
            </span>
            <div className="flex bg-zinc-950 rounded border border-zinc-700 overflow-hidden shrink-0">
                {SIZE_MODES.map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => handleModeChange(mode)}
                        className={`px-1.5 py-0.5 text-[9px] transition-colors ${
                            currentMode === mode
                                ? "bg-blue-600 text-white font-medium"
                                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                        }`}
                        title={mode}
                    >
                        {SIZE_MODE_LABELS[mode]}
                    </button>
                ))}
            </div>
            {hasNumericValue && (
                <NumericInput
                    value={currentValue}
                    min={0}
                    max={99999}
                    step={currentMode === "fill" ? 0.1 : 1}
                    onChange={(v) =>
                        onChange({
                            type: currentMode as "fixed" | "percentage" | "fill",
                            value: v,
                        })
                    }
                    width={55}
                />
            )}
        </div>
    );
};

interface AnchorConstraintsEditorProps {
    readonly anchor: AnchorConstraints;
    readonly onChange: (anchor: AnchorConstraints) => void;
}

const AnchorConstraintsEditor: FC<AnchorConstraintsEditorProps> = ({
    anchor,
    onChange,
}) => (
    <div className="mt-2">
        <span className="text-[11px] text-zinc-500 font-medium mb-1 block">
            Anchor Pins
        </span>
        <div className="grid grid-cols-2 gap-1">
            {(["top", "right", "bottom", "left"] as const).map((side) => {
                const isActive = anchor[side] !== undefined;
                return (
                    <div key={side} className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => {
                                if (isActive) {
                                    const next = { ...anchor };
                                    delete (next as Record<string, unknown>)[side];
                                    onChange(next);
                                } else {
                                    onChange({ ...anchor, [side]: 0 });
                                }
                            }}
                            className={`w-5 h-5 flex items-center justify-center rounded border text-[9px] transition-colors ${
                                isActive
                                    ? "bg-blue-600/20 border-blue-500/50 text-blue-400"
                                    : "bg-zinc-950 border-zinc-700 text-zinc-500"
                            }`}
                        >
                            📌
                        </button>
                        <span className="text-[10px] text-zinc-400 capitalize w-10">
                            {side}
                        </span>
                        {isActive && (
                            <input
                                type="number"
                                value={anchor[side] ?? 0}
                                min={0}
                                max={9999}
                                step={1}
                                onChange={(e) =>
                                    onChange({
                                        ...anchor,
                                        [side]: parseInt(e.target.value, 10) || 0,
                                    })
                                }
                                className="w-12 h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 text-center outline-none focus:border-blue-500/70"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    </div>
);

interface FlexItemEditorProps {
    readonly flexItem: FlexItem;
    readonly onChange: (flexItem: FlexItem) => void;
}

const FlexItemEditor: FC<FlexItemEditorProps> = ({ flexItem, onChange }) => (
    <div className="mt-2 space-y-1">
        <span className="text-[11px] text-zinc-500 font-medium block">
            Flex Item
        </span>
        <PropertyRow label="Grow">
            <NumericInput
                value={flexItem.grow ?? 0}
                min={0}
                max={99}
                step={1}
                onChange={(v) => onChange({ ...flexItem, grow: v })}
            />
        </PropertyRow>
        <PropertyRow label="Shrink">
            <NumericInput
                value={flexItem.shrink ?? 1}
                min={0}
                max={99}
                step={1}
                onChange={(v) => onChange({ ...flexItem, shrink: v })}
            />
        </PropertyRow>
        <PropertyRow label="Align Self">
            <select
                value={flexItem.align_self ?? "auto"}
                onChange={(e) =>
                    onChange({
                        ...flexItem,
                        align_self: e.target.value as AlignSelf,
                    })
                }
                className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
            >
                {ALIGN_SELF_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </PropertyRow>
    </div>
);

interface GridPlacementEditorProps {
    readonly placement: GridPlacement;
    readonly onChange: (placement: GridPlacement) => void;
}

const GridPlacementEditor: FC<GridPlacementEditorProps> = ({
    placement,
    onChange,
}) => (
    <div className="mt-2 space-y-1">
        <span className="text-[11px] text-zinc-500 font-medium block">
            Grid Placement
        </span>
        <div className="grid grid-cols-2 gap-1">
            <PropertyRow label="Col">
                <NumericInput
                    value={placement.column ?? 0}
                    min={0}
                    max={99}
                    step={1}
                    onChange={(v) => onChange({ ...placement, column: v })}
                />
            </PropertyRow>
            <PropertyRow label="Row">
                <NumericInput
                    value={placement.row ?? 0}
                    min={0}
                    max={99}
                    step={1}
                    onChange={(v) => onChange({ ...placement, row: v })}
                />
            </PropertyRow>
            <PropertyRow label="Col Span">
                <NumericInput
                    value={placement.column_span ?? 1}
                    min={1}
                    max={99}
                    step={1}
                    onChange={(v) => onChange({ ...placement, column_span: v })}
                />
            </PropertyRow>
            <PropertyRow label="Row Span">
                <NumericInput
                    value={placement.row_span ?? 1}
                    min={1}
                    max={99}
                    step={1}
                    onChange={(v) => onChange({ ...placement, row_span: v })}
                />
            </PropertyRow>
        </div>
    </div>
);

interface ContainerLayoutEditorProps {
    readonly container: import("@ruxel/shared-types").ContainerLayout | undefined;
    readonly onChange: (
        container: import("@ruxel/shared-types").ContainerLayout
    ) => void;
}

const ContainerLayoutEditor: FC<ContainerLayoutEditorProps> = ({
    container,
    onChange,
}) => {
    const containerType = container?.type ?? "flex";

    const handleTypeChange = (type: string) => {
        switch (type) {
            case "flex":
                onChange({ type: "flex", direction: "column", gap: 8 });
                break;
            case "grid":
                onChange({
                    type: "grid",
                    columns: [
                        { unit: "fr", value: 1 },
                        { unit: "fr", value: 1 },
                    ],
                    rows: [{ unit: "fr", value: 1 }],
                    column_gap: 8,
                    row_gap: 8,
                });
                break;
            case "absolute":
                onChange({ type: "absolute" });
                break;
            case "anchor":
                onChange({ type: "anchor" });
                break;
            case "border":
                onChange({ type: "border" });
                break;
        }
    };

    return (
        <div className="space-y-2">
            <PropertyRow label="Type">
                <select
                    value={containerType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                >
                    <option value="flex">Flex</option>
                    <option value="grid">Grid</option>
                    <option value="absolute">Absolute</option>
                    <option value="anchor">Anchor</option>
                    <option value="border">Border</option>
                </select>
            </PropertyRow>

            {containerType === "flex" && container && (
                <FlexContainerEditor
                    flex={container as unknown as FlexContainer}
                    onChange={onChange}
                />
            )}

            {containerType === "grid" && container && (
                <GridContainerEditor
                    grid={container as unknown as GridContainer}
                    onChange={onChange}
                />
            )}
        </div>
    );
};

interface FlexContainerEditorProps {
    readonly flex: FlexContainer;
    readonly onChange: (container: import("@ruxel/shared-types").ContainerLayout) => void;
}

const FlexContainerEditor: FC<FlexContainerEditorProps> = ({
    flex,
    onChange,
}) => (
    <div className="space-y-1">
        <PropertyRow label="Direction">
            <select
                value={flex.direction ?? "column"}
                onChange={(e) =>
                    onChange({
                        type: "flex",
                        ...flex,
                        direction: e.target.value as FlexDirection,
                    })
                }
                className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
            >
                {FLEX_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                        {d.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </PropertyRow>

        <PropertyRow label="Wrap">
            <select
                value={flex.wrap ?? "no_wrap"}
                onChange={(e) =>
                    onChange({
                        type: "flex",
                        ...flex,
                        wrap: e.target.value as FlexWrap,
                    })
                }
                className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
            >
                {FLEX_WRAPS.map((w) => (
                    <option key={w} value={w}>
                        {w.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </PropertyRow>

        <PropertyRow label="Justify">
            <select
                value={flex.justify_content ?? "flex_start"}
                onChange={(e) =>
                    onChange({
                        type: "flex",
                        ...flex,
                        justify_content: e.target.value as JustifyContent,
                    })
                }
                className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
            >
                {JUSTIFY_CONTENTS.map((j) => (
                    <option key={j} value={j}>
                        {j.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </PropertyRow>

        <PropertyRow label="Align">
            <select
                value={flex.align_items ?? "stretch"}
                onChange={(e) =>
                    onChange({
                        type: "flex",
                        ...flex,
                        align_items: e.target.value as AlignItems,
                    })
                }
                className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
            >
                {ALIGN_ITEMS_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                        {a.replace(/_/g, " ")}
                    </option>
                ))}
            </select>
        </PropertyRow>

        <PropertyRow label="Gap">
            <NumericInput
                value={flex.gap ?? 0}
                min={0}
                max={999}
                step={1}
                onChange={(v) =>
                    onChange({
                        type: "flex",
                        ...flex,
                        gap: v,
                    })
                }
            />
        </PropertyRow>
    </div>
);

interface GridContainerEditorProps {
    readonly grid: GridContainer;
    readonly onChange: (container: import("@ruxel/shared-types").ContainerLayout) => void;
}

const GridContainerEditor: FC<GridContainerEditorProps> = ({
    grid,
    onChange,
}) => {
    const columns = (grid.columns ?? []) as readonly GridTrack[];
    const rows = (grid.rows ?? []) as readonly GridTrack[];

    const addTrack = (dimension: "columns" | "rows") => {
        const current = dimension === "columns" ? columns : rows;
        const newTrack: GridTrack = { unit: "fr", value: 1 };
        onChange({
            type: "grid",
            ...grid,
            [dimension]: [...current, newTrack],
        });
    };

    const removeTrack = (dimension: "columns" | "rows", index: number) => {
        const current = dimension === "columns" ? columns : rows;
        onChange({
            type: "grid",
            ...grid,
            [dimension]: current.filter((_, i) => i !== index),
        });
    };

    return (
        <div className="space-y-2">
            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-500">Columns</span>
                    <button
                        type="button"
                        onClick={() => addTrack("columns")}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                    >
                        + Col
                    </button>
                </div>
                {columns.map((track, i) => (
                    <div key={i} className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-zinc-600 w-6">
                            C{i + 1}
                        </span>
                        <GridTrackInput
                            track={track}
                            onChange={(t) => {
                                const next = [...columns];
                                next[i] = t;
                                onChange({
                                    type: "grid",
                                    ...grid,
                                    columns: next,
                                });
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => removeTrack("columns", i)}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-500">Rows</span>
                    <button
                        type="button"
                        onClick={() => addTrack("rows")}
                        className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                    >
                        + Row
                    </button>
                </div>
                {rows.map((track, i) => (
                    <div key={i} className="flex items-center gap-1 mb-1">
                        <span className="text-[9px] text-zinc-600 w-6">
                            R{i + 1}
                        </span>
                        <GridTrackInput
                            track={track}
                            onChange={(t) => {
                                const next = [...rows];
                                next[i] = t;
                                onChange({
                                    type: "grid",
                                    ...grid,
                                    rows: next,
                                });
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => removeTrack("rows", i)}
                            className="w-4 h-4 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <PropertyRow label="Col Gap">
                <NumericInput
                    value={grid.column_gap ?? 0}
                    min={0}
                    max={999}
                    step={1}
                    onChange={(v) =>
                        onChange({
                            type: "grid",
                            ...grid,
                            column_gap: v,
                        })
                    }
                />
            </PropertyRow>
            <PropertyRow label="Row Gap">
                <NumericInput
                    value={grid.row_gap ?? 0}
                    min={0}
                    max={999}
                    step={1}
                    onChange={(v) =>
                        onChange({
                            type: "grid",
                            ...grid,
                            row_gap: v,
                        })
                    }
                />
            </PropertyRow>
        </div>
    );
};

interface GridTrackInputProps {
    readonly track: GridTrack;
    readonly onChange: (track: GridTrack) => void;
}

const GridTrackInput: FC<GridTrackInputProps> = ({ track, onChange }) => {
    const handleUnitChange = (unit: string) => {
        switch (unit) {
            case "fixed":
                onChange({ unit: "fixed", value: 100 });
                break;
            case "percentage":
                onChange({ unit: "percentage", value: 50 });
                break;
            case "fr":
                onChange({ unit: "fr", value: 1 });
                break;
            case "auto":
                onChange({ unit: "auto" });
                break;
        }
    };

    return (
        <div className="flex items-center gap-1 flex-1">
            <select
                value={track.unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
            >
                <option value="fr">fr</option>
                <option value="fixed">px</option>
                <option value="percentage">%</option>
                <option value="auto">auto</option>
            </select>
            {"value" in track && typeof track.value === "number" && (
                <input
                    type="number"
                    value={track.value}
                    min={0}
                    max={9999}
                    step={track.unit === "fr" ? 0.1 : 1}
                    onChange={(e) =>
                        onChange({
                            ...track,
                            value: parseFloat(e.target.value) || 0,
                        } as GridTrack)
                    }
                    className="w-14 h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 text-center outline-none focus:border-blue-500/70"
                />
            )}
        </div>
    );
};

function updateNodeLayoutInTree(
    root: WidgetNode,
    nodeId: string,
    updater: (layout: WidgetLayout) => WidgetLayout
): WidgetNode {
    if (root.id === nodeId) {
        return { ...root, layout: updater(root.layout ?? {}) };
    }
    if (root.children) {
        return {
            ...root,
            children: root.children.map((child) =>
                updateNodeLayoutInTree(child, nodeId, updater)
            ),
        };
    }
    return root;
}

