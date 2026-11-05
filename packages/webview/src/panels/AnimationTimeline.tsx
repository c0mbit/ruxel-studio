import { FC, useState, useEffect, useCallback, useMemo } from "react";
import type {
    AnimatedProperty,
    AnimationDefinition,
    AnimationTrigger,
    InterpolationCurve,
    WidgetNode,
} from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";
import { findNodeById, updateNodeProperty } from "../utils/treeTraversal";
import { getWidgetTypeLabel, getWidgetTypeIcon } from "../utils/widgetFactory";

interface AnimationTimelineProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

const TRIGGER_OPTIONS: readonly { readonly value: AnimationTrigger; readonly label: string }[] = [
    { value: "on_mount", label: "On Mount" },
    { value: "on_hover", label: "On Hover" },
    { value: "on_click", label: "On Click" },
    { value: "state_change", label: "State Change" },
];

const PROPERTY_OPTIONS: readonly { readonly value: AnimatedProperty; readonly label: string; readonly defaultFrom: number; readonly defaultTo: number }[] = [
    { value: "opacity", label: "Opacity (0..1)", defaultFrom: 0, defaultTo: 1 },
    { value: "scale", label: "Scale (0.5..2.0)", defaultFrom: 0.8, defaultTo: 1.0 },
    { value: "translation_x", label: "Translate X (px)", defaultFrom: -40, defaultTo: 0 },
    { value: "translation_y", label: "Translate Y (px)", defaultFrom: 30, defaultTo: 0 },
    { value: "rotation", label: "Rotation (deg)", defaultFrom: -15, defaultTo: 0 },
    { value: "width", label: "Width (px)", defaultFrom: 80, defaultTo: 160 },
    { value: "height", label: "Height (px)", defaultFrom: 30, defaultTo: 60 },
];

const CURVE_OPTIONS: readonly { readonly value: InterpolationCurve; readonly label: string; readonly svgPath: string }[] = [
    { value: "ease_in_out", label: "Ease In Out", svgPath: "M0,32 C16,32 16,0 32,0" },
    { value: "spring", label: "Spring Physics", svgPath: "M0,32 C10,32 12,-6 18,3 C24,-2 28,1 32,0" },
    { value: "linear", label: "Linear", svgPath: "M0,32 L32,0" },
    { value: "ease_in", label: "Ease In", svgPath: "M0,32 C20,32 28,16 32,0" },
    { value: "ease_out", label: "Ease Out", svgPath: "M0,32 C4,16 12,0 32,0" },
    { value: "bounce", label: "Bounce", svgPath: "M0,32 C8,32 12,4 16,4 C20,4 22,20 25,20 C28,20 30,0 32,0" },
];

