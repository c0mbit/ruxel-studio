import type { BreadcrumbItem, RuxDocument, WidgetNode } from "@ruxel/shared-types";

export function findNodeById(root: WidgetNode, id: string): WidgetNode | null {
    if (root.id === id) {
        return root;
    }
    if (root.children) {
        for (const child of root.children) {
            const found = findNodeById(child, id);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

export function findNodePath(
    root: WidgetNode,
    targetId: string,
    currentPath: readonly BreadcrumbItem[] = []
): readonly BreadcrumbItem[] | null {
    const item: BreadcrumbItem = {
        id: root.id,
        widgetType: root.widget_type,
        name: root.properties?.text ?? root.id,
    };
    const nextPath = [...currentPath, item];

    if (root.id === targetId) {
        return nextPath;
    }

    if (root.children) {
        for (const child of root.children) {
            const found = findNodePath(child, targetId, nextPath);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

export function findParentNode(
    root: WidgetNode,
    targetId: string
): WidgetNode | null {
    if (root.children) {
        for (const child of root.children) {
            if (child.id === targetId) {
                return root;
            }
            const found = findParentNode(child, targetId);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

export function findChildIndex(
    parent: WidgetNode,
    childId: string
): number {
    if (!parent.children) {
        return -1;
    }
    return parent.children.findIndex((child) => child.id === childId);
}

export function insertChild(
    root: WidgetNode,
    parentId: string,
    newChild: WidgetNode,
    index?: number
): WidgetNode {
    if (root.id === parentId) {
        const currentChildren = root.children ?? [];
        const insertionIndex =
            index !== undefined
                ? Math.max(0, Math.min(index, currentChildren.length))
                : currentChildren.length;

        const nextChildren = [
            ...currentChildren.slice(0, insertionIndex),
            newChild,
            ...currentChildren.slice(insertionIndex),
        ];

        return { ...root, children: nextChildren };
    }

    if (root.children) {
        return {
            ...root,
            children: root.children.map((child) =>
                insertChild(child, parentId, newChild, index)
            ),
        };
    }

    return root;
}

export function removeChild(
    root: WidgetNode,
    targetId: string
): WidgetNode {
    if (root.id === targetId) {
        return root;
    }

    if (root.children) {
        const filtered = root.children.filter(
            (child) => child.id !== targetId
        );

        if (filtered.length !== root.children.length) {
            return { ...root, children: filtered };
        }

        return {
            ...root,
            children: root.children.map((child) =>
                removeChild(child, targetId)
            ),
        };
    }

    return root;
}

export function moveNode(
    root: WidgetNode,
    nodeId: string,
    newParentId: string,
    insertIndex?: number
): WidgetNode {
    const nodeToMove = findNodeById(root, nodeId);
    if (!nodeToMove) {
        return root;
    }

    const withoutNode = removeChild(root, nodeId);
    return insertChild(withoutNode, newParentId, nodeToMove, insertIndex);
}

export function reorderChild(
    root: WidgetNode,
    parentId: string,
    childId: string,
    newIndex: number
): WidgetNode {
    if (root.id === parentId) {
        if (!root.children) {
            return root;
        }

        const currentIndex = root.children.findIndex(
            (child) => child.id === childId
        );
        if (currentIndex === -1 || currentIndex === newIndex) {
            return root;
        }

        const nextChildren = [...root.children];
        const [moved] = nextChildren.splice(currentIndex, 1);
        const clampedIndex = Math.max(
            0,
            Math.min(newIndex, nextChildren.length)
        );
        nextChildren.splice(clampedIndex, 0, moved);

        return { ...root, children: nextChildren };
    }

    if (root.children) {
        return {
            ...root,
            children: root.children.map((child) =>
                reorderChild(child, parentId, childId, newIndex)
            ),
        };
    }

    return root;
}

function cloneNodeWithNewIds(
    node: WidgetNode,
    existingIds: Set<string>
): WidgetNode {
    const basePrefix = node.widget_type.replace(/3_d$/, "3d");
    let counter = 1;
    while (existingIds.has(`${basePrefix}_${counter}`)) {
        counter++;
    }
    const newId = `${basePrefix}_${counter}`;
    existingIds.add(newId);

    const clonedChildren = node.children
        ? node.children.map((child) => cloneNodeWithNewIds(child, existingIds))
        : undefined;

    return {
        ...node,
        id: newId,
        children: clonedChildren,
    };
}

export function duplicateNode(
    root: WidgetNode,
    nodeId: string,
    existingIds: Set<string>
): WidgetNode {
    const parent = findParentNode(root, nodeId);
    if (!parent) {
        return root;
    }

    const original = findNodeById(root, nodeId);
    if (!original) {
        return root;
    }

    const cloned = cloneNodeWithNewIds(original, existingIds);
    const parentIndex = findChildIndex(parent, nodeId);

    return insertChild(root, parent.id, cloned, parentIndex + 1);
}

export function updateNodeProperty(
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
                updateNodeProperty(child, nodeId, updater)
            ),
        };
    }

    return root;
}

export function applyDocumentMutation(
    doc: RuxDocument,
    rootMutator: (root: WidgetNode) => WidgetNode
): RuxDocument {
    return {
        ...doc,
        root: rootMutator(doc.root),
    };
}

export function safeParseJson(text: string): {
    document: RuxDocument | null;
    error: string | null;
} {
    try {
        const parsed = JSON.parse(text) as RuxDocument;
        return { document: parsed, error: null };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { document: null, error: message };
    }
}

export function formatJson(text: string): string {
    try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return text;
    }
}
