import type {
    AnimationDefinition,
    AssetRegistry,
    BreadcrumbItem,
    ProjectMetadata,
    RuxDocument,
    ThemeConfig,
    WidgetBindings,
    WidgetEvents,
    WidgetLayout,
    WidgetNode,
    WidgetProperties,
    WidgetType,
    WindowConfig,
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
        type: widgetType,
        ...(slot !== undefined ? { slot } : {}),
        properties,
        props: properties,
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
        name: appName,
        app_version: appVersion,
        version: appVersion,
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
                    author: String(rawMeta.author),
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
            : ({
                  active_scheme: "dark",
                  color_palettes: {
                      light: {
                          primary: "#0061A4",
                          on_primary: "#FFFFFF",
                          primary_container: "#D1E4FF",
                          on_primary_container: "#001D36",
                          secondary: "#535F70",
                          on_secondary: "#FFFFFF",
                          secondary_container: "#D7E3F7",
                          on_secondary_container: "#101C2B",
                          tertiary: "#6B5778",
                          on_tertiary: "#FFFFFF",
                          tertiary_container: "#F2DAFF",
                          on_tertiary_container: "#251431",
                          error: "#BA1A1A",
                          on_error: "#FFFFFF",
                          error_container: "#FFDAD6",
                          on_error_container: "#410002",
                          surface: "#FDFCFF",
                          on_surface: "#1A1C1E",
                          surface_variant: "#DFE2EB",
                          on_surface_variant: "#43474E",
                          outline: "#73777F",
                          outline_variant: "#C3C7D0",
                          background: "#FDFCFF",
                          on_background: "#1A1C1E",
                          inverse_surface: "#2F3033",
                          inverse_on_surface: "#F1F0F4",
                          inverse_primary: "#9ECAFF",
                          scrim: "#000000",
                          shadow: "#000000",
                      },
                      dark: {
                          primary: "#9ECAFF",
                          on_primary: "#003258",
                          primary_container: "#00497D",
                          on_primary_container: "#D1E4FF",
                          secondary: "#BBC7DB",
                          on_secondary: "#253140",
                          secondary_container: "#3B4858",
                          on_secondary_container: "#D7E3F7",
                          tertiary: "#D6BEE4",
                          on_tertiary: "#3B2948",
                          tertiary_container: "#523F5F",
                          on_tertiary_container: "#F2DAFF",
                          error: "#FFB4AB",
                          on_error: "#690005",
                          error_container: "#93000A",
                          on_error_container: "#FFDAD6",
                          surface: "#1A1C1E",
                          on_surface: "#E2E2E6",
                          surface_variant: "#43474E",
                          on_surface_variant: "#C3C7D0",
                          outline: "#8D9199",
                          outline_variant: "#43474E",
                          background: "#1A1C1E",
                          on_background: "#E2E2E6",
                          inverse_surface: "#E2E2E6",
                          inverse_on_surface: "#2F3033",
                          inverse_primary: "#0061A4",
                          scrim: "#000000",
                          shadow: "#000000",
                      },
                  },
                  typography: {
                      display_large: { font_family: "system-ui", font_weight: "bold", font_size: 57, line_height: 64, letter_spacing: -0.25 },
                      display_medium: { font_family: "system-ui", font_weight: "bold", font_size: 45, line_height: 52, letter_spacing: 0 },
                      display_small: { font_family: "system-ui", font_weight: "bold", font_size: 36, line_height: 44, letter_spacing: 0 },
                      headline_large: { font_family: "system-ui", font_weight: "normal", font_size: 32, line_height: 40, letter_spacing: 0 },
                      headline_medium: { font_family: "system-ui", font_weight: "normal", font_size: 28, line_height: 36, letter_spacing: 0 },
                      headline_small: { font_family: "system-ui", font_weight: "normal", font_size: 24, line_height: 32, letter_spacing: 0 },
                      title_large: { font_family: "system-ui", font_weight: "normal", font_size: 22, line_height: 28, letter_spacing: 0 },
                      title_medium: { font_family: "system-ui", font_weight: "medium", font_size: 16, line_height: 24, letter_spacing: 0.15 },
                      title_small: { font_family: "system-ui", font_weight: "medium", font_size: 14, line_height: 20, letter_spacing: 0.1 },
                      body_large: { font_family: "system-ui", font_weight: "normal", font_size: 16, line_height: 24, letter_spacing: 0.5 },
                      body_medium: { font_family: "system-ui", font_weight: "normal", font_size: 14, line_height: 20, letter_spacing: 0.25 },
                      body_small: { font_family: "system-ui", font_weight: "normal", font_size: 12, line_height: 16, letter_spacing: 0.4 },
                      label_large: { font_family: "system-ui", font_weight: "medium", font_size: 14, line_height: 20, letter_spacing: 0.1 },
                      label_medium: { font_family: "system-ui", font_weight: "medium", font_size: 12, line_height: 16, letter_spacing: 0.5 },
                      label_small: { font_family: "system-ui", font_weight: "medium", font_size: 11, line_height: 16, letter_spacing: 0.5 },
                  },
                  border_radii: {
                      none: 0,
                      sm: 4,
                      md: 8,
                      lg: 12,
                      xl: 16,
                      full: 9999,
                  },
                  shadows: [],
                  spacing: {
                      none: 0,
                      xs: 4,
                      sm: 8,
                      md: 16,
                      lg: 24,
                      xl: 32,
                      xxl: 48,
                  },
              } as ThemeConfig);

    let root: WidgetNode;
    if (rawDoc.root && typeof rawDoc.root === "object") {
        root = normalizeWidgetNode(rawDoc.root as Record<string, unknown>);
    } else if (rawDoc.type || rawDoc.widget_type) {
        root = normalizeWidgetNode(rawDoc);
    } else {
        root = {
            id: "root",
            widget_type: "v_box",
            type: "v_box",
            properties: {},
            props: {},
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
        root,
        type: root.widget_type,
        props: root.properties,
        children: root.children,
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

export function formatJson(text: string): string {
    try {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return text;
    }
}
