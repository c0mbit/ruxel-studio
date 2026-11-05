import { FC, useState, useCallback, useRef } from "react";
import type { WidgetNode, WidgetType } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useExtensionIpc } from "../hooks/useExtensionIpc";
import { useDocumentMutation } from "../hooks/useDocumentMutation";
import { collectAllIds } from "../utils/widgetFactory";
import { insertChild } from "../utils/treeTraversal";

interface AssetManagerProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

export const AssetManager: FC<AssetManagerProps> = ({ onDocumentChange }) => {
    const document = useEditorStore((state) => state.document);
    const importedAssets = useEditorStore((state) => state.importedAssets);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const { sendImportAsset } = useExtensionIpc();
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileIngestion = useCallback(
        (files: FileList | null) => {
            if (!files || files.length === 0) {
                return;
            }

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const lower = file.name.toLowerCase();
                const isFont =
                    lower.endsWith(".ttf") ||
                    lower.endsWith(".otf") ||
                    lower.endsWith(".woff") ||
                    lower.endsWith(".woff2");
                const assetType = isFont ? "font" : "image";

                const reader = new FileReader();
                reader.onload = () => {
                    const result = reader.result as string;
                    const b64 = result.includes(",")
                        ? result.split(",")[1]
                        : result;
                    sendImportAsset(file.name, assetType, b64);
                };
                reader.readAsDataURL(file);
            }
        },
        [sendImportAsset]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
            handleFileIngestion(e.dataTransfer.files);
        },
        [handleFileIngestion]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    }, []);

    const insertAssetAsWidget = useCallback(
        (asset: {
            alias: string;
            relativePath: string;
            assetType: string;
        }) => {
            if (!document) {
                return;
            }

            const existingIds = collectAllIds(document.root);
            let baseId = asset.alias.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
            let count = 1;
            let id = `asset_${baseId}`;
            while (existingIds.has(id)) {
                id = `asset_${baseId}_${count++}`;
            }

            let nodeToInsert: WidgetNode;

            if (asset.assetType === "image") {
                nodeToInsert = {
                    id,
                    widget_type: "rectangle" as WidgetType,
                    properties: {
                        background_color: "#27272a",
                        border_color: "#3f3f46",
                        border_width: 1,
                        corner_radius: 8,
                        text: asset.alias,
                        custom_properties: {
                            image_path: asset.relativePath,
                        },
                    },
                    layout: {
                        dimensions: {
                            width: { type: "fixed", value: 200 },
                            height: { type: "fixed", value: 160 },
                        },
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                };
            } else {
                nodeToInsert = {
                    id,
                    widget_type: "label" as WidgetType,
                    properties: {
                        text: `Typography Preview (${asset.alias})`,
                        font_size: 16,
                        font_alias: asset.alias,
                    },
                    layout: {
                        dimensions: {
                            width: { type: "fixed", value: 240 },
                            height: { type: "fixed", value: 40 },
                        },
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                };
            }

            executeNodeMutation(`Insert Asset Widget: ${id}`, (root) =>
                insertChild(root, root.id, nodeToInsert)
            );
            setSelectedNodeId(id);
        },
        [document, executeNodeMutation, setSelectedNodeId]
    );

    const docAssets = [
        ...(document?.assets?.images ?? []).map((img) => ({
            alias: img.alias,
            relativePath: img.path,
            fullPath: img.path,
            assetType: "image",
        })),
        ...(document?.assets?.fonts ?? []).map((f) => ({
            alias: f.alias,
            relativePath: f.path,
            fullPath: f.path,
            assetType: "font",
        })),
    ];

    const allAssets = [...docAssets, ...importedAssets].filter(
        (v, i, a) => a.findIndex((t) => t.relativePath === v.relativePath) === i
    );

    const filteredAssets = allAssets.filter(
        (a) =>
            a.alias.toLowerCase().includes(searchFilter.toLowerCase()) ||
            a.relativePath.toLowerCase().includes(searchFilter.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-zinc-900 overflow-hidden text-zinc-200">
            <div className="p-2 border-b border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300">
                        Smart Asset Pipeline
                    </span>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition-colors"
                    >
                        + Import
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".png,.jpg,.jpeg,.svg,.webp,.ttf,.otf,.woff,.woff2"
                        className="hidden"
                        onChange={(e) => {
                            handleFileIngestion(e.target.files);
                            e.target.value = "";
                        }}
                    />
                </div>

                <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search assets..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
                />
            </div>

            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`m-2 p-3 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                    isDraggingOver
                        ? "border-blue-500 bg-blue-500/10 text-blue-300"
                        : "border-zinc-700/60 bg-zinc-950/40 text-zinc-400 hover:border-zinc-600"
                }`}
            >
                <span className="text-lg">📁</span>
                <span className="text-[11px] font-medium text-center">
                    Drop images (.png, .svg) or fonts (.ttf, .otf)
                </span>
                <span className="text-[9px] text-zinc-500">
                    Auto-centralized to assets/ directory
                </span>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
                {filteredAssets.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500">
                        No assets registered yet
                    </div>
                ) : (
                    filteredAssets.map((asset) => (
                        <div
                            key={asset.relativePath}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData(
                                    "application/ruxel-widget-type",
                                    asset.assetType === "image"
                                        ? "rectangle"
                                        : "label"
                                );
                            }}
                            className="flex items-center gap-2 p-1.5 rounded bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 group transition-all"
                        >
                            <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center shrink-0 text-base">
                                {asset.assetType === "image" ? "🖼️" : "🔤"}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-zinc-200 truncate">
                                    {asset.alias}
                                </div>
                                <div className="text-[10px] font-mono text-zinc-500 truncate">
                                    {asset.relativePath}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => insertAssetAsWidget(asset)}
                                className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-all shrink-0"
                                title="Add to canvas"
                            >
                                Insert
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