export const AnimationTimeline: FC<AnimationTimelineProps> = ({
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const isAnimationTimelineOpen = useEditorStore((state) => state.isAnimationTimelineOpen);
    const setIsAnimationTimelineOpen = useEditorStore((state) => state.setIsAnimationTimelineOpen);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [selectedAnimId, setSelectedAnimId] = useState<string | null>(null);

    const maxDurationMs = 1500;

    const selectedNode: WidgetNode | null = useMemo(() => {
        if (!document || !selectedNodeId) {
            return null;
        }
        return findNodeById(document.root, selectedNodeId);
    }, [document, selectedNodeId]);

    const animations: readonly AnimationDefinition[] = selectedNode?.animations ?? [];

    useEffect(() => {
        if (animations.length > 0 && !selectedAnimId) {
            setSelectedAnimId(animations[0].id);
        } else if (animations.length === 0) {
            setSelectedAnimId(null);
        }
    }, [animations, selectedAnimId]);

    useEffect(() => {
        if (!isPlaying) {
            return;
        }
        const interval = setInterval(() => {
            setCurrentTimeMs((prev) => {
                if (prev >= maxDurationMs) {
                    return 0;
                }
                return prev + 30;
            });
        }, 30);
        return () => clearInterval(interval);
    }, [isPlaying, maxDurationMs]);

    const activeAnimation = animations.find((a) => a.id === selectedAnimId);

    const handleAddAnimation = useCallback(() => {
        if (!selectedNode) {
            return;
        }
        const newId = `anim_${Date.now().toString(36)}`;
        const newAnim: AnimationDefinition = {
            id: newId,
            trigger: "on_mount",
            property: "opacity",
            from_value: 0,
            to_value: 1,
            duration_ms: 600,
            delay_ms: 0,
            curve: "ease_in_out",
            spring_stiffness: 180,
            spring_damping: 12,
        };

        executeNodeMutation(`Add animation to #${selectedNode.id}`, (root: WidgetNode) => {
            return updateNodeProperty(root, selectedNode.id, (node: WidgetNode) => ({
                ...node,
                animations: [...(node.animations ?? []), newAnim],
            }));
        });
        setSelectedAnimId(newId);
    }, [selectedNode, executeNodeMutation]);

    const handleUpdateAnimation = useCallback(
        (updated: AnimationDefinition) => {
            if (!selectedNode) {
                return;
            }
            executeNodeMutation(`Update animation ${updated.id}`, (root: WidgetNode) => {
                return updateNodeProperty(root, selectedNode.id, (node: WidgetNode) => ({
                    ...node,
                    animations: (node.animations ?? []).map((a: AnimationDefinition) =>
                        a.id === updated.id ? updated : a
                    ),
                }));
            });
        },
        [selectedNode, executeNodeMutation]
    );

    const handleDeleteAnimation = useCallback(
        (animId: string) => {
            if (!selectedNode) {
                return;
            }
            executeNodeMutation(`Remove animation ${animId}`, (root: WidgetNode) => {
                return updateNodeProperty(root, selectedNode.id, (node: WidgetNode) => ({
                    ...node,
                    animations: (node.animations ?? []).filter((a: AnimationDefinition) => a.id !== animId),
                }));
            });
            if (selectedAnimId === animId) {
                setSelectedAnimId(null);
            }
        },
        [selectedNode, selectedAnimId, executeNodeMutation]
    );

    if (!isAnimationTimelineOpen) {
        return null;
    }

    return (
        <div className="h-64 border-t border-zinc-800 bg-zinc-950 flex flex-col shrink-0 overflow-hidden font-sans text-xs select-none shadow-2xl z-20">
            <header className="h-9 px-4 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-sm">⏱️</span>
                    <span className="font-semibold text-zinc-200">Animation Timeline & Physics</span>
                    {selectedNode ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                            <span className="text-xs">{getWidgetTypeIcon(selectedNode.widget_type)}</span>
                            <span className="font-mono text-[11px] text-zinc-300">#{selectedNode.id}</span>
                            <span className="text-[10px] text-zinc-500 font-sans">({getWidgetTypeLabel(selectedNode.widget_type)})</span>
                        </div>
                    ) : (
                        <span className="text-zinc-500 italic text-[11px]">Select a widget on canvas</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`px-3 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
                            isPlaying
                                ? "bg-amber-600 text-white"
                                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                        }`}
                    >
                        <span>{isPlaying ? "⏸ Pause" : "▶ Play"}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIsPlaying(false);
                            setCurrentTimeMs(0);
                        }}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px]"
                    >
                        ↺ Reset
                    </button>
                    <span className="font-mono text-zinc-400 text-[11px] min-w-[55px] text-right">
                        {currentTimeMs}ms
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsAnimationTimelineOpen(false)}
                        className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded ml-2"
                        title="Close Timeline"
                    >
                        ✕
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <div className="w-56 border-r border-zinc-800 bg-zinc-900/40 p-2.5 flex flex-col justify-between shrink-0 overflow-y-auto">
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                                Transitions ({animations.length})
                            </span>
                            <button
                                type="button"
                                disabled={!selectedNode}
                                onClick={handleAddAnimation}
                                className="px-1.5 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-[10px] font-medium disabled:opacity-40"
                            >
                                + Add
                            </button>
                        </div>

                        {animations.map((anim) => (
                            <div
                                key={anim.id}
                                onClick={() => setSelectedAnimId(anim.id)}
                                className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                                    selectedAnimId === anim.id
                                        ? "bg-blue-600/20 border border-blue-500/40 text-blue-200"
                                        : "hover:bg-zinc-800/60 text-zinc-400"
                                }`}
                            >
                                <div className="truncate">
                                    <div className="font-medium text-[11px] text-zinc-200 truncate capitalize">
                                        {anim.property.replace("_", " ")}
                                    </div>
                                    <div className="text-[9px] font-mono text-zinc-500">
                                        {anim.trigger} • {anim.duration_ms}ms
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteAnimation(anim.id);
                                    }}
                                    className="text-zinc-500 hover:text-rose-400 text-xs px-1"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}

                        {animations.length === 0 && (
                            <div className="p-3 text-center text-zinc-500 italic text-[11px]">
                                No animations on this widget.
                            </div>
                        )}
                    </div>
                </div>

                {activeAnimation ? (
                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 p-3.5 overflow-y-auto space-y-3.5 border-r border-zinc-800/60">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-400">Trigger</label>
                                    <select
                                        value={activeAnimation.trigger}
                                        onChange={(e) =>
                                            handleUpdateAnimation({
                                                ...activeAnimation,
                                                trigger: e.target.value as AnimationTrigger,
                                            })
                                        }
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs outline-none"
                                    >
                                        {TRIGGER_OPTIONS.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-400">Target Property</label>
                                    <select
                                        value={activeAnimation.property}
                                        onChange={(e) => {
                                            const prop = e.target.value as AnimatedProperty;
                                            const opt = PROPERTY_OPTIONS.find((o) => o.value === prop);
                                            handleUpdateAnimation({
                                                ...activeAnimation,
                                                property: prop,
                                                from_value: opt?.defaultFrom ?? 0,
                                                to_value: opt?.defaultTo ?? 1,
                                            });
                                        }}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs outline-none"
                                    >
                                        {PROPERTY_OPTIONS.map((p) => (
                                            <option key={p.value} value={p.value}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-400">Duration ({activeAnimation.duration_ms}ms)</label>
                                    <input
                                        type="range"
                                        min={100}
                                        max={2000}
                                        step={50}
                                        value={activeAnimation.duration_ms}
                                        onChange={(e) =>
                                            handleUpdateAnimation({
                                                ...activeAnimation,
                                                duration_ms: parseFloat(e.target.value),
                                            })
                                        }
                                        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer mt-2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-800/60">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-400">From Value</label>
                                    <input
                                        type="number"
                                        value={activeAnimation.from_value as number}
                                        onChange={(e) =>
                                            handleUpdateAnimation({
                                                ...activeAnimation,
                                                from_value: parseFloat(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs font-mono outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-zinc-400">To Value</label>
                                    <input
                                        type="number"
                                        value={activeAnimation.to_value as number}
                                        onChange={(e) =>
                                            handleUpdateAnimation({
                                                ...activeAnimation,
                                                to_value: parseFloat(e.target.value) || 0,
                                            })
                                        }
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs font-mono outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                                <label className="text-[10px] text-zinc-400">Interpolation Curve</label>
                                <div className="grid grid-cols-6 gap-2">
                                    {CURVE_OPTIONS.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() =>
                                                handleUpdateAnimation({
                                                    ...activeAnimation,
                                                    curve: c.value,
                                                })
                                            }
                                            className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 transition-all ${
                                                activeAnimation.curve === c.value
                                                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                                                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400"
                                            }`}
                                        >
                                            <svg className="w-8 h-6 overflow-visible" viewBox="0 0 32 32">
                                                <path d={c.svgPath} fill="none" stroke="currentColor" strokeWidth="2" />
                                            </svg>
                                            <span className="text-[9px] truncate">{c.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {activeAnimation.curve === "spring" && (
                                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-zinc-400">Spring Stiffness</span>
                                            <span className="font-mono text-zinc-200">{activeAnimation.spring_stiffness ?? 180}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={50}
                                            max={500}
                                            value={activeAnimation.spring_stiffness ?? 180}
                                            onChange={(e) =>
                                                handleUpdateAnimation({
                                                    ...activeAnimation,
                                                    spring_stiffness: parseFloat(e.target.value),
                                                })
                                            }
                                            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-zinc-400">Spring Damping</span>
                                            <span className="font-mono text-zinc-200">{activeAnimation.spring_damping ?? 12}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={5}
                                            max={50}
                                            value={activeAnimation.spring_damping ?? 12}
                                            onChange={(e) =>
                                                handleUpdateAnimation({
                                                    ...activeAnimation,
                                                    spring_damping: parseFloat(e.target.value),
                                                })
                                            }
                                            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-64 p-3.5 bg-zinc-950/60 flex flex-col justify-between shrink-0">
                            <div className="space-y-2">
                                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                                    Scrubber Preview
                                </span>
                                <div className="h-20 bg-zinc-900 rounded-lg border border-zinc-800 relative flex items-center justify-center overflow-hidden">
                                    <div
                                        className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold transition-all shadow-lg"
                                        style={{
                                            opacity:
                                                activeAnimation.property === "opacity"
                                                    ? Math.min(
                                                          1,
                                                          Math.max(
                                                              0,
                                                              currentTimeMs /
                                                                  (activeAnimation.duration_ms || 1)
                                                          )
                                                      )
                                                    : 1,
                                            transform:
                                                activeAnimation.property === "scale"
                                                    ? `scale(${0.8 + 0.4 * (currentTimeMs / (activeAnimation.duration_ms || 1))})`
                                                    : activeAnimation.property === "rotation"
                                                    ? `rotate(${360 * (currentTimeMs / (activeAnimation.duration_ms || 1))}deg)`
                                                    : "none",
                                        }}
                                    >
                                        ★
                                    </div>
                                </div>
                                <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{ width: `${Math.min(100, (currentTimeMs / maxDurationMs) * 100)}%` }}
                                    />
                                </div>
                            </div>

                            <div className="text-[10px] text-zinc-500 font-mono">
                                Interpolator: {activeAnimation.curve} • Loop: Auto
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 italic text-xs">
                        Select or add an animation transition to configure.
                    </div>
                )}
            </div>
        </div>
    );
};
