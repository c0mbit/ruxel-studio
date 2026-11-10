import { FC, useCallback, useState, useMemo } from "react";
import type {
    WidgetNode,
    WidgetProperties,
    PropertyValue,
    FontWeight,
    TextAlign,
    TableColumn,
    ColorPalette,
    ThemeConfig,
} from "@ruxel/shared-types";
import { useEditorStore } from "../../state/editorStore";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { findNodeById } from "../../utils/treeTraversal";
import {
    ColorPickerInput,
    EnumSelectInput,
    SliderInput,
} from "../../components/inputs";

interface PropertiesTabProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

const FONT_WEIGHTS: readonly FontWeight[] = [
    "thin",
    "extra_light",
    "light",
    "normal",
    "medium",
    "semi_bold",
    "bold",
    "extra_bold",
    "black",
];

const FONT_WEIGHT_LABELS: Readonly<Record<FontWeight, string>> = {
    thin: "Thin",
    extra_light: "Extra Light",
    light: "Light",
    normal: "Normal",
    medium: "Medium",
    semi_bold: "Semi Bold",
    bold: "Bold",
    extra_bold: "Extra Bold",
    black: "Black",
};

const TEXT_ALIGNS: readonly TextAlign[] = ["left", "center", "right", "justify"];

interface MaterialThemeTokenItem {
    readonly key: keyof ColorPalette;
    readonly label: string;
    readonly category: "Primary & Secondary" | "Tertiary & Error" | "Surface & Background" | "Outline & Utilities";
}

const MATERIAL_THEME_TOKENS: readonly MaterialThemeTokenItem[] = [
    { key: "primary", label: "Primary", category: "Primary & Secondary" },
    { key: "on_primary", label: "On Primary", category: "Primary & Secondary" },
    { key: "primary_container", label: "Primary Container", category: "Primary & Secondary" },
    { key: "on_primary_container", label: "On Primary Container", category: "Primary & Secondary" },
    { key: "secondary", label: "Secondary", category: "Primary & Secondary" },
    { key: "on_secondary", label: "On Secondary", category: "Primary & Secondary" },
    { key: "secondary_container", label: "Secondary Container", category: "Primary & Secondary" },
    { key: "on_secondary_container", label: "On Secondary Container", category: "Primary & Secondary" },
    { key: "tertiary", label: "Tertiary", category: "Tertiary & Error" },
    { key: "on_tertiary", label: "On Tertiary", category: "Tertiary & Error" },
    { key: "tertiary_container", label: "Tertiary Container", category: "Tertiary & Error" },
    { key: "on_tertiary_container", label: "On Tertiary Container", category: "Tertiary & Error" },
    { key: "error", label: "Error", category: "Tertiary & Error" },
    { key: "on_error", label: "On Error", category: "Tertiary & Error" },
    { key: "error_container", label: "Error Container", category: "Tertiary & Error" },
    { key: "on_error_container", label: "On Error Container", category: "Tertiary & Error" },
    { key: "surface", label: "Surface", category: "Surface & Background" },
    { key: "on_surface", label: "On Surface", category: "Surface & Background" },
    { key: "surface_variant", label: "Surface Variant", category: "Surface & Background" },
    { key: "on_surface_variant", label: "On Surface Variant", category: "Surface & Background" },
    { key: "background", label: "Background", category: "Surface & Background" },
    { key: "on_background", label: "On Background", category: "Surface & Background" },
    { key: "inverse_surface", label: "Inverse Surface", category: "Surface & Background" },
    { key: "inverse_on_surface", label: "Inverse On Surface", category: "Surface & Background" },
    { key: "outline", label: "Outline", category: "Outline & Utilities" },
    { key: "outline_variant", label: "Outline Variant", category: "Outline & Utilities" },
    { key: "inverse_primary", label: "Inverse Primary", category: "Outline & Utilities" },
    { key: "shadow", label: "Shadow", category: "Outline & Utilities" },
    { key: "scrim", label: "Scrim", category: "Outline & Utilities" },
];

const STANDARD_FONT_FAMILIES = [
    "system-ui",
    "Arial",
    "Helvetica",
    "Verdana",
    "Georgia",
    "Courier New",
    "monospace",
    "serif",
    "sans-serif",
] as const;

function isBindingValue(val: unknown): boolean {
    if (!val) return false;
    if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        if (obj.type === "binding" || "binding" in obj) return true;
    }
    return false;
}

function extractPropString(val: unknown): string {
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        if ("value" in obj && typeof obj.value === "string") return obj.value;
        if ("static" in obj && typeof obj.static === "string") return obj.static;
        if ("binding" in obj && typeof obj.binding === "string") return obj.binding;
    }
    return String(val);
}

