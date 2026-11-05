import { FC, useMemo, useState } from "react";
import type {
    EventHandler,
    RuxDocument,
    WidgetEvents,
    WidgetNode,
} from "@ruxel/shared-types";
import { useEditorStore } from "../../state/editorStore";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { findNodeById } from "../../utils/treeTraversal";
import { getWidgetTypeIcon, getWidgetTypeLabel } from "../../utils/widgetFactory";
import {
    inferDocumentStateFields,
    suggestEventForNode,
    toPascalCase,
    toSnakeCase,
} from "../../utils/stateInference";

interface EventFlowTabProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

interface EventFlowItem {
    readonly widgetId: string;
    readonly widgetType: string;
    readonly eventKind: string;
    readonly handlerName: string;
    readonly messageVariant: string;
    readonly payloadType: "Unit" | "String" | "bool" | "f64";
    readonly boundStateField?: string;
    readonly navigateTo?: string;
}

export const EventFlowTab: FC<EventFlowTabProps> = ({ onDocumentChange }) => {
    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [scope, setScope] = useState<"selected" | "document">("selected");
    const [filterQuery, setFilterQuery] = useState("");

    const selectedNode =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
            : null;

    const allFlows = useMemo(() => {
        if (!document) {
            return [];
        }

        const flows: EventFlowItem[] = [];

        function inspectNode(node: WidgetNode) {
            if (node.events) {
                extractFlowsFromNode(node, flows);
            }
            if (node.children) {
                for (const child of node.children) {
                    inspectNode(child);
                }
            }
        }

        inspectNode(document.root);
        return flows;
    }, [document]);

    const displayedFlows = useMemo(() => {
        let base = allFlows;
        if (scope === "selected" && selectedNodeId) {
            base = base.filter((f) => f.widgetId === selectedNodeId);
        }

        const query = filterQuery.trim().toLowerCase();
        if (!query) {
            return base;
        }

        return base.filter(
            (f) =>
                f.widgetId.toLowerCase().includes(query) ||
                f.eventKind.toLowerCase().includes(query) ||
                f.handlerName.toLowerCase().includes(query) ||
                f.messageVariant.toLowerCase().includes(query)
        );
    }, [allFlows, scope, selectedNodeId, filterQuery]);

    const inferredFields = useMemo(
        () => inferDocumentStateFields(document),
        [document]
    );

    const handleQuickAddEvent = (eventKind: string) => {
        if (!selectedNode || !selectedNodeId) {
            return;
        }

        const suggestion = suggestEventForNode(selectedNode, eventKind);

        executeNodeMutation(
            `Add ${eventKind} on ${selectedNodeId}`,
            (root) =>
                updateNodeInTree(root, selectedNodeId, (node) => ({
                    ...node,
                    events: {
                        ...node.events,
                        [eventKind]: {
                            handler_name: suggestion.handlerName,
                            message: suggestion.messageVariant,
                        },
                    },
                }))
        );
    };

    const handleUpdateNavigateTo = (
        widgetId: string,
        eventKind: string,
        targetScreen?: string
    ) => {
        executeNodeMutation(
            `Set navigate_to on ${widgetId}.${eventKind}`,
            (root) =>
                updateNodeInTree(root, widgetId, (node) => {
                    const existingEvents = node.events as Record<string, EventHandler | undefined> | undefined;
                    const existing = existingEvents?.[eventKind];
                    if (!existing) {
                        return node;
                    }
                    return {
                        ...node,
                        events: {
                            ...node.events,
                            [eventKind]: {
                                ...existing,
                                navigate_to: targetScreen,
                            },
                        },
                    };
                })
        );
    };

    return (
        <div className="flex flex-col select-none text-xs text-zinc-300 pb-8">
            <div className="p-2 border-b border-zinc-800 flex flex-col gap-2 bg-zinc-950/40">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200 text-[11px]">
                        Event Data Flow Visualizer
                    </span>
                    <div className="flex items-center bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[10px]">
                        <button
                            type="button"
                            onClick={() => setScope("selected")}
                            className={`px-2 py-0.5 rounded transition-colors ${
                                scope === "selected"
                                    ? "bg-zinc-800 text-blue-400 font-semibold"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            Selected
                        </button>
                        <button
                            type="button"
                            onClick={() => setScope("document")}
                            className={`px-2 py-0.5 rounded transition-colors ${
                                scope === "document"
                                    ? "bg-zinc-800 text-blue-400 font-semibold"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            Entire App ({allFlows.length})
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <input
                        type="text"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder="Filter event flows..."
                        className="w-full h-5 px-2 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                </div>
            </div>

            <div className="flex flex-col gap-2 p-2">
                {displayedFlows.length === 0 ? (
                    <div className="p-4 rounded border border-dashed border-zinc-800 text-center flex flex-col items-center gap-2">
                        <span className="text-zinc-500 text-[11px]">
                            {scope === "selected"
                                ? "No event handlers configured on this widget."
                                : "No event handlers configured in this document."}
                        </span>

                        {scope === "selected" && selectedNode && (
                            <div className="flex items-center gap-1.5 mt-1">
                                <button
                                    type="button"
                                    onClick={() => handleQuickAddEvent("on_click")}
                                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[10px] transition-colors"
                                >
                                    + Attach Click Event
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleQuickAddEvent("on_change")}
                                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-[10px] border border-zinc-700 transition-colors"
                                >
                                    + Attach Change Event
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    displayedFlows.map((flow, index) => (
                        <div
                            key={`${flow.widgetId}_${flow.eventKind}_${index}`}
                            className="flex flex-col gap-1.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800 shadow-sm"
                        >
                            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
                                <button
                                    type="button"
                                    onClick={() => setSelectedNodeId(flow.widgetId)}
                                    className="flex items-center gap-1.5 text-left hover:text-blue-400 transition-colors"
                                >
                                    <span className="text-xs">
                                        {getWidgetTypeIcon(flow.widgetType as any)}
                                    </span>
                                    <span className="font-mono text-[11px] font-semibold text-zinc-200">
                                        #{flow.widgetId}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">
                                        ({getWidgetTypeLabel(flow.widgetType as any)})
                                    </span>
                                </button>

                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-purple-950/60 border border-purple-800/60 text-purple-300 uppercase">
                                    {flow.payloadType}
                                </span>
                            </div>

                            <div className="flex flex-col gap-1 text-[10px] font-mono pt-0.5">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                        Trigger:
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-300 font-medium">
                                        {flow.eventKind}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 text-zinc-600 pl-4 py-0.2">
                                    <span>↓ dispatches message</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                        UiMessage:
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/80 text-blue-300 font-medium truncate">
                                        UiMessage::{flow.messageVariant}
                                        {flow.payloadType !== "Unit"
                                            ? `(${flow.payloadType})`
                                            : ""}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1 text-zinc-600 pl-4 py-0.2">
                                    <span>↓ routes via dispatch()</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                        Handler:
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 font-medium truncate">
                                        fn {flow.handlerName}(&mut self, state: &mut AppState)
                                    </span>
                                </div>

                                {flow.boundStateField && (
                                    <>
                                        <div className="flex items-center gap-1 text-zinc-600 pl-4 py-0.2">
                                            <span>↓ updates state</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                                State:
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-cyan-300 font-medium truncate">
                                                {flow.boundStateField}
                                            </span>
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800/60">
                                    <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                        Route:
                                    </span>
                                    <input
                                        type="text"
                                        value={flow.navigateTo ?? ""}
                                        placeholder="Navigate to Screen ID"
                                        onChange={(e) =>
                                            handleUpdateNavigateTo(
                                                flow.widgetId,
                                                flow.eventKind,
                                                e.target.value.trim() || undefined
                                            )
                                        }
                                        className="flex-1 h-5 px-1.5 rounded bg-zinc-900 border border-zinc-700 text-purple-300 font-medium text-[10px] outline-none focus:border-purple-500"
                                    />
                                </div>

                                {flow.navigateTo && (
                                    <>
                                        <div className="flex items-center gap-1 text-zinc-600 pl-4 py-0.2">
                                            <span>↓ navigates router stack</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-16 shrink-0 text-zinc-500 uppercase font-sans text-[9px]">
                                                Target:
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-800/80 text-purple-300 font-medium truncate">
                                                AppScreen::{flow.navigateTo}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

function extractFlowsFromNode(node: WidgetNode, flows: EventFlowItem[]) {
    const events = node.events;
    if (!events) {
        return;
    }

    const checkEvent = (
        kind: string,
        handler?: EventHandler,
        defaultPayload: "Unit" | "String" | "bool" | "f64" = "Unit"
    ) => {
        if (!handler || !handler.handler_name) {
            return;
        }

        const msgVariant =
            handler.message && handler.message.trim().length > 0
                ? toPascalCase(handler.message)
                : toPascalCase(`${node.id}_${kind.replace("on_", "")}`);

        let payloadType: "Unit" | "String" | "bool" | "f64" = defaultPayload;
        if (kind === "on_change") {
            if (
                node.widget_type === "checkbox" ||
                node.widget_type === "radio_button"
            ) {
                payloadType = "bool";
            } else if (
                node.widget_type === "slider" ||
                node.widget_type === "progress_bar"
            ) {
                payloadType = "f64";
            } else {
                payloadType = "String";
            }
        }

        const boundStateField = node.bindings?.value
            ? `app_state.${toSnakeCase(node.bindings.value)}`
            : undefined;

        flows.push({
            widgetId: node.id,
            widgetType: node.widget_type,
            eventKind: kind,
            handlerName: handler.handler_name,
            messageVariant: msgVariant,
            payloadType,
            boundStateField,
            navigateTo: handler.navigate_to,
        });
    };

    checkEvent("on_click", events.on_click, "Unit");
    checkEvent("on_change", events.on_change, "String");
    checkEvent("on_hover", events.on_hover, "Unit");
    checkEvent("on_submit", events.on_submit, "Unit");
    checkEvent("on_focus", events.on_focus, "Unit");

    if (events.custom_events) {
        for (const [customKind, customHandler] of Object.entries(
            events.custom_events
        )) {
            checkEvent(customKind, customHandler, "Unit");
        }
    }
}

function updateNodeInTree(
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
                updateNodeInTree(child, nodeId, updater)
            ),
        };
    }
    return root;
}

