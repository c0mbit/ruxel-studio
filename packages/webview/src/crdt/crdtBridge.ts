import * as Y from "yjs";
import type {
    RuxDocument,
    WidgetNode,
    WidgetType,
    WidgetLayout,
    WidgetProperties,
    WidgetEvents,
    WidgetBindings,
    AnimationDefinition,
    ProjectMetadata,
    WindowConfig,
    AssetRegistry,
    ThemeConfig,
} from "@ruxel/shared-types";

export const CRDT_ORIGIN_LOCAL = "zustand-local";
export const CRDT_ORIGIN_REMOTE = "crdt-remote";

export function widgetNodeToYMap(node: WidgetNode): Y.Map<unknown> {
    const map = new Y.Map<unknown>();
    map.set("id", node.id);
    map.set("widget_type", node.widget_type);
    if (node.slot) {
        map.set("slot", node.slot);
    }

    const propMap = new Y.Map<unknown>();
    if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
            propMap.set(key, value);
        }
    }
    map.set("properties", propMap);

    const layoutMap = new Y.Map<unknown>();
    if (node.layout) {
        for (const [key, value] of Object.entries(node.layout)) {
            layoutMap.set(key, value);
        }
    }
    map.set("layout", layoutMap);

    const eventMap = new Y.Map<unknown>();
    if (node.events) {
        for (const [key, value] of Object.entries(node.events)) {
            eventMap.set(key, value);
        }
    }
    map.set("events", eventMap);

    const bindingsMap = new Y.Map<unknown>();
    if (node.bindings) {
        for (const [key, value] of Object.entries(node.bindings)) {
            bindingsMap.set(key, value);
        }
    }
    map.set("bindings", bindingsMap);

    const animArray = new Y.Array<unknown>();
    if (node.animations && node.animations.length > 0) {
        animArray.push([...node.animations]);
    }
    map.set("animations", animArray);

    const childrenArray = new Y.Array<Y.Map<unknown>>();
    if (node.children && node.children.length > 0) {
        const childMaps = node.children.map((child) => widgetNodeToYMap(child));
        childrenArray.push(childMaps);
    }
    map.set("children", childrenArray);

    return map;
}

export function yMapToWidgetNode(map: Y.Map<unknown>): WidgetNode {
    const id = (map.get("id") as string) || "";
    const widgetType = (map.get("widget_type") as WidgetType) || "v_box";
    const slot = (map.get("slot") as string | undefined) ?? undefined;

    const propMap = map.get("properties") as Y.Map<unknown> | undefined;
    const properties: Record<string, unknown> = {};
    if (propMap && typeof propMap.forEach === "function") {
        propMap.forEach((v, k) => {
            properties[k] = v;
        });
    }

    const layoutMap = map.get("layout") as Y.Map<unknown> | undefined;
    const layout: Record<string, unknown> = {};
    if (layoutMap && typeof layoutMap.forEach === "function") {
        layoutMap.forEach((v, k) => {
            layout[k] = v;
        });
    }

    const eventMap = map.get("events") as Y.Map<unknown> | undefined;
    const events: Record<string, unknown> = {};
    if (eventMap && typeof eventMap.forEach === "function") {
        eventMap.forEach((v, k) => {
            events[k] = v;
        });
    }

    const bindingsMap = map.get("bindings") as Y.Map<unknown> | undefined;
    const bindings: Record<string, unknown> = {};
    if (bindingsMap && typeof bindingsMap.forEach === "function") {
        bindingsMap.forEach((v, k) => {
            bindings[k] = v;
        });
    }

    const animArray = map.get("animations") as Y.Array<unknown> | undefined;
    const animations =
        animArray && typeof animArray.toArray === "function"
            ? (animArray.toArray() as AnimationDefinition[])
            : undefined;

    const childArray = map.get("children") as Y.Array<Y.Map<unknown>> | undefined;
    const children: WidgetNode[] = [];
    if (childArray && typeof childArray.forEach === "function") {
        childArray.forEach((childMap) => {
            if (childMap instanceof Y.Map) {
                children.push(yMapToWidgetNode(childMap));
            }
        });
    }

    return {
        id,
        widget_type: widgetType,
        ...(slot ? { slot } : {}),
        properties: properties as unknown as WidgetProperties,
        layout: layout as unknown as WidgetLayout,
        ...(Object.keys(events).length > 0 ? { events: events as unknown as WidgetEvents } : {}),
        ...(Object.keys(bindings).length > 0 ? { bindings: bindings as unknown as WidgetBindings } : {}),
        ...(animations && animations.length > 0 ? { animations } : {}),
        ...(children.length > 0 ? { children } : {}),
    };
}

