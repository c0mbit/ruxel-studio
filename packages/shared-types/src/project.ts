export interface ProjectScreen {
    readonly id: string;
    readonly name: string;
    readonly file_path: string;
    readonly is_initial?: boolean;
    readonly route_path?: string;
}

export interface RuxProject {
    readonly name: string;
    readonly version: string;
    readonly default_screen: string;
    readonly screens: readonly ProjectScreen[];
    readonly routes: Record<string, string>;
}

