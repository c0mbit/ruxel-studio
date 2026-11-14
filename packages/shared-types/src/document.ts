import type { ProjectMetadata } from "./metadata";
import type { WindowConfig } from "./window";
import type { AssetRegistry } from "./asset";
import { type ThemeConfig, createDefaultTheme } from "./theme";
import type { WidgetLayout } from "./layout";
import type {
    AnimationDefinition,
    WidgetBindings,
    WidgetEvents,
    WidgetNode,
    WidgetProperties,
    WidgetType,
} from "./widget";

export interface I18nConfig {
    readonly default_locale: string;
    readonly locales: Record<string, Record<string, string>>;
}

export interface ComponentDefinition {
    readonly name: string;
    readonly root: WidgetNode;
    readonly file_path?: string;
}

export interface RuxDocument {
    readonly $schema?: string;
    readonly schema_version?: string;
    readonly version?: string;
    readonly metadata: ProjectMetadata;
    readonly window: WindowConfig;
    readonly assets: AssetRegistry;
    readonly i18n?: I18nConfig;
    readonly theme: ThemeConfig;
    readonly root: WidgetNode;
    readonly components?: Readonly<Record<string, ComponentDefinition>>;
    readonly type?: WidgetType;
    readonly props?: WidgetProperties;
    readonly children?: readonly WidgetNode[];
}