export function reconcileWidgetNodeToYMap(
    node: WidgetNode,
    yMap: Y.Map<unknown>
): void {
    if (yMap.get("id") !== node.id) {
        yMap.set("id", node.id);
    }
    if (yMap.get("widget_type") !== node.widget_type) {
        yMap.set("widget_type", node.widget_type);
    }
    if (node.slot) {
        if (yMap.get("slot") !== node.slot) {
            yMap.set("slot", node.slot);
        }
    } else {
        yMap.delete("slot");
    }

    let propMap = yMap.get("properties") as Y.Map<unknown> | undefined;
    if (!propMap || !(propMap instanceof Y.Map)) {
        propMap = new Y.Map<unknown>();
        yMap.set("properties", propMap);
    }
    const incomingProps = (node.properties ?? {}) as Record<string, unknown>;
    const existingKeys = new Set<string>();
    propMap.forEach((_, k) => existingKeys.add(k));

    for (const [key, value] of Object.entries(incomingProps)) {
        if (JSON.stringify(propMap.get(key)) !== JSON.stringify(value)) {
            propMap.set(key, value);
        }
        existingKeys.delete(key);
    }
    for (const key of existingKeys) {
        propMap.delete(key);
    }

    let layoutMap = yMap.get("layout") as Y.Map<unknown> | undefined;
    if (!layoutMap || !(layoutMap instanceof Y.Map)) {
        layoutMap = new Y.Map<unknown>();
        yMap.set("layout", layoutMap);
    }
    const incomingLayout = (node.layout ?? {}) as Record<string, unknown>;
    const existingLayoutKeys = new Set<string>();
    layoutMap.forEach((_, k) => existingLayoutKeys.add(k));

    for (const [key, value] of Object.entries(incomingLayout)) {
        if (JSON.stringify(layoutMap.get(key)) !== JSON.stringify(value)) {
            layoutMap.set(key, value);
        }
        existingLayoutKeys.delete(key);
    }
    for (const key of existingLayoutKeys) {
        layoutMap.delete(key);
    }

    let eventMap = yMap.get("events") as Y.Map<unknown> | undefined;
    if (!eventMap || !(eventMap instanceof Y.Map)) {
        eventMap = new Y.Map<unknown>();
        yMap.set("events", eventMap);
    }
    const incomingEvents = (node.events ?? {}) as Record<string, unknown>;
    const existingEventKeys = new Set<string>();
    eventMap.forEach((_, k) => existingEventKeys.add(k));

    for (const [key, value] of Object.entries(incomingEvents)) {
        if (JSON.stringify(eventMap.get(key)) !== JSON.stringify(value)) {
            eventMap.set(key, value);
        }
        existingEventKeys.delete(key);
    }
    for (const key of existingEventKeys) {
        eventMap.delete(key);
    }

    let bindingsMap = yMap.get("bindings") as Y.Map<unknown> | undefined;
    if (!bindingsMap || !(bindingsMap instanceof Y.Map)) {
        bindingsMap = new Y.Map<unknown>();
        yMap.set("bindings", bindingsMap);
    }
    const incomingBindings = (node.bindings ?? {}) as Record<string, unknown>;
    const existingBindingsKeys = new Set<string>();
    bindingsMap.forEach((_, k) => existingBindingsKeys.add(k));

    for (const [key, value] of Object.entries(incomingBindings)) {
        if (JSON.stringify(bindingsMap.get(key)) !== JSON.stringify(value)) {
            bindingsMap.set(key, value);
        }
        existingBindingsKeys.delete(key);
    }
    for (const key of existingBindingsKeys) {
        bindingsMap.delete(key);
    }

    let animArray = yMap.get("animations") as Y.Array<unknown> | undefined;
    if (!animArray || !(animArray instanceof Y.Array)) {
        animArray = new Y.Array<unknown>();
        yMap.set("animations", animArray);
    }
    const incomingAnimations = node.animations ?? [];
    if (JSON.stringify(animArray.toArray()) !== JSON.stringify(incomingAnimations)) {
        animArray.delete(0, animArray.length);
        if (incomingAnimations.length > 0) {
            animArray.push([...incomingAnimations]);
        }
    }

    let childArray = yMap.get("children") as Y.Array<Y.Map<unknown>> | undefined;
    if (!childArray || !(childArray instanceof Y.Array)) {
        childArray = new Y.Array<Y.Map<unknown>>();
        yMap.set("children", childArray);
    }

    const incomingChildren = node.children ?? [];
    const currentLength = childArray.length;

    let canReconcileInPlace = true;
    if (currentLength === incomingChildren.length) {
        for (let i = 0; i < currentLength; i++) {
            const existingChild = childArray.get(i);
            if (!(existingChild instanceof Y.Map) || existingChild.get("id") !== incomingChildren[i].id) {
                canReconcileInPlace = false;
                break;
            }
        }
    } else {
        canReconcileInPlace = false;
    }

    if (canReconcileInPlace) {
        for (let i = 0; i < currentLength; i++) {
            const existingChild = childArray.get(i);
            reconcileWidgetNodeToYMap(incomingChildren[i], existingChild);
        }
    } else {
        childArray.delete(0, currentLength);
        if (incomingChildren.length > 0) {
            const mapped = incomingChildren.map((c) => widgetNodeToYMap(c));
            childArray.push(mapped);
        }
    }
}

