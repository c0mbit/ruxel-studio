import {
    type AnimationDefinition,
    type AssetRegistry,
    type BreadcrumbItem,
    type ProjectMetadata,
    type RuxDocument,
    type ThemeConfig,
    type WidgetBindings,
    type WidgetEvents,
    type WidgetLayout,
    type WidgetNode,
    type WidgetProperties,
    type WidgetType,
    type WindowConfig,
    createDefaultTheme,
    serializeRuxDocument,
} from "@ruxel/shared-types";

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
        name:
            typeof root.properties?.text === "string"
                ? root.properties.text
                : typeof root.properties?.text === "object" &&
                  root.properties.text &&
                  "value" in root.properties.text
                ? String((root.properties.text as { value: unknown }).value)
                : root.id,
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

export function isDescendant(
    root: WidgetNode,
    ancestorId: string,
    targetId: string
): boolean {
    if (ancestorId === targetId) {
        return true;
    }
    const ancestor = findNodeById(root, ancestorId);
    if (!ancestor) {
        return false;
    }
    return Boolean(findNodeById(ancestor, targetId));
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

export function normalizeWidgetNode(
    rawNode: Record<string, unknown>
): WidgetNode {
    const id = typeof rawNode.id === "string" ? rawNode.id : "root";
    const widgetType = (rawNode.widget_type ?? rawNode.type ?? "v_box") as WidgetType;
    const slot = typeof rawNode.slot === "string" ? rawNode.slot : undefined;
    const properties = (rawNode.properties ?? rawNode.props ?? {}) as WidgetProperties;
    const layout = rawNode.layout as WidgetLayout | undefined;
    const events = rawNode.events as WidgetEvents | undefined;
    const bindings = rawNode.bindings as WidgetBindings | undefined;
    const animations = Array.isArray(rawNode.animations)
        ? (rawNode.animations as readonly AnimationDefinition[])
        : undefined;
    const rawChildren = Array.isArray(rawNode.children)
        ? rawNode.children
        : undefined;
    const children = rawChildren
        ? rawChildren.map((c) =>
              c && typeof c === "object"
                  ? normalizeWidgetNode(c as Record<string, unknown>)
                  : (c as WidgetNode)
          )
        : undefined;

    return {
        id,
        widget_type: widgetType,
        ...(slot !== undefined ? { slot } : {}),
        properties,
        ...(layout !== undefined ? { layout } : {}),
        ...(events !== undefined ? { events } : {}),
        ...(bindings !== undefined ? { bindings } : {}),
        ...(animations !== undefined ? { animations } : {}),
        ...(children !== undefined ? { children } : {}),
    };
}

export function normalizeRuxDocument(
    rawDoc: Record<string, unknown>
): RuxDocument {
    const rawMeta =
        rawDoc.metadata && typeof rawDoc.metadata === "object"
            ? (rawDoc.metadata as Record<string, unknown>)
            : {};
    const schemaVersion = (rawDoc.schema_version ??
        rawMeta.schema_version ??
        "1.0.0") as string;
    const appName = (rawMeta.app_name ?? rawMeta.name ?? "RuxelApp") as string;
    const appVersion = (rawDoc.version ??
        rawMeta.app_version ??
        rawMeta.version ??
        "0.1.0") as string;
    const targetFrameworks = Array.isArray(rawMeta.target_frameworks)
        ? rawMeta.target_frameworks
        : ["iced"];

    const metadata: ProjectMetadata = {
        schema_version: schemaVersion,
        app_name: appName,
        app_version: appVersion,
        target_frameworks: targetFrameworks as readonly (
            | "iced"
            | "egui"
            | "slint"
            | "dioxus"
            | "fyne"
            | "flet"
        )[],
        ...(rawMeta.description
            ? { description: String(rawMeta.description) }
            : {}),
        ...(Array.isArray(rawMeta.authors)
            ? { authors: rawMeta.authors as readonly string[] }
            : rawMeta.author
              ? {
                    authors: [String(rawMeta.author)],
                }
              : {}),
        ...(rawMeta.license ? { license: String(rawMeta.license) } : {}),
    };

    const window: WindowConfig =
        rawDoc.window && typeof rawDoc.window === "object"
            ? (rawDoc.window as WindowConfig)
            : {
                  title: "Ruxel Studio Window",
                  initial_width: 800,
                  initial_height: 600,
                  resizable: true,
                  scale_mode: "logical",
                  transparent: false,
                  decorations: true,
                  always_on_top: false,
                  fullscreen: false,
              };

    const assets =
        rawDoc.assets && typeof rawDoc.assets === "object"
            ? (rawDoc.assets as AssetRegistry)
            : { fonts: [], icons: [], images: [] };

    const theme =
        rawDoc.theme && typeof rawDoc.theme === "object"
            ? (rawDoc.theme as ThemeConfig)
            : createDefaultTheme();

    let root: WidgetNode;
    if (rawDoc.root && typeof rawDoc.root === "object") {
        root = normalizeWidgetNode(rawDoc.root as Record<string, unknown>);
    } else if (rawDoc.type || rawDoc.widget_type) {
        root = normalizeWidgetNode(rawDoc);
    } else {
        root = {
            id: "root",
            widget_type: "v_box",
            properties: {},
            children: [],
        };
    }

    return {
        $schema: typeof rawDoc.$schema === "string" ? rawDoc.$schema : undefined,
        schema_version: schemaVersion,
        version: appVersion,
        metadata,
        window,
        assets,
        theme,
        ...(rawDoc.components && typeof rawDoc.components === "object"
            ? { components: rawDoc.components as any }
            : {}),
        ...(rawDoc.i18n && typeof rawDoc.i18n === "object"
            ? { i18n: rawDoc.i18n as any }
            : {}),
        root,
    };
}

export function safeParseJson(text: string): {
    document: RuxDocument | null;
    error: string | null;
} {
    try {
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== "object") {
            return { document: null, error: "Document must be an object" };
        }
        return { document: normalizeRuxDocument(raw as Record<string, unknown>), error: null };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { document: null, error: message };
    }
}

export function extractComponentFromNode(
    doc: RuxDocument,
    nodeId: string,
    componentName: string
): { doc: RuxDocument; extractedNode: WidgetNode } | null {
    if (doc.root.id === nodeId) {
        return null;
    }
    const targetNode = findNodeById(doc.root, nodeId);
    if (!targetNode) {
        return null;
    }

    const snakeName = componentName
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase()
        .replace(/^_/, "");

    const customInstanceNode: WidgetNode = {
        id: `${snakeName}_inst`,
        widget_type: "custom_component",
        properties: {
            custom_type: componentName,
            raw_args: `${componentName}::new()`,
        },
        children: [],
        events: {},
        bindings: {},
        animations: [],
    };

    function replaceNodeInTree(current: WidgetNode): WidgetNode {
        if (current.id === nodeId) {
            return customInstanceNode;
        }
        if (!current.children) {
            return current;
        }
        return {
            ...current,
            children: current.children.map(replaceNodeInTree),
        };
    }

    const updatedRoot = replaceNodeInTree(doc.root);
    const existingComponents = doc.components ? { ...doc.components } : {};
    existingComponents[componentName] = {
        name: componentName,
        root: targetNode,
        file_path: `src/components/${snakeName}.rs`,
    };

    return {
        doc: {
            ...doc,
            root: updatedRoot,
            components: existingComponents,
        },
        extractedNode: targetNode,
    };
}

export function formatJson(text: string): string {
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
            return serializeRuxDocument(parsed as Record<string, unknown>);
        }
        return JSON.stringify(parsed, null, 2);
    } catch {
        return text;
    }
}
