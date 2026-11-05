import { FC, useState } from "react";
import type { WidgetNode } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { usePresetStore } from "../state/presetStore";
import { findNodeById } from "../utils/treeTraversal";
import { getWidgetTypeLabel, getWidgetTypeIcon } from "../utils/widgetFactory";
import { PropertiesTab } from "./inspector/PropertiesTab";
import { LayoutTab } from "./inspector/LayoutTab";
import { CodeTab } from "./inspector/CodeTab";
import { EventFlowTab } from "./inspector/EventFlowTab";

type InspectorTabKey = "properties" | "layout" | "code" | "event_flow";

interface InspectorPanelProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

const TAB_DEFINITIONS: readonly {
    readonly key: InspectorTabKey;
    readonly label: string;
}[] = [
    { key: "properties", label: "Properties" },
    { key: "layout", label: "Layout" },
    { key: "code", label: "Code" },
    { key: "event_flow", label: "Event Flow" },
];

export const InspectorPanel: FC<InspectorPanelProps> = ({
    onDocumentChange,
}) => {
    const [activeTab, setActiveTab] = useState<InspectorTabKey>("properties");

    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setIsSavePresetModalOpen = usePresetStore(
        (state) => state.setIsSavePresetModalOpen
    );

    const selectedNode: WidgetNode | null =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
            : null;

    return (
        <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
            <header className="shrink-0 border-b border-zinc-800">
                {selectedNode ? (
                    <div className="px-3 py-1.5 flex items-center gap-2">
                        <span className="text-sm leading-none">
                            {getWidgetTypeIcon(selectedNode.widget_type)}
                        </span>
                        <span className="text-xs font-medium text-zinc-200 truncate">
                            {getWidgetTypeLabel(selectedNode.widget_type)}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 truncate">
                            #{selectedNode.id}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsSavePresetModalOpen(true)}
                            className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
                            title="Save this widget as a team cloud preset"
                        >
                            <span>☁️</span>
                            <span>Preset</span>
                        </button>
                    </div>
                ) : (
                    <div className="px-3 py-1.5">
                        <span className="text-xs text-zinc-500 italic">
                            No selection
                        </span>
                    </div>
                )}

                <div className="flex bg-zinc-950/50 mx-1.5 mb-1.5 rounded border border-zinc-800 overflow-hidden">
                    {TAB_DEFINITIONS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                                activeTab === tab.key
                                    ? "bg-blue-600/20 text-blue-400 border-b-2 border-blue-500"
                                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                {activeTab === "properties" && (
                    <PropertiesTab onDocumentChange={onDocumentChange} />
                )}
                {activeTab === "layout" && (
                    <LayoutTab onDocumentChange={onDocumentChange} />
                )}
                {activeTab === "code" && (
                    <CodeTab onDocumentChange={onDocumentChange} />
                )}
                {activeTab === "event_flow" && (
                    <EventFlowTab onDocumentChange={onDocumentChange} />
                )}
            </div>
        </div>
    );
};
