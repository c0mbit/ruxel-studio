import { FC, useState, useEffect, useCallback, useRef } from "react";
import type { WidgetNode } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";
import {
    findNodeById,
    findParentNode,
    removeChild,
    moveNode,
    duplicateNode,
    findChildIndex,
} from "../utils/treeTraversal";
import {
    getWidgetTypeLabel,
    getWidgetTypeIcon,
    isContainerWidget,
    collectAllIds,
} from "../utils/widgetFactory";

type DropPosition = "before" | "inside" | "after";

interface DropTarget {
    readonly nodeId: string;
    readonly position: DropPosition;
}

interface HierarchyTreeProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

export const HierarchyTree: FC<HierarchyTreeProps> = ({
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<ReadonlySet<string>>(
        new Set<string>(["root"])
    );
    const dragSourceIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (document?.root.id) {
            setExpandedNodes((prev) => {
                if (prev.has(document.root.id)) {
                    return prev;
                }
                const next = new Set(prev);
                next.add(document.root.id);
                return next;
            });
        }
    }, [document]);

    const toggleExpanded = useCallback((nodeId: string) => {
        setExpandedNodes((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    const handleSelectNode = useCallback(
        (nodeId: string) => {
            setSelectedNodeId(nodeId);
        },
        [setSelectedNodeId]
    );

    const handleDeleteNode = useCallback(
        (nodeId: string) => {
            if (!document) {
                return;
            }
            if (nodeId === document.root.id) {
                return;
            }

            executeNodeMutation(`Delete ${nodeId}`, (root) =>
                removeChild(root, nodeId)
            );

            if (selectedNodeId === nodeId) {
                setSelectedNodeId(document.root.id);
            }
        },
        [document, selectedNodeId, setSelectedNodeId, executeNodeMutation]
    );

    const handleDuplicateNode = useCallback(
        (nodeId: string) => {
            if (!document) {
                return;
            }
            if (nodeId === document.root.id) {
                return;
            }

            const allIds = collectAllIds(document.root);

            executeNodeMutation(`Duplicate ${nodeId}`, (root) =>
                duplicateNode(root, nodeId, allIds)
            );
        },
        [document, executeNodeMutation]
    );

    const handleToggleVisibility = useCallback(
        (nodeId: string) => {
            if (!document) {
                return;
            }

            const node = findNodeById(document.root, nodeId);
            if (!node) {
                return;
            }

            const currentlyVisible = node.properties?.visible !== false;

            executeNodeMutation(
                `${currentlyVisible ? "Hide" : "Show"} ${nodeId}`,
                (root) => {
                    return updateNodeInTree(root, nodeId, (n) => ({
                        ...n,
                        properties: {
                            ...n.properties,
                            visible: !currentlyVisible,
                        },
                    }));
                }
            );
        },
        [document, executeNodeMutation]
    );

    const handleToggleDisabled = useCallback(
        (nodeId: string) => {
            if (!document) {
                return;
            }

            const node = findNodeById(document.root, nodeId);
            if (!node) {
                return;
            }

            const currentlyDisabled = node.properties?.disabled === true;

            executeNodeMutation(
                `${currentlyDisabled ? "Enable" : "Disable"} ${nodeId}`,
                (root) => {
                    return updateNodeInTree(root, nodeId, (n) => ({
                        ...n,
                        properties: {
                            ...n.properties,
                            disabled: !currentlyDisabled,
                        },
                    }));
                }
            );
        },
        [document, executeNodeMutation]
    );

    const handleDragStart = useCallback(
        (e: React.DragEvent, nodeId: string) => {
            if (!document || nodeId === document.root.id) {
                e.preventDefault();
                return;
            }
            dragSourceIdRef.current = nodeId;
            e.dataTransfer.setData("application/ruxel-tree-node-id", nodeId);
            e.dataTransfer.effectAllowed = "move";
        },
        [document]
    );

    const computeDropPosition = useCallback(
        (e: React.DragEvent, targetNodeId: string): DropPosition => {
            const rect = (e.target as HTMLElement)
                .closest("[data-tree-node-id]")
                ?.getBoundingClientRect();
            if (!rect) {
                return "inside";
            }

            const relativeY = e.clientY - rect.top;
            const thirdHeight = rect.height / 3;

            if (relativeY < thirdHeight) {
                return "before";
            }
            if (relativeY > thirdHeight * 2) {
                return "after";
            }

            if (!document) {
                return "after";
            }

            const targetNode = findNodeById(document.root, targetNodeId);
            if (targetNode && isContainerWidget(targetNode.widget_type)) {
                return "inside";
            }

            return "after";
        },
        [document]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent, targetNodeId: string) => {
            e.preventDefault();
            e.stopPropagation();

            const sourceId = dragSourceIdRef.current;
            if (!sourceId || sourceId === targetNodeId) {
                return;
            }

            const position = computeDropPosition(e, targetNodeId);
            setDropTarget({ nodeId: targetNodeId, position });
            e.dataTransfer.dropEffect = "move";
        },
        [computeDropPosition]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent, targetNodeId: string) => {
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(null);

            const sourceId = dragSourceIdRef.current;
            dragSourceIdRef.current = null;

            if (!sourceId || !document || sourceId === targetNodeId) {
                return;
            }

            if (isDescendantOf(document.root, targetNodeId, sourceId)) {
                return;
            }

            const position = computeDropPosition(e, targetNodeId);

            executeNodeMutation(
                `Move ${sourceId} ${position} ${targetNodeId}`,
                (root) => {
                    if (position === "inside") {
                        return moveNode(root, sourceId, targetNodeId);
                    }

                    const parent = findParentNode(root, targetNodeId);
                    if (!parent) {
                        return root;
                    }

                    const targetIndex = findChildIndex(parent, targetNodeId);
                    const insertionIndex =
                        position === "before" ? targetIndex : targetIndex + 1;

                    return moveNode(
                        root,
                        sourceId,
                        parent.id,
                        insertionIndex
                    );
                }
            );
        },
        [document, executeNodeMutation, computeDropPosition]
    );

    const handleDragEnd = useCallback(() => {
        dragSourceIdRef.current = null;
        setDropTarget(null);
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, nodeId: string) => {
            if (
                e.key === "Delete" ||
                e.key === "Backspace"
            ) {
                e.preventDefault();
                handleDeleteNode(nodeId);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
                e.preventDefault();
                handleDuplicateNode(nodeId);
            }
        },
        [handleDeleteNode, handleDuplicateNode]
    );

    if (!document) {
        return (
            <div className="flex-1 flex items-center justify-center bg-zinc-900 text-zinc-500 text-xs">
                No document loaded
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
            <header className="px-3 py-2 border-b border-zinc-800 shrink-0">
                <h2 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    Hierarchy
                </h2>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 py-1">
                <TreeNodeRow
                    node={document.root}
                    depth={0}
                    selectedNodeId={selectedNodeId}
                    expandedNodes={expandedNodes}
                    dropTarget={dropTarget}
                    onSelect={handleSelectNode}
                    onToggleExpand={toggleExpanded}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onKeyDown={handleKeyDown}
                    onToggleVisibility={handleToggleVisibility}
                    onToggleDisabled={handleToggleDisabled}
                    onDelete={handleDeleteNode}
                    onDuplicate={handleDuplicateNode}
                    isRoot
                />
            </div>
        </div>
    );
};

interface TreeNodeRowProps {
    readonly node: WidgetNode;
    readonly depth: number;
    readonly selectedNodeId: string | null;
    readonly expandedNodes: ReadonlySet<string>;
    readonly dropTarget: DropTarget | null;
    readonly onSelect: (nodeId: string) => void;
    readonly onToggleExpand: (nodeId: string) => void;
    readonly onDragStart: (e: React.DragEvent, nodeId: string) => void;
    readonly onDragOver: (e: React.DragEvent, nodeId: string) => void;
    readonly onDrop: (e: React.DragEvent, nodeId: string) => void;
    readonly onDragEnd: () => void;
    readonly onKeyDown: (e: React.KeyboardEvent, nodeId: string) => void;
    readonly onToggleVisibility: (nodeId: string) => void;
    readonly onToggleDisabled: (nodeId: string) => void;
    readonly onDelete: (nodeId: string) => void;
    readonly onDuplicate: (nodeId: string) => void;
    readonly isRoot?: boolean;
}

const TreeNodeRow: FC<TreeNodeRowProps> = ({
    node,
    depth,
    selectedNodeId,
    expandedNodes,
    dropTarget,
    onSelect,
    onToggleExpand,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onKeyDown,
    onToggleVisibility,
    onToggleDisabled,
    onDelete,
    onDuplicate,
    isRoot,
}) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(node.id) || (isRoot === true);
    const isSelected = selectedNodeId === node.id;
    const isHidden = node.properties?.visible === false;
    const isDisabled = node.properties?.disabled === true;

    const isDropBefore =
        dropTarget?.nodeId === node.id && dropTarget.position === "before";
    const isDropInside =
        dropTarget?.nodeId === node.id && dropTarget.position === "inside";
    const isDropAfter =
        dropTarget?.nodeId === node.id && dropTarget.position === "after";

    return (
        <div>
            {isDropBefore && (
                <div
                    className="h-0.5 bg-blue-500 mx-2 rounded-full"
                    style={{ marginLeft: `${depth * 16 + 8}px` }}
                />
            )}

            <div
                data-tree-node-id={node.id}
                draggable={!isRoot}
                onDragStart={(e) => onDragStart(e, node.id)}
                onDragOver={(e) => onDragOver(e, node.id)}
                onDrop={(e) => onDrop(e, node.id)}
                onDragEnd={onDragEnd}
                onKeyDown={(e) => onKeyDown(e, node.id)}
                onClick={() => onSelect(node.id)}
                tabIndex={0}
                className={`group flex items-center gap-1 px-1.5 py-0.5 mx-1 rounded text-xs cursor-pointer outline-none transition-colors ${
                    isSelected
                        ? "bg-blue-600/25 text-blue-300 ring-1 ring-blue-500/40"
                        : "text-zinc-300 hover:bg-zinc-800/80"
                } ${isDropInside ? "ring-1 ring-blue-400 bg-blue-950/30" : ""} ${
                    isHidden ? "opacity-40" : ""
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(node.id);
                        }}
                        className="w-4 h-4 flex items-center justify-center shrink-0"
                    >
                        <svg
                            className={`w-3 h-3 text-zinc-500 transition-transform ${
                                isExpanded ? "rotate-90" : ""
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
                    </button>
                ) : (
                    <span className="w-4 h-4 shrink-0" />
                )}

                <span className="w-4 text-center text-sm leading-none shrink-0">
                    {getWidgetTypeIcon(node.widget_type)}
                </span>

                <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                    {getWidgetTypeLabel(node.widget_type)}
                </span>

                <span className="truncate text-[11px]">{node.id}</span>

                {node.slot && (
                    <span className="ml-auto shrink-0 px-1 py-0 rounded text-[9px] font-mono bg-amber-900/40 text-amber-400 border border-amber-700/50">
                        {node.slot}
                    </span>
                )}

                {isDisabled && (
                    <span className="shrink-0 px-1 py-0 rounded text-[9px] font-mono bg-zinc-800 text-zinc-500 border border-zinc-700">
                        off
                    </span>
                )}

                <div className="ml-auto shrink-0 hidden group-hover:flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleVisibility(node.id);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                        title={isHidden ? "Show" : "Hide"}
                    >
                        <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            {isHidden ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.5 6.5m3.378 3.378L6.5 6.5m0 0L3 3m3.5 3.5L3 3m18 18l-3.5-3.5m0 0a9.956 9.956 0 01-4.5 1.5c-4.478 0-8.268-2.943-9.543-7a9.965 9.965 0 014.02-5.38m2.152-.733A9.96 9.96 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.042 3.5"
                                />
                            ) : (
                                <>
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                </>
                            )}
                        </svg>
                    </button>

                    {!isRoot && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicate(node.id);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300"
                                title="Duplicate (Ctrl+D)"
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
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(node.id);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                                title="Delete (Del)"
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isDropAfter && (
                <div
                    className="h-0.5 bg-blue-500 mx-2 rounded-full"
                    style={{ marginLeft: `${depth * 16 + 8}px` }}
                />
            )}

            {isExpanded &&
                hasChildren &&
                node.children!.map((child) => (
                    <TreeNodeRow
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        selectedNodeId={selectedNodeId}
                        expandedNodes={expandedNodes}
                        dropTarget={dropTarget}
                        onSelect={onSelect}
                        onToggleExpand={onToggleExpand}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragEnd={onDragEnd}
                        onKeyDown={onKeyDown}
                        onToggleVisibility={onToggleVisibility}
                        onToggleDisabled={onToggleDisabled}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                    />
                ))}
        </div>
    );
};

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

function isDescendantOf(
    root: WidgetNode,
    nodeId: string,
    potentialAncestorId: string
): boolean {
    const ancestor = findNodeById(root, potentialAncestorId);
    if (!ancestor) {
        return false;
    }
    if (ancestor.id === nodeId) {
        return true;
    }
    if (ancestor.children) {
        for (const child of ancestor.children) {
            if (isDescendantOf(child, nodeId, child.id)) {
                return true;
            }
        }
    }
    return false;
}

