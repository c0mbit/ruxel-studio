import { FC, useState, useMemo } from "react";
import type { RuxDocument } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";

interface FigmaImportModalProps {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onImport: (token: string, fileKeyOrUrl: string, nodeId?: string) => void;
}

export const FigmaImportModal: FC<FigmaImportModalProps> = ({
    isOpen,
    onClose,
    onImport,
}) => {
    const isImporting = useEditorStore((state) => state.isImportingFigma);
    const progress = useEditorStore((state) => state.figmaImportProgress);
    const applyImportedFigmaDocument = useEditorStore(
        (state) => state.applyImportedFigmaDocument
    );

    const [figmaToken, setFigmaToken] = useState<string>("");
    const [figmaUrl, setFigmaUrl] = useState<string>("");
    const [showToken, setShowToken] = useState<boolean>(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const parsedInfo = useMemo(() => {
        const clean = figmaUrl.trim();
        if (!clean) {
            return null;
        }

        let fileKey: string | null = null;
        let nodeId: string | null = null;

        if (clean.includes("figma.com")) {
            const parts = clean.split("?");
            const pathParts = parts[0].split("/").filter(Boolean);
            for (let i = 0; i < pathParts.length; i++) {
                if (
                    (pathParts[i] === "file" || pathParts[i] === "design" || pathParts[i] === "proto") &&
                    i + 1 < pathParts.length
                ) {
                    fileKey = pathParts[i + 1];
                    break;
                }
            }

            if (parts[1]) {
                const params = new URLSearchParams(parts[1]);
                const rawNode = params.get("node-id") ?? params.get("node_id");
                if (rawNode) {
                    nodeId = rawNode.replace("-", ":");
                }
            }
        } else if (!clean.includes("/") && !clean.includes("?")) {
            fileKey = clean;
        }

        return { fileKey, nodeId };
    }, [figmaUrl]);

    const handleSubmit = () => {
        setLocalError(null);
        if (!figmaToken.trim()) {
            setLocalError("Please enter your Figma Personal Access Token");
            return;
        }
        if (!figmaUrl.trim()) {
            setLocalError("Please enter a Figma file URL, design URL, or file key");
            return;
        }

        onImport(figmaToken.trim(), figmaUrl.trim(), parsedInfo?.nodeId ?? undefined);
    };

    const handleLoadDemo = () => {
        const demoDoc: RuxDocument = {
            $schema: "https://ruxel.dev/schemas/rux-document.schema.json",
            schema_version: "1.0.0",
            version: "0.1.0",
            metadata: {
                schema_version: "1.0.0",
                app_name: "FigmaImportedDashboard",
                name: "FigmaImportedDashboard",
                app_version: "0.1.0",
                version: "0.1.0",
                target_frameworks: ["iced", "egui", "slint", "dioxus", "fyne", "flet"],
                description: "Figma frame converted to native AST",
                authors: ["Figma Design"],
                license: "MIT",
            },
            window: {
                title: "Figma Converted Frame",
                initial_width: 960,
                initial_height: 640,
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
                        primary: "#4f46e5",
                        on_primary: "#ffffff",
                        primary_container: "#e0e7ff",
                        on_primary_container: "#1e1b4b",
                        secondary: "#06b6d4",
                        on_secondary: "#ffffff",
                        secondary_container: "#cffafe",
                        on_secondary_container: "#164e63",
                        tertiary: "#ec4899",
                        on_tertiary: "#ffffff",
                        tertiary_container: "#fce7f3",
                        on_tertiary_container: "#831843",
                        error: "#ef4444",
                        on_error: "#ffffff",
                        error_container: "#fee2e2",
                        on_error_container: "#7f1d1d",
                        surface: "#f8fafc",
                        on_surface: "#0f172a",
                        surface_variant: "#e2e8f0",
                        on_surface_variant: "#334155",
                        outline: "#cbd5e1",
                        outline_variant: "#94a3b8",
                        background: "#ffffff",
                        on_background: "#0f172a",
                        inverse_surface: "#1e293b",
                        inverse_on_surface: "#f8fafc",
                        inverse_primary: "#818cf8",
                        scrim: "#000000",
                        shadow: "#000000",
                    },
                    dark: {
                        primary: "#818cf8",
                        on_primary: "#1e1b4b",
                        primary_container: "#3730a3",
                        on_primary_container: "#e0e7ff",
                        secondary: "#22d3ee",
                        on_secondary: "#164e63",
                        secondary_container: "#155e75",
                        on_secondary_container: "#cffafe",
                        tertiary: "#f472b6",
                        on_tertiary: "#831843",
                        tertiary_container: "#9d174d",
                        on_tertiary_container: "#fce7f3",
                        error: "#f87171",
                        on_error: "#7f1d1d",
                        error_container: "#991b1b",
                        on_error_container: "#fee2e2",
                        surface: "#0f172a",
                        on_surface: "#f8fafc",
                        surface_variant: "#1e293b",
                        on_surface_variant: "#94a3b8",
                        outline: "#334155",
                        outline_variant: "#475569",
                        background: "#020617",
                        on_background: "#f8fafc",
                        inverse_surface: "#f8fafc",
                        inverse_on_surface: "#0f172a",
                        inverse_primary: "#4f46e5",
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
                id: "figma_frame_root",
                widget_type: "v_box",
                properties: {
                    background_color: "#18181b",
                },
                layout: {
                    container: {
                        type: "flex",
                        direction: "column",
                        align_items: "stretch",
                        gap: 16,
                    },
                },
                events: {},
                bindings: {},
                animations: [],
                children: [
                    {
                        id: "nav_bar",
                        widget_type: "h_box",
                        properties: {
                            background_color: "#27272a",
                        },
                        layout: {
                            container: {
                                type: "flex",
                                direction: "row",
                                align_items: "center",
                                justify_content: "space_between",
                                gap: 12,
                            },
                        },
                        events: {},
                        bindings: {},
                        animations: [],
                        children: [
                            {
                                id: "brand_title",
                                widget_type: "label",
                                properties: {
                                    text: "Figma Auto-Layout Frame",
                                    font_size: 20,
                                    font_weight: "bold",
                                },
                                events: {},
                                bindings: {},
                                animations: [],
                                children: [],
                            },
                            {
                                id: "action_nav_button",
                                widget_type: "button",
                                properties: {
                                    text: "Design Action",
                                },
                                events: {
                                    on_click: {
                                        handler_name: "on_nav_action",
                                    },
                                },
                                bindings: {},
                                animations: [],
                                children: [],
                            },
                        ],
                    },
                    {
                        id: "content_card",
                        widget_type: "v_box",
                        properties: {
                            background_color: "#27272a",
                        },
                        layout: {
                            container: {
                                type: "flex",
                                direction: "column",
                                gap: 12,
                            },
                        },
                        events: {},
                        bindings: {},
                        animations: [],
                        children: [
                            {
                                id: "card_heading",
                                widget_type: "label",
                                properties: {
                                    text: "Converted Card Component",
                                    font_size: 16,
                                },
                                events: {},
                                bindings: {},
                                animations: [],
                                children: [],
                            },
                            {
                                id: "card_input",
                                widget_type: "text_input",
                                properties: {
                                    placeholder: "Enter project notes...",
                                },
                                events: {},
                                bindings: {},
                                animations: [],
                                children: [],
                            },
                        ],
                    },
                ],
            },
        };
        applyImportedFigmaDocument(demoDoc);
        onClose();
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md text-sm">
                            F
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-zinc-100">Import from Figma</h2>
                            <p className="text-xs text-zinc-400">
                                Translate Figma Frame Auto-Layout & Styles to Native Rust AST
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isImporting}
                        className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {localError && (
                        <div className="p-3 text-xs bg-red-950/50 border border-red-800/80 rounded-lg text-red-300 flex items-center gap-2">
                            <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{localError}</span>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-zinc-300">
                            Personal Access Token (PAT)
                        </label>
                        <div className="relative">
                            <input
                                type={showToken ? "text" : "password"}
                                value={figmaToken}
                                onChange={(e) => setFigmaToken(e.target.value)}
                                disabled={isImporting}
                                placeholder="figd_..."
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-50 pr-10 font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                disabled={isImporting}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs p-1"
                            >
                                {showToken ? "Hide" : "Show"}
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                            Generate in Figma &rarr; Settings &rarr; Security &rarr; Personal Access Tokens
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-zinc-300">
                            Figma Frame URL or File Key
                        </label>
                        <input
                            type="text"
                            value={figmaUrl}
                            onChange={(e) => setFigmaUrl(e.target.value)}
                            disabled={isImporting}
                            placeholder="https://www.figma.com/design/KEY/Project?node-id=1-2"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-50 font-mono"
                        />
                        {parsedInfo?.fileKey && (
                            <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                                <span className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 font-mono">
                                    Key: {parsedInfo.fileKey}
                                </span>
                                {parsedInfo.nodeId && (
                                    <span className="bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-2 py-0.5 rounded font-mono">
                                        Node: {parsedInfo.nodeId}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {isImporting && (
                        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-300 font-medium flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                                    {progress?.step ?? "Processing..."}
                                </span>
                                <span className="text-zinc-400 font-mono">
                                    {progress?.progress ?? 20}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-rose-500 via-indigo-500 to-emerald-500 transition-all duration-300"
                                    style={{ width: `${progress?.progress ?? 20}%` }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 pt-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-emerald-400">&bull;</span> Auto-Layout Geometry
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-emerald-400">&bull;</span> Heuristic Classifier
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-emerald-400">&bull;</span> SVG & Font Assets
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-emerald-400">&bull;</span> Design Token Mapping
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
                    <button
                        type="button"
                        onClick={handleLoadDemo}
                        disabled={isImporting}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition disabled:opacity-50"
                    >
                        Load Demo Figma Frame (Offline)
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isImporting}
                            className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isImporting || !figmaToken.trim() || !figmaUrl.trim()}
                            className="px-5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-40 disabled:hover:bg-indigo-600 flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            {isImporting ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Importing...
                                </>
                            ) : (
                                "Import Frame"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
