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
            type: rootWidgetType,
            properties: rootProps,
            props: rootProps,
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
            type: root.widget_type,
            props: root.properties,
            children: root.children,
        };
    } catch {
        return null;
    }
}