export function parseRuxDocument(rawJson: string): RuxDocument | null {
    try {
        const raw = JSON.parse(rawJson);
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const record = raw as Record<string, unknown>;
        const rawMeta =
            record.metadata && typeof record.metadata === "object"
                ? (record.metadata as Record<string, unknown>)
                : {};
        const schemaVersion = (record.schema_version ??
            rawMeta.schema_version ??
            "1.0.0") as string;
        const appName = (rawMeta.app_name ?? rawMeta.name ?? "RuxelApp") as string;
        const appVersion = (record.version ??
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
            record.window && typeof record.window === "object"
                ? (record.window as WindowConfig)
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
            record.assets && typeof record.assets === "object"
                ? (record.assets as AssetRegistry)
                : { fonts: [], icons: [], images: [] };

        const theme =
            record.theme && typeof record.theme === "object"
                ? (record.theme as ThemeConfig)
                : createDefaultTheme();

        const rawRoot = (
            record.root && typeof record.root === "object" ? record.root : record
        ) as Record<string, unknown>;
        const rootWidgetType = (rawRoot.widget_type ??
            rawRoot.type ??
            "v_box") as WidgetType;
        const rootProps = (rawRoot.properties ??
            rawRoot.props ??
            {}) as WidgetProperties;
        const rootChildren = Array.isArray(rawRoot.children)
            ? (rawRoot.children as readonly WidgetNode[])
            : [];

        const root: WidgetNode = {
            id: typeof rawRoot.id === "string" ? rawRoot.id : "root",
            widget_type: rootWidgetType,
            properties: rootProps,
            ...(rawRoot.layout && typeof rawRoot.layout === "object"
                ? { layout: rawRoot.layout as WidgetLayout }
                : {}),
            ...(rawRoot.events && typeof rawRoot.events === "object"
                ? { events: rawRoot.events as WidgetEvents }
                : {}),
            ...(rawRoot.bindings && typeof rawRoot.bindings === "object"
                ? { bindings: rawRoot.bindings as WidgetBindings }
                : {}),
            ...(Array.isArray(rawRoot.animations)
                ? { animations: rawRoot.animations as readonly AnimationDefinition[] }
                : {}),
            ...(typeof rawRoot.slot === "string" ? { slot: rawRoot.slot } : {}),
            children: rootChildren,
        };

        return {
            $schema:
                typeof record.$schema === "string" ? record.$schema : undefined,
            schema_version: schemaVersion,
            version: appVersion,
            metadata,
            window,
            assets,
            theme,
            ...(record.components && typeof record.components === "object"
                ? { components: record.components as Record<string, ComponentDefinition> }
                : {}),
            ...(record.i18n && typeof record.i18n === "object"
                ? { i18n: record.i18n as I18nConfig }
                : {}),
            root,
        };
    } catch {
        return null;
    }
}

export function createDefaultStarterDocument(fileName?: string): RuxDocument {
    const rawName = fileName
        ? fileName.replace(/^.*[\\/]/, "").replace(/\.rux$/, "")
        : "RuxelApp";
    const appName = rawName.replace(/[^a-zA-Z0-9_]/g, "") || "RuxelApp";

    return {
        $schema: "https://ruxel.dev/schemas/rux-document.schema.json",
        schema_version: "1.0.0",
        version: "0.1.0",
        metadata: {
            schema_version: "1.0.0",
            app_name: appName,
            app_version: "0.1.0",
            target_frameworks: ["iced", "egui", "slint", "dioxus", "fyne", "flet"],
            description: "Starter UI document created with Ruxel Studio",
            authors: ["Developer"],
            license: "MIT",
        },
        window: {
            title: `${appName} — Ruxel Studio`,
            initial_width: 800,
            initial_height: 600,
            resizable: true,
            scale_mode: "logical",
            transparent: false,
            decorations: true,
            always_on_top: false,
            fullscreen: false,
        },
        assets: {
            fonts: [],
            icons: [],
            images: [],
        },
        theme: createDefaultTheme(),
        root: {
            id: "root",
            widget_type: "v_box",
            properties: {
                background_color: "#09090b",
            },
            layout: {
                container: {
                    type: "flex",
                    direction: "column",
                    align_items: "center",
                    justify_content: "center",
                    gap: 16,
                },
                spacing: {
                    padding: { top: 24, bottom: 24, left: 24, right: 24 },
                },
            },
            events: {},
            bindings: {},
            animations: [],
            children: [
                {
                    id: "welcome_title",
                    widget_type: "label",
                    properties: {
                        text: "Welcome to Ruxel Studio",
                        font_size: 24,
                        font_weight: "bold",
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                },
                {
                    id: "welcome_subtitle",
                    widget_type: "label",
                    properties: {
                        text: "Drag widgets from the palette or start designing",
                        font_size: 14,
                    },
                    events: {},
                    bindings: {},
                    animations: [],
                    children: [],
                },
                {
                    id: "action_button",
                    widget_type: "button",
                    properties: {
                        text: "Get Started",
                    },
                    events: {
                        on_click: {
                            handler_name: "on_get_started_click",
                        },
                    },
                    bindings: {},
                    animations: [],
                    children: [],
                },
            ],
        },
    };
}

export function cleanWidgetNodeForSerialization(
    node: WidgetNode | Record<string, unknown>
): WidgetNode {
    const raw = { ...node } as Record<string, unknown>;
    const widgetType = (raw.widget_type ?? raw.type ?? "v_box") as WidgetType;
    const properties = (raw.properties ?? raw.props ?? {}) as WidgetProperties;

    delete raw.type;
    delete raw.props;

    const cleaned: WidgetNode = {
        id: typeof raw.id === "string" ? raw.id : "root",
        widget_type: widgetType,
        ...(typeof raw.slot === "string" ? { slot: raw.slot } : {}),
        properties,
        ...(raw.layout && typeof raw.layout === "object"
            ? { layout: raw.layout as WidgetNode["layout"] }
            : {}),
        ...(raw.events && typeof raw.events === "object"
            ? { events: raw.events as WidgetNode["events"] }
            : {}),
        ...(raw.bindings && typeof raw.bindings === "object"
            ? { bindings: raw.bindings as WidgetNode["bindings"] }
            : {}),
        ...(Array.isArray(raw.animations)
            ? { animations: raw.animations as WidgetNode["animations"] }
            : {}),
        ...(Array.isArray(raw.children)
            ? {
                  children: (raw.children as (WidgetNode | Record<string, unknown>)[]).map(
                      (c) => cleanWidgetNodeForSerialization(c)
                  ),
              }
            : {}),
    };

    return cleaned;
}

export function cleanDocumentForSerialization(
    doc: RuxDocument | Record<string, unknown>
): RuxDocument {
    const raw = { ...doc } as Record<string, unknown>;
    delete raw.type;
    delete raw.props;
    delete raw.children;

    const rawMeta = (
        raw.metadata && typeof raw.metadata === "object"
            ? raw.metadata
            : {}
    ) as Record<string, unknown>;
    const appName = String(rawMeta.app_name ?? rawMeta.name ?? "RuxelApp");
    const appVersion = String(
        raw.version ?? rawMeta.app_version ?? rawMeta.version ?? "0.1.0"
    );
    const schemaVersion = String(
        raw.schema_version ?? rawMeta.schema_version ?? "1.0.0"
    );
    const authors = Array.isArray(rawMeta.authors)
        ? (rawMeta.authors as readonly string[])
        : rawMeta.author
          ? [String(rawMeta.author)]
          : [];

    const metadata: ProjectMetadata = {
        schema_version: schemaVersion,
        app_name: appName,
        app_version: appVersion,
        target_frameworks: (Array.isArray(rawMeta.target_frameworks)
            ? rawMeta.target_frameworks
            : ["iced"]) as readonly (
            | "iced"
            | "egui"
            | "slint"
            | "dioxus"
            | "fyne"
            | "flet"
        )[],
        ...(rawMeta.description ? { description: String(rawMeta.description) } : {}),
        ...(authors.length > 0 ? { authors } : {}),
        ...(rawMeta.license ? { license: String(rawMeta.license) } : {}),
        ...(rawMeta.created_at ? { created_at: String(rawMeta.created_at) } : {}),
        ...(rawMeta.updated_at ? { updated_at: String(rawMeta.updated_at) } : {}),
    };

    const rootNode =
        raw.root && typeof raw.root === "object"
            ? (raw.root as WidgetNode)
            : ({
                  id: "root",
                  widget_type: "v_box",
                  properties: {},
                  children: [],
              } as WidgetNode);

    const cleaned: RuxDocument = {
        ...(typeof raw.$schema === "string" ? { $schema: raw.$schema } : {}),
        schema_version: schemaVersion,
        version: appVersion,
        metadata,
        window: (raw.window && typeof raw.window === "object"
            ? raw.window
            : {}) as WindowConfig,
        assets: (raw.assets && typeof raw.assets === "object"
            ? raw.assets
            : { fonts: [], icons: [], images: [] }) as AssetRegistry,
        ...(raw.i18n && typeof raw.i18n === "object"
            ? { i18n: raw.i18n as I18nConfig }
            : {}),
        theme: (raw.theme && typeof raw.theme === "object"
            ? raw.theme
            : {}) as ThemeConfig,
        root: cleanWidgetNodeForSerialization(rootNode),
        ...(raw.components && typeof raw.components === "object"
            ? {
                  components: Object.fromEntries(
                      Object.entries(
                          raw.components as Record<string, ComponentDefinition>
                      ).map(([k, comp]) => [
                          k,
                          {
                              name: comp.name || k,
                              root: cleanWidgetNodeForSerialization(comp.root),
                              ...(comp.file_path ? { file_path: comp.file_path } : {}),
                          },
                      ])
                  ),
              }
            : {}),
    };

    return cleaned;
}

export function serializeRuxDocument(
    doc: RuxDocument | Record<string, unknown>
): string {
    const cleaned = cleanDocumentForSerialization(doc);
    return JSON.stringify(cleaned, null, 2);
}
