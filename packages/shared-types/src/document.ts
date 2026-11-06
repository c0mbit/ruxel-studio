import type { ProjectMetadata } from "./metadata";
import type { WindowConfig } from "./window";
import type { AssetRegistry } from "./asset";
import type { ThemeConfig } from "./theme";
import type { WidgetNode, WidgetProperties, WidgetType } from "./widget";

export interface I18nConfig {
    readonly default_locale: string;
    readonly locales: Record<string, Record<string, string>>;
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
                          display_large: {
                              font_family: "system-ui",
                              font_weight: "bold",
                              font_size: 57,
                              line_height: 64,
                              letter_spacing: -0.25,
                          },
                          display_medium: {
                              font_family: "system-ui",
                              font_weight: "bold",
                              font_size: 45,
                              line_height: 52,
                              letter_spacing: 0,
                          },
                          display_small: {
                              font_family: "system-ui",
                              font_weight: "bold",
                              font_size: 36,
                              line_height: 44,
                              letter_spacing: 0,
                          },
                          headline_large: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 32,
                              line_height: 40,
                              letter_spacing: 0,
                          },
                          headline_medium: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 28,
                              line_height: 36,
                              letter_spacing: 0,
                          },
                          headline_small: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 24,
                              line_height: 32,
                              letter_spacing: 0,
                          },
                          title_large: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 22,
                              line_height: 28,
                              letter_spacing: 0,
                          },
                          title_medium: {
                              font_family: "system-ui",
                              font_weight: "medium",
                              font_size: 16,
                              line_height: 24,
                              letter_spacing: 0.15,
                          },
                          title_small: {
                              font_family: "system-ui",
                              font_weight: "medium",
                              font_size: 14,
                              line_height: 20,
                              letter_spacing: 0.1,
                          },
                          body_large: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 16,
                              line_height: 24,
                              letter_spacing: 0.5,
                          },
                          body_medium: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 14,
                              line_height: 20,
                              letter_spacing: 0.25,
                          },
                          body_small: {
                              font_family: "system-ui",
                              font_weight: "normal",
                              font_size: 12,
                              line_height: 16,
                              letter_spacing: 0.4,
                          },
                          label_large: {
                              font_family: "system-ui",
                              font_weight: "medium",
                              font_size: 14,
                              line_height: 20,
                              letter_spacing: 0.1,
                          },
                          label_medium: {
                              font_family: "system-ui",
                              font_weight: "medium",
                              font_size: 12,
                              line_height: 16,
                              letter_spacing: 0.5,
                          },
                          label_small: {
                              font_family: "system-ui",
                              font_weight: "medium",
                              font_size: 11,
                              line_height: 16,
                              letter_spacing: 0.5,
                          },
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
        theme: {
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
        },
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
    };

    return cleaned;
}

export function serializeRuxDocument(
    doc: RuxDocument | Record<string, unknown>
): string {
    const cleaned = cleanDocumentForSerialization(doc);
    return JSON.stringify(cleaned, null, 2);
}
