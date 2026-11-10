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
export const CRDT_ORIGIN_INIT = "crdt-init";

export function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return typeof window !== "undefined" && window.btoa
        ? window.btoa(binary)
        : Buffer.from(bytes).toString("base64");
}

export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = typeof window !== "undefined" && window.atob
        ? window.atob(base64)
        : Buffer.from(base64, "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function populateWidgetNodeToYMap(
    node: WidgetNode,
    targetMap: Y.Map<unknown>
): void {
    targetMap.set("id", node.id);
    targetMap.set("widget_type", node.widget_type);
    if (node.slot) {
        targetMap.set("slot", node.slot);
    } else {
        targetMap.delete("slot");
    }

    const propMap = new Y.Map<unknown>();
    targetMap.set("properties", propMap);
    if (node.properties) {
        for (const [key, value] of Object.entries(node.properties)) {
            propMap.set(key, value);
        }
    }

    const layoutMap = new Y.Map<unknown>();
    targetMap.set("layout", layoutMap);
    if (node.layout) {
        for (const [key, value] of Object.entries(node.layout)) {
            layoutMap.set(key, value);
        }
    }

    const eventMap = new Y.Map<unknown>();
    targetMap.set("events", eventMap);
    if (node.events) {
        for (const [key, value] of Object.entries(node.events)) {
            eventMap.set(key, value);
        }
    }

    const bindingsMap = new Y.Map<unknown>();
    targetMap.set("bindings", bindingsMap);
    if (node.bindings) {
        for (const [key, value] of Object.entries(node.bindings)) {
            bindingsMap.set(key, value);
        }
    }

    const animArray = new Y.Array<unknown>();
    targetMap.set("animations", animArray);
    if (node.animations && node.animations.length > 0) {
        animArray.push([...node.animations]);
    }

    const childrenArray = new Y.Array<Y.Map<unknown>>();
    targetMap.set("children", childrenArray);
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const childMap = new Y.Map<unknown>();
            childrenArray.push([childMap]);
            populateWidgetNodeToYMap(child, childMap);
        }
    }
}

