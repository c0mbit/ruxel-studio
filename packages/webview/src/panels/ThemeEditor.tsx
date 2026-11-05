import { FC, useState, useCallback } from "react";
import type { ColorPalette, ColorScheme, ShadowToken, ThemeConfig } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";

interface ThemeEditorProps {
    readonly isOpen: boolean;
    readonly onClose: () => void;
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

type PaletteKey = keyof ColorPalette;

interface TokenFieldConfig {
    readonly key: PaletteKey;
    readonly label: string;
    readonly category: "Brand" | "Surface" | "Feedback";
}

const TOKEN_FIELDS: readonly TokenFieldConfig[] = [
    { key: "primary", label: "Primary", category: "Brand" },
    { key: "on_primary", label: "On Primary", category: "Brand" },
    { key: "primary_container", label: "Primary Container", category: "Brand" },
    { key: "on_primary_container", label: "On Primary Container", category: "Brand" },
    { key: "secondary", label: "Secondary", category: "Brand" },
    { key: "on_secondary", label: "On Secondary", category: "Brand" },
    { key: "secondary_container", label: "Secondary Container", category: "Brand" },
    { key: "on_secondary_container", label: "On Secondary Container", category: "Brand" },
    { key: "tertiary", label: "Tertiary", category: "Brand" },
    { key: "on_tertiary", label: "On Tertiary", category: "Brand" },
    { key: "surface", label: "Surface", category: "Surface" },
    { key: "on_surface", label: "On Surface", category: "Surface" },
    { key: "surface_variant", label: "Surface Variant", category: "Surface" },
    { key: "on_surface_variant", label: "On Surface Variant", category: "Surface" },
    { key: "background", label: "Background", category: "Surface" },
    { key: "on_background", label: "On Background", category: "Surface" },
    { key: "outline", label: "Outline", category: "Surface" },
    { key: "outline_variant", label: "Outline Variant", category: "Surface" },
    { key: "error", label: "Error", category: "Feedback" },
    { key: "on_error", label: "On Error", category: "Feedback" },
    { key: "error_container", label: "Error Container", category: "Feedback" },
    { key: "on_error_container", label: "On Error Container", category: "Feedback" },
];

export const ThemeEditor: FC<ThemeEditorProps> = ({
    isOpen,
    onClose,
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const { executeDocumentMutation } = useDocumentMutation(onDocumentChange);

    const [activeEditMode, setActiveEditMode] = useState<"light" | "dark">("light");
    const [selectedCategory, setSelectedCategory] = useState<"Brand" | "Surface" | "Feedback" | "All">("All");

    const currentScheme = document?.theme.active_scheme ?? "light";
    const themeConfig: ThemeConfig | undefined = document?.theme;

    const handleToggleScheme = useCallback(
        (targetScheme: ColorScheme) => {
            executeDocumentMutation(`Switch active scheme to ${targetScheme}`, (doc) => ({
                ...doc,
                theme: {
                    ...doc.theme,
                    active_scheme: targetScheme,
                },
            }));
        },
        [executeDocumentMutation]
    );

    const handleColorChange = useCallback(
        (tokenKey: PaletteKey, value: string) => {
            executeDocumentMutation(`Update ${tokenKey} in ${activeEditMode} theme`, (doc) => {
                const targetPalette = {
                    ...doc.theme.color_palettes[activeEditMode],
                    [tokenKey]: value,
                };

                return {
                    ...doc,
                    theme: {
                        ...doc.theme,
                        color_palettes: {
                            ...doc.theme.color_palettes,
                            [activeEditMode]: targetPalette,
                        },
                    },
                };
            });
        },
        [activeEditMode, executeDocumentMutation]
    );

    const handleRadiusChange = useCallback(
        (radiusKey: keyof ThemeConfig["border_radii"], value: number) => {
            executeDocumentMutation(`Update shape border radius: ${radiusKey}`, (doc) => ({
                ...doc,
                theme: {
                    ...doc.theme,
                    border_radii: {
                        ...doc.theme.border_radii,
                        [radiusKey]: value,
                    },
                },
            }));
        },
        [executeDocumentMutation]
    );

    const handleApplyPreset = useCallback(
        (presetName: "cyberpunk" | "minimal" | "nordic") => {
            executeDocumentMutation(`Apply theme preset: ${presetName}`, (doc) => {
                let lightPalette = { ...doc.theme.color_palettes.light };
                let darkPalette = { ...doc.theme.color_palettes.dark };

                if (presetName === "cyberpunk") {
                    darkPalette = {
                        ...darkPalette,
                        primary: "#06b6d4",
                        on_primary: "#082f49",
                        secondary: "#f43f5e",
                        on_secondary: "#4c0519",
                        tertiary: "#a855f7",
                        surface: "#0f172a",
                        on_surface: "#f8fafc",
                        background: "#020617",
                        on_background: "#f1f5f9",
                        outline: "#334155",
                    };
                } else if (presetName === "minimal") {
                    lightPalette = {
                        ...lightPalette,
                        primary: "#18181b",
                        on_primary: "#ffffff",
                        secondary: "#71717a",
                        on_secondary: "#ffffff",
                        surface: "#ffffff",
                        background: "#f4f4f5",
                        outline: "#e4e4e7",
                    };
                    darkPalette = {
                        ...darkPalette,
                        primary: "#fafafa",
                        on_primary: "#18181b",
                        secondary: "#a1a1aa",
                        on_secondary: "#18181b",
                        surface: "#18181b",
                        background: "#09090b",
                        outline: "#27272a",
                    };
                } else if (presetName === "nordic") {
                    darkPalette = {
                        ...darkPalette,
                        primary: "#38bdf8",
                        on_primary: "#0c4a6e",
                        secondary: "#818cf8",
                        surface: "#1e293b",
                        background: "#0f172a",
                        outline: "#334155",
                    };
                }

                return {
                    ...doc,
                    theme: {
                        ...doc.theme,
                        color_palettes: {
                            light: lightPalette,
                            dark: darkPalette,
                        },
                    },
                };
            });
        },
        [executeDocumentMutation]
    );

    if (!isOpen || !themeConfig) {
        return null;
    }

    const currentEditingPalette = themeConfig.color_palettes[activeEditMode];
    const filteredTokens = TOKEN_FIELDS.filter(
        (t) => selectedCategory === "All" || t.category === selectedCategory
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-[840px] max-h-[85vh] bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-sans animate-in fade-in zoom-in-95 duration-150">
                <header className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">🎨</span>
                        <div>
                            <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                                Design System Builder
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-300 font-mono">
                                    Global Theme
                                </span>
                            </h2>
                            <p className="text-[11px] text-zinc-400 mt-0.5">
                                Configure Light/Dark tokens, elevation shadows, and shape radii.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                            <span className="text-[11px] text-zinc-400 px-2 font-medium">Canvas Preview:</span>
                            <button
                                type="button"
                                onClick={() => handleToggleScheme("light")}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                                    currentScheme === "light"
                                        ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                ☀️ Light
                            </button>
                            <button
                                type="button"
                                onClick={() => handleToggleScheme("dark")}
                                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                                    currentScheme === "dark"
                                        ? "bg-blue-600/30 text-blue-300 border border-blue-500/50 shadow-sm"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                🌙 Dark
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors ml-2"
                        >
                            ✕
                        </button>
                    </div>
                </header>

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 flex flex-col p-5 overflow-y-auto space-y-5 border-r border-zinc-800/80">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-zinc-300">Editing Palette:</span>
                                <div className="inline-flex rounded bg-zinc-950 p-0.5 border border-zinc-800">
                                    <button
                                        type="button"
                                        onClick={() => setActiveEditMode("light")}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                                            activeEditMode === "light"
                                                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                                                : "text-zinc-400 hover:text-zinc-200"
                                        }`}
                                    >
                                        Light Palette
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveEditMode("dark")}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                                            activeEditMode === "dark"
                                                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                                                : "text-zinc-400 hover:text-zinc-200"
                                        }`}
                                    >
                                        Dark Palette
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                                {(["All", "Brand", "Surface", "Feedback"] as const).map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                                            selectedCategory === cat
                                                ? "bg-blue-600 text-white font-medium"
                                                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {filteredTokens.map((token) => {
                                const currentColor = currentEditingPalette[token.key];
                                return (
                                    <div
                                        key={token.key}
                                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 hover:border-zinc-700 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div
                                                className="w-6 h-6 rounded-md border border-zinc-700/80 shadow-sm shrink-0"
                                                style={{ backgroundColor: currentColor }}
                                            />
                                            <div className="truncate">
                                                <div className="text-[11px] font-medium text-zinc-200 truncate">
                                                    {token.label}
                                                </div>
                                                <div className="text-[9px] font-mono text-zinc-500 truncate">
                                                    {token.key}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <input
                                                type="color"
                                                value={currentColor}
                                                onChange={(e) => handleColorChange(token.key, e.target.value)}
                                                className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={currentColor}
                                                onChange={(e) => handleColorChange(token.key, e.target.value)}
                                                className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded font-mono text-[11px] text-zinc-200 outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="w-[280px] p-5 flex flex-col justify-between space-y-6 bg-zinc-950/40 shrink-0 overflow-y-auto">
                        <div className="space-y-4">
                            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                                Shape & Radii
                            </h3>

                            <div className="space-y-3">
                                {(
                                    [
                                        { key: "sm", label: "Small (sm)", max: 12 },
                                        { key: "md", label: "Medium (md)", max: 24 },
                                        { key: "lg", label: "Large (lg)", max: 32 },
                                        { key: "xl", label: "Extra Large (xl)", max: 48 },
                                    ] as const
                                ).map((r) => {
                                    const val = themeConfig.border_radii[r.key];
                                    return (
                                        <div key={r.key} className="space-y-1">
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-zinc-400">{r.label}</span>
                                                <span className="font-mono text-zinc-200">{val}px</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={r.max}
                                                value={val}
                                                onChange={(e) => handleRadiusChange(r.key, parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2.5 pt-4 border-t border-zinc-800">
                            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                                One-Click Presets
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset("minimal")}
                                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-left text-[11px] font-medium flex items-center justify-between"
                                >
                                    <span>Slate Minimal</span>
                                    <span className="text-zinc-500">B&W Clean</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset("cyberpunk")}
                                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-left text-[11px] font-medium flex items-center justify-between"
                                >
                                    <span>Cyberpunk Neon</span>
                                    <span className="text-cyan-400">Cyan / Pink</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleApplyPreset("nordic")}
                                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-left text-[11px] font-medium flex items-center justify-between"
                                >
                                    <span>Nordic Frost</span>
                                    <span className="text-sky-400">Deep Blue</span>
                                </button>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors shadow-md"
                            >
                                Done & Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

