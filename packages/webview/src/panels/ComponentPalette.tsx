import { FC, useState, useCallback, useEffect } from "react";
import type { WidgetType, WidgetNode, TeamPreset } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { usePresetStore } from "../state/presetStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";
import { insertChild } from "../utils/treeTraversal";
import {
    PALETTE_CATEGORIES,
    createDefaultWidgetNode,
    collectAllIds,
    getWidgetTypeLabel,
    getWidgetTypeIcon,
    filterPaletteCategoriesByQuery,
    isContainerWidget,
} from "../utils/widgetFactory";
import { AssetManager } from "./AssetManager";
import { LocalizationDictionary } from "./LocalizationDictionary";

interface ComponentPaletteProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

export const ComponentPalette: FC<ComponentPaletteProps> = ({
    onDocumentChange,
}) => {
    const [activeTab, setActiveTab] = useState<"standard" | "cloud" | "assets" | "i18n">("standard");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedCategories, setExpandedCategories] = useState<
        ReadonlySet<string>
    >(new Set(PALETTE_CATEGORIES.map((c) => c.name)));

    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const presets = usePresetStore((state) => state.presets);
    const isLoadingPresets = usePresetStore((state) => state.isLoading);
    const fetchPresets = usePresetStore((state) => state.fetchPresets);
    const setIsSavePresetModalOpen = usePresetStore(
        (state) => state.setIsSavePresetModalOpen
    );

    useEffect(() => {
        if (activeTab === "cloud") {
            fetchPresets();
        }
    }, [activeTab, fetchPresets]);

    const toggleCategory = useCallback((categoryName: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(categoryName)) {
                next.delete(categoryName);
            } else {
                next.add(categoryName);
            }
            return next;
        });
    }, []);

    const insertWidgetIntoDocument = useCallback(
        (widgetType: WidgetType) => {
            if (!document) {
                return;
            }

            const existingIds = collectAllIds(document.root);
            const newNode = createDefaultWidgetNode(widgetType, existingIds);

            let targetParentId = document.root.id;

            if (selectedNodeId) {
                const selectedNode = findNodeInTree(
                    document.root,
                    selectedNodeId
                );
                if (selectedNode && isContainerWidget(selectedNode.widget_type)) {
                    targetParentId = selectedNodeId;
                } else if (selectedNodeId !== document.root.id) {
                    const parentOfSelected = findParentInTree(
                        document.root,
                        selectedNodeId
                    );
                    if (parentOfSelected) {
                        targetParentId = parentOfSelected.id;
                    }
                }
            }

            executeNodeMutation(
                `Insert ${getWidgetTypeLabel(widgetType)}`,
                (root) => insertChild(root, targetParentId, newNode)
            );

            setSelectedNodeId(newNode.id);
        },
        [document, selectedNodeId, executeNodeMutation, setSelectedNodeId]
    );

    const insertPresetIntoDocument = useCallback(
        (preset: TeamPreset) => {
            if (!document) {
                return;
            }

            const existingIds = collectAllIds(document.root);
            const freshNode = regenerateWidgetIds(preset.rootNode, existingIds);

            let targetParentId = document.root.id;

            if (selectedNodeId) {
                const selectedNode = findNodeInTree(
                    document.root,
                    selectedNodeId
                );
                if (selectedNode && isContainerWidget(selectedNode.widget_type)) {
                    targetParentId = selectedNodeId;
                } else if (selectedNodeId !== document.root.id) {
                    const parentOfSelected = findParentInTree(
                        document.root,
                        selectedNodeId
                    );
                    if (parentOfSelected) {
                        targetParentId = parentOfSelected.id;
                    }
                }
            }

            executeNodeMutation(
                `Insert Cloud Preset: ${preset.name}`,
                (root) => insertChild(root, targetParentId, freshNode)
            );

            setSelectedNodeId(freshNode.id);
        },
        [document, selectedNodeId, executeNodeMutation, setSelectedNodeId]
    );

    const handleDragStart = useCallback(
        (e: React.DragEvent, widgetType: WidgetType) => {
            e.dataTransfer.setData(
                "application/ruxel-widget-type",
                widgetType
            );
            e.dataTransfer.effectAllowed = "copy";
        },
        []
    );

    const handlePresetDragStart = useCallback(
        (e: React.DragEvent, preset: TeamPreset) => {
            e.dataTransfer.setData(
                "application/ruxel-preset-json",
                JSON.stringify(preset.rootNode)
            );
            e.dataTransfer.effectAllowed = "copy";
        },
        []
    );

    const filteredCategories = filterPaletteCategoriesByQuery(
        PALETTE_CATEGORIES,
        searchQuery
    );

    const filteredPresets = presets.filter((p) => {
        if (!searchQuery) {
            return true;
        }
        const query = searchQuery.toLowerCase();
        return (
            p.name.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query) ||
            p.tags.some((t) => t.toLowerCase().includes(query))
        );
    });

    return (
        <div className="flex flex-col h-full bg-zinc-900 border-b border-zinc-800 overflow-hidden">
            <header className="px-3 pt-2.5 pb-2 border-b border-zinc-800 shrink-0">
                <div className="flex bg-zinc-950 p-0.5 rounded border border-zinc-800 mb-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab("standard")}
                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors ${
                            activeTab === "standard"
                                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        Standard
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("cloud")}
                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
                            activeTab === "cloud"
                                ? "bg-blue-600/30 text-blue-300 border border-blue-500/40"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <span>☁️</span>
                        <span>Cloud</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("assets")}
                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
                            activeTab === "assets"
                                ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <span>📁</span>
                        <span>Assets</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("i18n")}
                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors flex items-center justify-center gap-1 ${
                            activeTab === "i18n"
                                ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        <span>🌐</span>
                        <span>i18n</span>
                    </button>
                </div>

                {activeTab !== "assets" && activeTab !== "i18n" && (
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={
                                activeTab === "standard"
                                    ? "Search widgets..."
                                    : "Search cloud presets..."
                            }
                            className="w-full h-7 px-2.5 pr-7 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/70 transition-colors"
                        />
                        {searchQuery.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-sm hover:bg-zinc-700 text-zinc-400"
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
                    </div>
                )}

                {activeTab === "cloud" && (
                    <div className="mt-2 flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsSavePresetModalOpen(true)}
                            disabled={!selectedNodeId}
                            className="flex-1 py-1 px-2 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
                            title="Save currently selected widget as a cloud preset"
                        >
                            <span>💾</span>
                            <span>Save Selection</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => fetchPresets()}
                            disabled={isLoadingPresets}
                            className="w-7 h-7 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                            title="Refresh team presets"
                        >
                            <svg
                                className={`w-3.5 h-3.5 ${
                                    isLoadingPresets ? "animate-spin" : ""
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                            </svg>
                        </button>
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                {activeTab === "assets" ? (
                    <AssetManager onDocumentChange={onDocumentChange} />
                ) : activeTab === "standard" ? (
                    filteredCategories.length === 0 ? (
                        <div className="px-3 py-6 text-center text-zinc-500 text-xs">
                            No matching widgets
                        </div>
                    ) : (
                        filteredCategories.map((category) => (
                            <div key={category.name}>
                                <button
                                    type="button"
                                    onClick={() => toggleCategory(category.name)}
                                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                                >
                                    <svg
                                        className={`w-3 h-3 transition-transform ${
                                            expandedCategories.has(category.name)
                                                ? "rotate-90"
                                                : ""
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
                                    <span>{category.name}</span>
                                    <span className="ml-auto text-zinc-600 text-[10px]">
                                        {category.types.length}
                                    </span>
                                </button>

                                {expandedCategories.has(category.name) && (
                                    <div className="px-1.5 pb-1">
                                        {category.types.map((widgetType) => (
                                            <button
                                                key={widgetType}
                                                type="button"
                                                draggable
                                                onDragStart={(e) =>
                                                    handleDragStart(e, widgetType)
                                                }
                                                onDoubleClick={() =>
                                                    insertWidgetIntoDocument(widgetType)
                                                }
                                                className="w-full flex items-center gap-2 px-2.5 py-1 rounded text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-grab active:cursor-grabbing transition-colors"
                                                title={`Drag or double-click to insert ${getWidgetTypeLabel(widgetType)}`}
                                            >
                                                <span className="w-4 text-center text-sm leading-none">
                                                    {getWidgetTypeIcon(widgetType)}
                                                </span>
                                                <span className="truncate">
                                                    {getWidgetTypeLabel(widgetType)}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )
                ) : (
                    <div className="p-2 space-y-2">
                        {isLoadingPresets && presets.length === 0 ? (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                                Loading team presets...
                            </div>
                        ) : filteredPresets.length === 0 ? (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                                No team cloud presets found
                            </div>
                        ) : (
                            filteredPresets.map((preset) => (
                                <div
                                    key={preset.id}
                                    draggable
                                    onDragStart={(e) => handlePresetDragStart(e, preset)}
                                    onDoubleClick={() => insertPresetIntoDocument(preset)}
                                    className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-850 cursor-grab active:cursor-grabbing transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition-colors">
                                            {preset.name}
                                        </h4>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                                            {preset.category}
                                        </span>
                                    </div>

                                    {preset.description && (
                                        <p className="text-[11px] text-zinc-400 line-clamp-2 mb-2 leading-relaxed">
                                            {preset.description}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                                        <span>By {preset.author}</span>
                                        <button
                                            type="button"
                                            onClick={() => insertPresetIntoDocument(preset)}
                                            className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 font-medium transition-colors"
                                        >
                                            Insert
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "i18n" && (
                    <LocalizationDictionary onDocumentChange={onDocumentChange} />
                )}
            </div>
        </div>
    );
};

function regenerateWidgetIds(
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

    const children = node.children?.map((c) =>
        regenerateWidgetIds(c, existingIds)
    );

    return {
        ...node,
        id: newId,
        ...(children ? { children } : {}),
    };
}

function findNodeInTree(
    root: import("@ruxel/shared-types").WidgetNode,
    id: string
): import("@ruxel/shared-types").WidgetNode | null {
    if (root.id === id) {
        return root;
    }
    if (root.children) {
        for (const child of root.children) {
            const found = findNodeInTree(child, id);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function findParentInTree(
    root: import("@ruxel/shared-types").WidgetNode,
    targetId: string
): import("@ruxel/shared-types").WidgetNode | null {
    if (root.children) {
        for (const child of root.children) {
            if (child.id === targetId) {
                return root;
            }
            const found = findParentInTree(child, targetId);
            if (found) {
                return found;
            }
        }
    }
    return null;
}
