import type { ProjectMetadata } from "./metadata";
import type { WindowConfig } from "./window";
import type { AssetRegistry } from "./asset";
import type { ThemeConfig } from "./theme";
import type { WidgetNode } from "./widget";

export interface I18nConfig {
    readonly default_locale: string;
    readonly locales: Record<string, Record<string, string>>;
}

export interface RuxDocument {
    readonly $schema?: string;
    readonly metadata: ProjectMetadata;
    readonly window: WindowConfig;
    readonly assets: AssetRegistry;
    readonly i18n?: I18nConfig;
    readonly theme: ThemeConfig;
    readonly root: WidgetNode;
}