export function widgetNodeToYMap(node: WidgetNode): Y.Map<unknown> {
    const map = new Y.Map<unknown>();
    populateWidgetNodeToYMap(node, map);
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

export function reconcileChildrenArray(
    incomingChildren: readonly WidgetNode[],
    childArray: Y.Array<Y.Map<unknown>>
): void {
    const existing: { id: string; map: Y.Map<unknown> }[] = [];
    for (let i = 0; i < childArray.length; i++) {
        const item = childArray.get(i);
        if (item instanceof Y.Map) {
            existing.push({ id: item.get("id") as string, map: item });
        }
    }
    const incomingIds = new Set(incomingChildren.map((c) => c.id));

    // 1. Remove deleted items in reverse order to maintain index stability
    for (let i = existing.length - 1; i >= 0; i--) {
        if (!incomingIds.has(existing[i].id)) {
            childArray.delete(i, 1);
        }
    }

    // 2. Align childArray to incomingChildren sequence
    for (let i = 0; i < incomingChildren.length; i++) {
        const inc = incomingChildren[i];
        const currentItem = i < childArray.length ? childArray.get(i) : null;
        const currentId = currentItem instanceof Y.Map ? currentItem.get("id") : null;

        if (currentId === inc.id) {
            reconcileWidgetNodeToYMap(inc, currentItem as Y.Map<unknown>);
        } else {
            // Check if inc.id exists further down
            let foundIdx = -1;
            for (let j = i + 1; j < childArray.length; j++) {
                const cand = childArray.get(j);
                if (cand instanceof Y.Map && cand.get("id") === inc.id) {
                    foundIdx = j;
                    break;
                }
            }
            if (foundIdx !== -1) {
                childArray.delete(foundIdx, 1);
                const newMap = new Y.Map<unknown>();
                populateWidgetNodeToYMap(inc, newMap);
                childArray.insert(i, [newMap]);
            } else {
                const newMap = new Y.Map<unknown>();
                populateWidgetNodeToYMap(inc, newMap);
                childArray.insert(i, [newMap]);
            }
        }
    }

    // 3. Trim any trailing excess
    if (childArray.length > incomingChildren.length) {
        childArray.delete(incomingChildren.length, childArray.length - incomingChildren.length);
    }
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
    reconcileChildrenArray(incomingChildren, childArray);
}

export interface CrdtBridgeOptions {
    readonly ydoc?: Y.Doc;
    readonly trackedOrigins?: Set<unknown>;
    readonly captureTimeout?: number;
}

export class CrdtDocumentBridge {
    private readonly ydoc: Y.Doc;
    private readonly undoManager: Y.UndoManager;
    private onRemoteUpdateCallback: ((doc: RuxDocument) => void) | null = null;
    private isApplyingLocal = false;
    private readonly localDeltaListeners = new Set<(delta: Uint8Array, stateVector: Uint8Array) => void>();

    constructor(ydocOrOptions?: Y.Doc | CrdtBridgeOptions) {
        let doc: Y.Doc;
        let trackedOrigins: Set<unknown> | undefined;
        let captureTimeout = 300;

        if (ydocOrOptions instanceof Y.Doc) {
            doc = ydocOrOptions;
        } else if (ydocOrOptions && typeof ydocOrOptions === "object") {
            doc = ydocOrOptions.ydoc ?? new Y.Doc();
            trackedOrigins = ydocOrOptions.trackedOrigins;
            if (ydocOrOptions.captureTimeout !== undefined) {
                captureTimeout = ydocOrOptions.captureTimeout;
            }
        } else {
            doc = new Y.Doc();
        }

        this.ydoc = doc;

        const rootMap = this.ydoc.getMap<unknown>("root");
        const compMap = this.ydoc.getMap<unknown>("components");
        const themeMap = this.ydoc.getMap<unknown>("theme");
        const metaMap = this.ydoc.getMap<unknown>("meta");

        this.undoManager = new Y.UndoManager([rootMap, compMap, themeMap, metaMap], {
            trackedOrigins: trackedOrigins ?? new Set([CRDT_ORIGIN_LOCAL]),
            captureTimeout,
        });

        this.ydoc.on("afterTransaction", (transaction) => {
            if (
                transaction.origin !== CRDT_ORIGIN_LOCAL &&
                transaction.origin !== CRDT_ORIGIN_INIT &&
                !this.isApplyingLocal
            ) {
                const updatedDoc = this.toRuxDocument();
                if (updatedDoc && this.onRemoteUpdateCallback) {
                    this.onRemoteUpdateCallback(updatedDoc);
                }
            }
        });

        this.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
            if (origin !== CRDT_ORIGIN_REMOTE && origin !== CRDT_ORIGIN_INIT) {
                const sv = Y.encodeStateVector(this.ydoc);
                for (const listener of this.localDeltaListeners) {
                    listener(update, sv);
                }
            }
        });
    }

    public getYDoc(): Y.Doc {
        return this.ydoc;
    }

    public getUndoManager(): Y.UndoManager {
        return this.undoManager;
    }

    public onLocalDelta(listener: (delta: Uint8Array, stateVector: Uint8Array) => void): () => void {
        this.localDeltaListeners.add(listener);
        return () => {
            this.localDeltaListeners.delete(listener);
        };
    }

    public setOnRemoteUpdate(callback: (doc: RuxDocument) => void): void {
        this.onRemoteUpdateCallback = callback;
    }

    public syncFromLocalDocument(document: RuxDocument, origin: unknown = CRDT_ORIGIN_LOCAL): void {
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

                const compMap = this.ydoc.getMap<unknown>("components");
                const incomingComps = document.components ?? {};
                const existingCompKeys = new Set<string>();
                compMap.forEach((_, k) => existingCompKeys.add(k));
                for (const [k, v] of Object.entries(incomingComps)) {
                    if (JSON.stringify(compMap.get(k)) !== JSON.stringify(v)) {
                        compMap.set(k, v);
                    }
                    existingCompKeys.delete(k);
                }
                for (const k of existingCompKeys) {
                    compMap.delete(k);
                }

                let rootMap = this.ydoc.getMap<unknown>("root");
                if (!rootMap.get("id")) {
                    populateWidgetNodeToYMap(document.root, rootMap);
                } else {
                    reconcileWidgetNodeToYMap(document.root, rootMap);
                }
            }, origin);
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

        const compMap = this.ydoc.getMap<unknown>("components");
        const componentsJson = compMap.toJSON() as Record<string, any>;
        const components = Object.keys(componentsJson).length > 0 ? componentsJson : undefined;

        return {
            ...($schema ? { $schema } : {}),
            metadata,
            window: windowProps,
            assets,
            theme,
            ...(components ? { components } : {}),
            root,
        };
    }
}

export const sharedCrdtBridge = new CrdtDocumentBridge();