export class CrdtDocumentBridge {
    private readonly ydoc: Y.Doc;
    private onRemoteUpdateCallback: ((doc: RuxDocument) => void) | null = null;
    private isApplyingLocal = false;

    constructor(ydoc?: Y.Doc) {
        this.ydoc = ydoc ?? new Y.Doc();
        this.ydoc.on("afterTransaction", (transaction) => {
            if (transaction.origin !== CRDT_ORIGIN_LOCAL && !this.isApplyingLocal) {
                const updatedDoc = this.toRuxDocument();
                if (updatedDoc && this.onRemoteUpdateCallback) {
                    this.onRemoteUpdateCallback(updatedDoc);
                }
            }
        });
    }

    public getYDoc(): Y.Doc {
        return this.ydoc;
    }

    public setOnRemoteUpdate(callback: (doc: RuxDocument) => void): void {
        this.onRemoteUpdateCallback = callback;
    }

    public syncFromLocalDocument(document: RuxDocument): void {
        this.isApplyingLocal = true;
        try {
            this.ydoc.transact(() => {
                const metaMap = this.ydoc.getMap<unknown>("meta");
                if (document.$schema && metaMap.get("$schema") !== document.$schema) {
                    metaMap.set("$schema", document.$schema);
                }
                if (JSON.stringify(metaMap.get("metadata")) !== JSON.stringify(document.metadata)) {
                    metaMap.set("metadata", document.metadata);
                }
                if (JSON.stringify(metaMap.get("window")) !== JSON.stringify(document.window)) {
                    metaMap.set("window", document.window);
                }
                if (JSON.stringify(metaMap.get("assets")) !== JSON.stringify(document.assets)) {
                    metaMap.set("assets", document.assets);
                }

                const themeMap = this.ydoc.getMap<unknown>("theme");
                if (JSON.stringify(themeMap.toJSON()) !== JSON.stringify(document.theme)) {
                    for (const [k, v] of Object.entries(document.theme)) {
                        themeMap.set(k, v);
                    }
                }

                let rootMap = this.ydoc.getMap<unknown>("root");
                if (!rootMap.get("id")) {
                    const initializedMap = widgetNodeToYMap(document.root);
                    initializedMap.forEach((v, k) => {
                        rootMap.set(k, v);
                    });
                } else {
                    reconcileWidgetNodeToYMap(document.root, rootMap);
                }
            }, CRDT_ORIGIN_LOCAL);
        } finally {
            this.isApplyingLocal = false;
        }
    }

    public toRuxDocument(): RuxDocument | null {
        const rootMap = this.ydoc.getMap<unknown>("root");
        if (!rootMap.get("id")) {
            return null;
        }

        const root = yMapToWidgetNode(rootMap);
        const metaMap = this.ydoc.getMap<unknown>("meta");
        const $schema = metaMap.get("$schema") as string | undefined;
        const metadata = (metaMap.get("metadata") as ProjectMetadata) ?? {
            name: "RuxelProject",
            version: "0.1.0",
        };
        const windowProps = (metaMap.get("window") as WindowConfig) ?? {
            title: "Ruxel App",
            width: 800,
            height: 600,
            resizable: true,
        };
        const assets = (metaMap.get("assets") as AssetRegistry) ?? {
            fonts: [],
            icons: [],
            images: [],
            models3d: [],
        };

        const themeMap = this.ydoc.getMap<unknown>("theme");
        const theme = (themeMap.toJSON() as ThemeConfig) ?? {
            active_theme: "default_dark",
            custom_palettes: [],
        };

        return {
            ...($schema ? { $schema } : {}),
            metadata,
            window: windowProps,
            assets,
            theme,
            root,
        };
    }
}