interface BoundPropertyRowProps {
    readonly label: string;
    readonly value: unknown;
    readonly onChange: (value: PropertyValue) => void;
    readonly renderStatic: () => React.ReactNode;
    readonly defaultBindingVar?: string;
}

const BoundPropertyRow: FC<BoundPropertyRowProps> = ({
    label,
    value,
    onChange,
    renderStatic,
    defaultBindingVar = "self.variable",
}) => {
    const isBinding = isBindingValue(value);
    const strVal = extractPropString(value);

    return (
        <PropertyRow label={label}>
            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                {isBinding ? (
                    <div className="relative flex-1 min-w-0">
                        <input
                            type="text"
                            value={strVal}
                            placeholder="e.g. self.var_name"
                            onChange={(e) =>
                                onChange({ type: "binding", value: e.target.value })
                            }
                            className="w-full h-6 px-2 pr-10 rounded bg-zinc-950 border border-cyan-500/70 font-mono text-xs text-cyan-200 outline-none focus:border-cyan-400"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-cyan-400/80 pointer-events-none select-none">
                            bind
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 min-w-0">{renderStatic()}</div>
                )}
                <button
                    type="button"
                    title={
                        isBinding
                            ? "Switch to Static literal"
                            : "Switch to Data Binding variable"
                    }
                    onClick={() => {
                        if (isBinding) {
                            onChange({ type: "static", value: strVal });
                        } else {
                            onChange({
                                type: "binding",
                                value: strVal || defaultBindingVar,
                            });
                        }
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors border shrink-0 ${
                        isBinding
                            ? "bg-cyan-950/80 border-cyan-500 text-cyan-300 hover:bg-cyan-900"
                            : "bg-zinc-800 border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}
                >
                    {isBinding ? "Binding" : "Static"}
                </button>
            </div>
        </PropertyRow>
    );
};

export const PropertiesTab: FC<PropertiesTabProps> = ({
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(
        new Set(["text", "colors", "visual", "control", "image", "a11y", "conditional", "generic"])
    );

    const selectedNode =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
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

    const updateProperty = useCallback(
        <K extends keyof WidgetProperties>(
            key: K,
            value: WidgetProperties[K]
        ) => {
            if (!selectedNodeId) {
                return;
            }

            executeNodeMutation(
                `Set ${key} on ${selectedNodeId}`,
                (root) =>
                    updateNodeInTreeForProperties(root, selectedNodeId, (node) => ({
                        ...node,
                        properties: {
                            ...node.properties,
                            [key]: value,
                        },
                    }))
            );
        },
        [selectedNodeId, executeNodeMutation]
    );

    const removeProperty = useCallback(
        (key: keyof WidgetProperties) => {
            if (!selectedNodeId) {
                return;
            }

            executeNodeMutation(
                `Remove ${key} from ${selectedNodeId}`,
                (root) =>
                    updateNodeInTreeForProperties(root, selectedNodeId, (node) => {
                        const nextProps = { ...node.properties };
                        delete (nextProps as Record<string, unknown>)[key];
                        return { ...node, properties: nextProps };
                    })
            );
        },
        [selectedNodeId, executeNodeMutation]
    );

    if (!selectedNode) {
        return (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs p-4">
                Select a widget to inspect
            </div>
        );
    }

    const props = selectedNode.properties ?? {};

    const hasTextProperties =
        selectedNode.widget_type === "label" ||
        selectedNode.widget_type === "button" ||
        selectedNode.widget_type === "text_input" ||
        selectedNode.widget_type === "checkbox" ||
        selectedNode.widget_type === "radio_button" ||
        selectedNode.widget_type === "menu" ||
        selectedNode.widget_type === "menu_item";

    const hasControlStates =
        selectedNode.widget_type === "checkbox" ||
        selectedNode.widget_type === "radio_button" ||
        selectedNode.widget_type === "button" ||
        selectedNode.widget_type === "slider" ||
        selectedNode.widget_type === "progress_bar" ||
        selectedNode.widget_type === "table_view";

    const fontAliases = document?.assets?.fonts?.map((f) => f.alias) ?? [];
    const shadowTokenNames =
        document?.theme?.shadows?.map((s) => s.name) ?? [];

    return (
        <div className="flex flex-col gap-0 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
            {selectedNode.widget_type === "conditional_node" && (
                <CollapsibleSection
                    title="Control Flow & Condition"
                    sectionKey="conditional"
                    expanded={expandedSections.has("conditional")}
                    onToggle={toggleSection}
                >
                    <PropertyRow label="Condition">
                        <input
                            type="text"
                            value={props.condition ?? ""}
                            placeholder="e.g. if state.is_logged_in"
                            onChange={(e) => updateProperty("condition", e.target.value)}
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-amber-500/60 font-mono text-xs text-amber-200 outline-none focus:border-amber-400"
                        />
                    </PropertyRow>
                </CollapsibleSection>
            )}

            {selectedNode.widget_type === "generic_widget" && (
                <CollapsibleSection
                    title="Custom / Generic Widget"
                    sectionKey="generic"
                    expanded={expandedSections.has("generic")}
                    onToggle={toggleSection}
                >
                    <PropertyRow label="Custom Type">
                        <input
                            type="text"
                            value={props.custom_type ?? ""}
                            placeholder="e.g. MyCustomButton::new"
                            onChange={(e) => updateProperty("custom_type", e.target.value)}
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-purple-500/60 font-mono text-xs text-purple-200 outline-none focus:border-purple-400"
                        />
                    </PropertyRow>
                    <PropertyRow label="Raw Args">
                        <input
                            type="text"
                            value={props.raw_args ?? ""}
                            placeholder="e.g. (state.count, true)"
                            onChange={(e) => updateProperty("raw_args", e.target.value)}
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 font-mono text-xs text-zinc-300 outline-none focus:border-blue-500"
                        />
                    </PropertyRow>
                </CollapsibleSection>
            )}

            {hasTextProperties && (
                <CollapsibleSection
                    title="Text & Typography"
                    sectionKey="text"
                    expanded={expandedSections.has("text")}
                    onToggle={toggleSection}
                >
                    <BoundPropertyRow
                        label="Text"
                        value={props.text}
                        defaultBindingVar="self.counter"
                        onChange={(val) => updateProperty("text", val)}
                        renderStatic={() => (
                            <input
                                type="text"
                                value={extractPropString(props.text)}
                                placeholder="Static text..."
                                onChange={(e) =>
                                    updateProperty("text", {
                                        type: "static",
                                        value: e.target.value,
                                    })
                                }
                                className="w-full h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                            />
                        )}
                    />

                    <PropertyRow label="i18n Key">
                        <input
                            type="text"
                            value={props.text_key ?? ""}
                            placeholder="e.g. login_action"
                            onChange={(e) =>
                                e.target.value
                                    ? updateProperty("text_key", e.target.value)
                                    : removeProperty("text_key")
                            }
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                        />
                    </PropertyRow>

                    {selectedNode.widget_type === "text_input" && (
                        <BoundPropertyRow
                            label="Placeholder"
                            value={props.placeholder}
                            defaultBindingVar="self.placeholder"
                            onChange={(val) => updateProperty("placeholder", val)}
                            renderStatic={() => (
                                <input
                                    type="text"
                                    value={extractPropString(props.placeholder)}
                                    placeholder="Placeholder text..."
                                    onChange={(e) =>
                                        updateProperty("placeholder", {
                                            type: "static",
                                            value: e.target.value,
                                        })
                                    }
                                    className="w-full h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                                />
                            )}
                        />
                    )}

                    <PropertyRow label="Font">
                        <EnumSelectInput
                            value={props.font_alias ?? ""}
                            options={[
                                { value: "", label: "Default" },
                                ...fontAliases.map((alias) => ({
                                    value: alias,
                                    label: alias,
                                })),
                                ...STANDARD_FONT_FAMILIES.map((family) => ({
                                    value: family,
                                    label: family,
                                })),
                            ]}
                            onChange={(val) =>
                                val
                                    ? updateProperty("font_alias", val)
                                    : removeProperty("font_alias")
                            }
                        />
                    </PropertyRow>

                    <BoundPropertyRow
                        label="Size"
                        value={props.font_size}
                        defaultBindingVar="self.font_size"
                        onChange={(val) =>
                            updateProperty(
                                "font_size",
                                isBindingValue(val)
                                    ? (val as any)
                                    : Number(extractPropString(val)) || 14
                            )
                        }
                        renderStatic={() => (
                            <SliderInput
                                value={typeof props.font_size === "number" ? props.font_size : 14}
                                min={8}
                                max={96}
                                step={1}
                                unit="px"
                                onChange={(v) => updateProperty("font_size", v)}
                            />
                        )}
                    />

                    <PropertyRow label="Weight">
                        <EnumSelectInput
                            value={props.font_weight ?? "normal"}
                            options={FONT_WEIGHTS.map((w) => ({
                                value: w,
                                label: FONT_WEIGHT_LABELS[w],
                            }))}
                            onChange={(v) =>
                                updateProperty("font_weight", v as FontWeight)
                            }
                        />
                    </PropertyRow>

                    <PropertyRow label="Align">
                        <EnumSelectInput
                            value={props.text_align ?? "left"}
                            options={TEXT_ALIGNS.map((a) => ({
                                value: a,
                                label: a.toUpperCase(),
                            }))}
                            onChange={(v) =>
                                updateProperty("text_align", v as TextAlign)
                            }
                        />
                    </PropertyRow>

                    <PropertyRow label="Wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={props.wrap_text ?? false}
                                onChange={(e) =>
                                    updateProperty("wrap_text", e.target.checked)
                                }
                                className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-zinc-300">
                                Wrap Text
                            </span>
                        </label>
                    </PropertyRow>
                </CollapsibleSection>
            )}

            <CollapsibleSection
                title="Colors & Fill"
                sectionKey="colors"
                expanded={expandedSections.has("colors")}
                onToggle={toggleSection}
            >
                {hasTextProperties && (
                    <BoundPropertyRow
                        label="Text Color"
                        value={props.text_color}
                        defaultBindingVar="self.text_color"
                        onChange={(val) =>
                            updateProperty(
                                "text_color",
                                isBindingValue(val)
                                    ? (val as any)
                                    : extractPropString(val)
                            )
                        }
                        renderStatic={() => (
                            <ColorPickerInput
                                value={extractPropString(props.text_color)}
                                onChange={(c) => updateProperty("text_color", c)}
                                onClear={() => removeProperty("text_color")}
                                placeholder="#ffffff"
                            />
                        )}
                    />
                )}

                <BoundPropertyRow
                    label="Background"
                    value={props.background_color}
                    defaultBindingVar="self.background_color"
                    onChange={(val) =>
                        updateProperty(
                            "background_color",
                            isBindingValue(val)
                                ? (val as any)
                                : extractPropString(val)
                        )
                    }
                    renderStatic={() => (
                        <ColorPickerInput
                            value={extractPropString(props.background_color)}
                            onChange={(c) => updateProperty("background_color", c)}
                            onClear={() => removeProperty("background_color")}
                            placeholder="#18181b"
                        />
                    )}
                />

                <BoundPropertyRow
                    label="Border Color"
                    value={props.border_color}
                    defaultBindingVar="self.border_color"
                    onChange={(val) =>
                        updateProperty(
                            "border_color",
                            isBindingValue(val)
                                ? (val as any)
                                : extractPropString(val)
                        )
                    }
                    renderStatic={() => (
                        <ColorPickerInput
                            value={extractPropString(props.border_color)}
                            onChange={(c) => updateProperty("border_color", c)}
                            onClear={() => removeProperty("border_color")}
                            placeholder="#3f3f46"
                        />
                    )}
                />
            </CollapsibleSection>

            <CollapsibleSection
                title="Visual & Effects"
                sectionKey="visual"
                expanded={expandedSections.has("visual")}
                onToggle={toggleSection}
            >
                <BoundPropertyRow
                    label="Opacity"
                    value={props.opacity}
                    defaultBindingVar="self.opacity"
                    onChange={(val) =>
                        updateProperty(
                            "opacity",
                            isBindingValue(val)
                                ? (val as any)
                                : Number(extractPropString(val)) || 1
                        )
                    }
                    renderStatic={() => (
                        <SliderInput
                            value={typeof props.opacity === "number" ? props.opacity : 1}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => updateProperty("opacity", v)}
                        />
                    )}
                />

                <BoundPropertyRow
                    label="Radius"
                    value={props.corner_radius}
                    defaultBindingVar="self.corner_radius"
                    onChange={(val) =>
                        updateProperty(
                            "corner_radius",
                            isBindingValue(val)
                                ? (val as any)
                                : Number(extractPropString(val)) || 0
                        )
                    }
                    renderStatic={() => (
                        <SliderInput
                            value={typeof props.corner_radius === "number" ? props.corner_radius : 0}
                            min={0}
                            max={100}
                            step={1}
                            unit="px"
                            onChange={(v) => updateProperty("corner_radius", v)}
                        />
                    )}
                />

                <BoundPropertyRow
                    label="Border W"
                    value={props.border_width}
                    defaultBindingVar="self.border_width"
                    onChange={(val) =>
                        updateProperty(
                            "border_width",
                            isBindingValue(val)
                                ? (val as any)
                                : Number(extractPropString(val)) || 0
                        )
                    }
                    renderStatic={() => (
                        <SliderInput
                            value={typeof props.border_width === "number" ? props.border_width : 0}
                            min={0}
                            max={20}
                            step={1}
                            unit="px"
                            onChange={(v) => updateProperty("border_width", v)}
                        />
                    )}
                />

                <PropertyRow label="Shadow">
                    <select
                        value={props.shadow_ref ?? ""}
                        onChange={(e) =>
                            e.target.value
                                ? updateProperty("shadow_ref", e.target.value)
                                : removeProperty("shadow_ref")
                        }
                        className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                    >
                        <option value="">None</option>
                        {shadowTokenNames.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </PropertyRow>
            </CollapsibleSection>

            {hasControlStates && (
                <CollapsibleSection
                    title="Control Specifics"
                    sectionKey="control"
                    expanded={expandedSections.has("control")}
                    onToggle={toggleSection}
                >
                    <PropertyRow label="Visible">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={props.visible !== false}
                                onChange={(e) =>
                                    updateProperty("visible", e.target.checked)
                                }
                                className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                            />
                        </label>
                    </PropertyRow>

                    <PropertyRow label="Disabled">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={props.disabled ?? false}
                                onChange={(e) =>
                                    updateProperty("disabled", e.target.checked)
                                }
                                className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                            />
                        </label>
                    </PropertyRow>

                    {(selectedNode.widget_type === "checkbox" ||
                        selectedNode.widget_type === "radio_button") && (
                        <PropertyRow label="Checked">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={props.checked ?? false}
                                    onChange={(e) =>
                                        updateProperty(
                                            "checked",
                                            e.target.checked
                                        )
                                    }
                                    className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                                />
                            </label>
                        </PropertyRow>
                    )}

                    {selectedNode.widget_type === "button" && (
                        <>
                            <PropertyRow label="Default">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={props.is_default ?? false}
                                        onChange={(e) =>
                                            updateProperty(
                                                "is_default",
                                                e.target.checked
                                            )
                                        }
                                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                                    />
                                </label>
                            </PropertyRow>
                            <PropertyRow label="Cancel">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={props.is_cancel ?? false}
                                        onChange={(e) =>
                                            updateProperty(
                                                "is_cancel",
                                                e.target.checked
                                            )
                                        }
                                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-600 focus:ring-blue-500"
                                    />
                                </label>
                            </PropertyRow>
                            <PropertyRow label="Theme Style">
                                <EnumSelectInput
                                    value={props.style ?? ""}
                                    options={[
                                        { value: "", label: "Default" },
                                        { value: "primary", label: "Primary" },
                                        { value: "secondary", label: "Secondary" },
                                        { value: "success", label: "Success" },
                                        { value: "danger", label: "Danger / Destructive" },
                                        { value: "text", label: "Text / Flat" },
                                    ]}
                                    onChange={(v) =>
                                        v ? updateProperty("style", v) : removeProperty("style")
                                    }
                                />
                            </PropertyRow>
                            <PropertyRow label="Theme">
                                <EnumSelectInput
                                    value={props.theme ?? ""}
                                    options={[
                                        { value: "", label: "Inherit" },
                                        { value: "light", label: "Light" },
                                        { value: "dark", label: "Dark" },
                                        { value: "custom", label: "Custom" },
                                    ]}
                                    onChange={(v) =>
                                        v ? updateProperty("theme", v) : removeProperty("theme")
                                    }
                                />
                            </PropertyRow>
                        </>
                    )}

                    {(selectedNode.widget_type === "slider" ||
                        selectedNode.widget_type === "progress_bar") && (
                        <>
                            <PropertyRow label="Min">
                                <SliderInput
                                    value={props.min_value ?? 0}
                                    min={-1000}
                                    max={1000}
                                    step={1}
                                    onChange={(v) =>
                                        updateProperty("min_value", v)
                                    }
                                />
                            </PropertyRow>
                            <PropertyRow label="Max">
                                <SliderInput
                                    value={props.max_value ?? 100}
                                    min={-1000}
                                    max={1000}
                                    step={1}
                                    onChange={(v) =>
                                        updateProperty("max_value", v)
                                    }
                                />
                            </PropertyRow>
                            {selectedNode.widget_type === "slider" && (
                                <PropertyRow label="Step">
                                    <SliderInput
                                        value={props.step_value ?? 1}
                                        min={0.01}
                                        max={50}
                                        step={0.1}
                                        onChange={(v) =>
                                            updateProperty("step_value", v)
                                        }
                                    />
                                </PropertyRow>
                            )}
                            <BoundPropertyRow
                                label="Current"
                                value={props.current_value}
                                defaultBindingVar="self.slider_val"
                                onChange={(val) =>
                                    updateProperty(
                                        "current_value",
                                        isBindingValue(val)
                                            ? (val as any)
                                            : Number(extractPropString(val)) || 0
                                    )
                                }
                                renderStatic={() => (
                                    <SliderInput
                                        value={
                                            typeof props.current_value === "number"
                                                ? props.current_value
                                                : props.min_value ?? 0
                                        }
                                        min={props.min_value ?? 0}
                                        max={props.max_value ?? 100}
                                        step={props.step_value ?? 1}
                                        onChange={(v) =>
                                            updateProperty("current_value", v)
                                        }
                                    />
                                )}
                            />
                        </>
                    )}

                    {selectedNode.widget_type === "table_view" && (
                        <TableColumnEditor
                            columns={props.columns ?? []}
                            onChange={(cols) => updateProperty("columns", cols)}
                        />
                    )}

                    <CustomPropertiesEditor
                        customProperties={props.custom_properties ?? {}}
                        onUpdate={(cp) =>
                            updateProperty("custom_properties", cp)
                        }
                    />
                </CollapsibleSection>
            )}

            {selectedNode.widget_type === "image" && (
                <CollapsibleSection
                    title="Image Asset"
                    sectionKey="image"
                    expanded={expandedSections.has("image")}
                    onToggle={toggleSection}
                >
                    <PropertyRow label="Asset Path">
                        <input
                            type="text"
                            value={props.image_path ?? ""}
                            placeholder="e.g. assets/logo.png"
                            onChange={(e) =>
                                e.target.value
                                    ? updateProperty("image_path", e.target.value)
                                    : removeProperty("image_path")
                            }
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                        />
                    </PropertyRow>
                    <PropertyRow label="Alias">
                        <input
                            type="text"
                            value={props.image_alias ?? ""}
                            placeholder="e.g. app_logo"
                            onChange={(e) =>
                                e.target.value
                                    ? updateProperty("image_alias", e.target.value)
                                    : removeProperty("image_alias")
                            }
                            className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                        />
                    </PropertyRow>
                </CollapsibleSection>
            )}

            <CollapsibleSection
                title="Accessibility (a11y)"
                sectionKey="a11y"
                expanded={expandedSections.has("a11y")}
                onToggle={toggleSection}
            >
                <PropertyRow label="ARIA Label">
                    <input
                        type="text"
                        value={props.aria_label ?? ""}
                        placeholder="e.g. Submit order"
                        onChange={(e) =>
                            e.target.value
                                ? updateProperty("aria_label", e.target.value)
                                : removeProperty("aria_label")
                        }
                        className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                </PropertyRow>

                <PropertyRow label="Role">
                    <input
                        type="text"
                        value={props.aria_role ?? ""}
                        placeholder="e.g. button, heading"
                        onChange={(e) =>
                            e.target.value
                                ? updateProperty("aria_role", e.target.value)
                                : removeProperty("aria_role")
                        }
                        className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                </PropertyRow>

                <PropertyRow label="Description">
                    <input
                        type="text"
                        value={props.aria_description ?? ""}
                        placeholder="e.g. Submits the form"
                        onChange={(e) =>
                            e.target.value
                                ? updateProperty("aria_description", e.target.value)
                                : removeProperty("aria_description")
                        }
                        className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                </PropertyRow>
            </CollapsibleSection>
        </div>
    );
};

interface CollapsibleSectionProps {
    readonly title: string;
    readonly sectionKey: string;
    readonly expanded: boolean;
    readonly onToggle: (key: string) => void;
    readonly children: React.ReactNode;
}

const CollapsibleSection: FC<CollapsibleSectionProps> = ({
    title,
    sectionKey,
    expanded,
    onToggle,
    children,
}) => (
    <div className="border-b border-zinc-800/60">
        <button
            type="button"
            onClick={() => onToggle(sectionKey)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
        >
            <svg
                className={`w-3 h-3 transition-transform ${
                    expanded ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                />
            </svg>
            {title}
        </button>
        {expanded && <div className="px-3 pb-3 space-y-1.5">{children}</div>}
    </div>
);

interface PropertyRowProps {
    readonly label: string;
    readonly children: React.ReactNode;
}

const PropertyRow: FC<PropertyRowProps> = ({ label, children }) => (
    <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[11px] text-zinc-500 text-right">
            {label}
        </span>
        {children}
    </div>
);

interface NumericInputProps {
    readonly value: number;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly onChange: (value: number) => void;
    readonly width?: number;
}

const NumericInput: FC<NumericInputProps> = ({
    value,
    min,
    max,
    step,
    onChange,
    width,
}) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseFloat(e.target.value);
        if (!isNaN(parsed)) {
            onChange(Math.max(min, Math.min(max, parsed)));
        }
    };

    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={handleChange}
            className="h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70 text-center"
            style={{ width: width ?? 60 }}
        />
    );
};

interface SegmentedControlProps {
    readonly options: readonly string[];
    readonly value: string;
    readonly onChange: (value: string) => void;
}

const SegmentedControl: FC<SegmentedControlProps> = ({
    options,
    value,
    onChange,
}) => (
    <div className="flex bg-zinc-950 rounded border border-zinc-700 overflow-hidden">
        {options.map((opt) => (
            <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={`px-2 py-0.5 text-[10px] capitalize transition-colors ${
                    value === opt
                        ? "bg-blue-600 text-white font-medium"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
            >
                {opt}
            </button>
        ))}
    </div>
);

interface MaterialThemeTokenPickerProps {
    readonly value: string | undefined;
    readonly onChange: (value: string) => void;
    readonly onClear: () => void;
    readonly theme?: ThemeConfig | null;
}

const MaterialThemeTokenPicker: FC<MaterialThemeTokenPickerProps> = ({
    value,
    onChange,
    onClear,
    theme,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [previewScheme, setPreviewScheme] = useState<"light" | "dark">(
        theme?.active_scheme === "dark" ? "dark" : "light"
    );
    const [showCustomHex, setShowCustomHex] = useState(false);
    const [customHexInput, setCustomHexInput] = useState(value ?? "");

    const activePalette = theme?.color_palettes?.[previewScheme] ?? null;

    const currentTokenKey = value?.startsWith("theme:")
        ? (value.slice("theme:".length) as keyof ColorPalette)
        : value?.startsWith("theme.")
        ? (value.slice("theme.".length) as keyof ColorPalette)
        : null;

    const matchingToken = currentTokenKey
        ? MATERIAL_THEME_TOKENS.find((t) => t.key === currentTokenKey)
        : null;

    const resolvedCurrentColor = activePalette && currentTokenKey && currentTokenKey in activePalette
        ? activePalette[currentTokenKey]
        : value ?? null;

    const filteredTokens = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return MATERIAL_THEME_TOKENS;
        }
        return MATERIAL_THEME_TOKENS.filter(
            (t) =>
                t.label.toLowerCase().includes(query) ||
                t.key.toLowerCase().includes(query) ||
                t.category.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    return (
        <div className="flex items-center gap-1.5 flex-1 relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 hover:border-zinc-600 text-xs text-zinc-200 flex items-center justify-between gap-1.5 transition-colors outline-none focus:border-blue-500/70"
            >
                <div className="flex items-center gap-1.5 truncate">
                    <span
                        className="w-3.5 h-3.5 rounded shrink-0 border border-zinc-700 shadow-sm"
                        style={{
                            backgroundColor: resolvedCurrentColor ?? "transparent",
                            backgroundImage: !resolvedCurrentColor
                                ? "linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)"
                                : undefined,
                            backgroundSize: "6px 6px",
                            backgroundPosition: "0 0, 0 3px, 3px -3px, -3px 0px",
                        }}
                    />
                    {matchingToken ? (
                        <div className="flex items-center gap-1 truncate">
                            <span className="font-medium text-zinc-200 text-[11px] truncate">
                                {matchingToken.label}
                            </span>
                            <span className="text-[9px] font-mono text-blue-400/90 bg-blue-950/60 px-1 rounded border border-blue-900/60">
                                {matchingToken.key}
                            </span>
                        </div>
                    ) : value ? (
                        <span className="font-mono text-zinc-300 text-[11px] truncate">
                            {value}
                        </span>
                    ) : (
                        <span className="text-zinc-500 text-[11px] italic">
                            Select Token...
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0 text-zinc-500 text-[10px]">
                    {resolvedCurrentColor && (
                        <span className="font-mono text-[9px] text-zinc-400 hidden sm:inline">
                            {resolvedCurrentColor.toUpperCase()}
                        </span>
                    )}
                    <span>▾</span>
                </div>
            </button>

            {value && (
                <button
                    type="button"
                    onClick={onClear}
                    className="w-6 h-6 flex items-center justify-center rounded border border-zinc-700 bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Clear token"
                >
                    <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            )}

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-2 w-72 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                        <span className="text-[11px] font-semibold text-zinc-200">
                            Material 3 Theme Tokens
                        </span>
                        <div className="flex items-center bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[9px]">
                            <button
                                type="button"
                                onClick={() => setPreviewScheme("light")}
                                className={`px-1.5 py-0.5 rounded ${
                                    previewScheme === "light"
                                        ? "bg-zinc-800 text-amber-300 font-medium"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Light
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewScheme("dark")}
                                className={`px-1.5 py-0.5 rounded ${
                                    previewScheme === "dark"
                                        ? "bg-zinc-800 text-blue-300 font-medium"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Dark
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search token..."
                            className="w-full h-5 px-2 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                        />
                    </div>

                    <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700">
                        {filteredTokens.length === 0 ? (
                            <div className="p-3 text-center text-zinc-500 text-[10px]">
                                No tokens found
                            </div>
                        ) : (
                            filteredTokens.map((token) => {
                                const tokenColor = activePalette?.[token.key] ?? "#000000";
                                const isSelected = currentTokenKey === token.key;
                                return (
                                    <button
                                        key={token.key}
                                        type="button"
                                        onClick={() => {
                                            onChange(`theme:${token.key}`);
                                            setIsOpen(false);
                                        }}
                                        className={`flex items-center justify-between p-1.5 rounded transition-all text-left ${
                                            isSelected
                                                ? "bg-blue-600/20 border border-blue-500/50"
                                                : "hover:bg-zinc-800 border border-transparent"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <span
                                                className="w-4 h-4 rounded border border-zinc-700 shrink-0 shadow-sm"
                                                style={{ backgroundColor: tokenColor }}
                                            />
                                            <div className="flex flex-col truncate">
                                                <span className="text-[11px] font-medium text-zinc-200 leading-tight truncate">
                                                    {token.label}
                                                </span>
                                                <span className="text-[9px] font-mono text-zinc-400 leading-tight truncate">
                                                    theme:{token.key}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-[9px] font-mono text-zinc-400 shrink-0">
                                            {tokenColor}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="border-t border-zinc-800 pt-1.5 flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={() => setShowCustomHex(!showCustomHex)}
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center justify-between"
                        >
                            <span>Custom Hex Override</span>
                            <span>{showCustomHex ? "▲" : "▼"}</span>
                        </button>
                        {showCustomHex && (
                            <div className="flex items-center gap-1 mt-1">
                                <input
                                    type="text"
                                    value={customHexInput}
                                    onChange={(e) => setCustomHexInput(e.target.value)}
                                    placeholder="#000000"
                                    className="flex-1 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (customHexInput.trim()) {
                                            onChange(customHexInput.trim());
                                            setIsOpen(false);
                                        }
                                    }}
                                    className="px-2 h-5 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 border border-zinc-700"
                                >
                                    Apply
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface TableColumnEditorProps {
    readonly columns: readonly TableColumn[];
    readonly onChange: (columns: readonly TableColumn[]) => void;
}

const TableColumnEditor: FC<TableColumnEditorProps> = ({
    columns,
    onChange,
}) => {
    const addColumn = () => {
        const nextId = `col_${columns.length + 1}`;
        onChange([
            ...columns,
            { id: nextId, title: `Column ${columns.length + 1}`, width: 150 },
        ]);
    };

    const removeColumn = (index: number) => {
        onChange(columns.filter((_, i) => i !== index));
    };

    const updateColumn = (index: number, field: keyof TableColumn, value: string | number) => {
        onChange(
            columns.map((col, i) =>
                i === index ? { ...col, [field]: value } : col
            )
        );
    };

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500">Columns</span>
                <button
                    type="button"
                    onClick={addColumn}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                >
                    + Add
                </button>
            </div>
            {columns.map((col, index) => (
                <div
                    key={col.id}
                    className="flex items-center gap-1 mb-1"
                >
                    <input
                        type="text"
                        value={col.title}
                        onChange={(e) =>
                            updateColumn(index, "title", e.target.value)
                        }
                        className="flex-1 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                        placeholder="Title"
                    />
                    <input
                        type="number"
                        value={col.width ?? 100}
                        onChange={(e) =>
                            updateColumn(
                                index,
                                "width",
                                parseInt(e.target.value, 10) || 100
                            )
                        }
                        className="w-12 h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 text-center outline-none focus:border-blue-500/70"
                    />
                    <button
                        type="button"
                        onClick={() => removeColumn(index)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                    >
                        <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
};

interface CustomPropertiesEditorProps {
    readonly customProperties: Readonly<Record<string, unknown>>;
    readonly onUpdate: (
        props: Readonly<Record<string, unknown>>
    ) => void;
}

const CustomPropertiesEditor: FC<CustomPropertiesEditorProps> = ({
    customProperties,
    onUpdate,
}) => {
    const entries = Object.entries(customProperties);

    const addEntry = () => {
        const key = `custom_${entries.length + 1}`;
        onUpdate({ ...customProperties, [key]: "" });
    };

    const removeEntry = (key: string) => {
        const next = { ...customProperties };
        delete (next as Record<string, unknown>)[key];
        onUpdate(next);
    };

    const updateEntry = (oldKey: string, newKey: string, value: unknown) => {
        const next: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(customProperties)) {
            if (k === oldKey) {
                next[newKey] = value;
            } else {
                next[k] = v;
            }
        }
        onUpdate(next);
    };

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500">
                    Custom Props
                </span>
                <button
                    type="button"
                    onClick={addEntry}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                >
                    + Add
                </button>
            </div>
            {entries.map(([key, val]) => (
                <div
                    key={key}
                    className="flex items-center gap-1 mb-1"
                >
                    <input
                        type="text"
                        value={key}
                        onChange={(e) =>
                            updateEntry(key, e.target.value, val)
                        }
                        className="w-20 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                    />
                    <input
                        type="text"
                        value={String(val)}
                        onChange={(e) =>
                            updateEntry(key, key, e.target.value)
                        }
                        className="flex-1 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                    <button
                        type="button"
                        onClick={() => removeEntry(key)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                    >
                        <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
};

function updateNodeInTreeForProperties(
    root: WidgetNode,
    nodeId: string,
    updater: (node: WidgetNode) => WidgetNode
): WidgetNode {
    if (root.id === nodeId) {
        return updater(root);
    }
    if (root.children) {
        return {
            ...root,
            children: root.children.map((child) =>
                updateNodeInTreeForProperties(child, nodeId, updater)
            ),
        };
    }
    return root;
}

export { CollapsibleSection, PropertyRow, NumericInput, SegmentedControl };

