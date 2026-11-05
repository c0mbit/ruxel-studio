export type TargetFramework = "iced" | "egui" | "slint" | "dioxus" | "fyne" | "flet";

export interface ProjectMetadata {
    readonly schema_version: string;
    readonly app_name: string;
    readonly app_version: string;
    readonly target_frameworks: readonly TargetFramework[];
    readonly description?: string;
    readonly authors?: readonly string[];
    readonly license?: string;
    readonly created_at?: string;
    readonly updated_at?: string;
}
