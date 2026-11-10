import { FC, useState, useMemo, useCallback } from "react";
import type { I18nConfig, RuxDocument, WidgetNode } from "@ruxel/shared-types";
import { useEditorStore } from "../state/editorStore";
import { useDocumentMutation } from "../hooks/useDocumentMutation";

interface LocalizationDictionaryProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

export const LocalizationDictionary: FC<LocalizationDictionaryProps> = ({
    onDocumentChange,
}) => {
    const document = useEditorStore((state) => state.document);
    const { executeDocumentMutation } = useDocumentMutation(onDocumentChange);

    const [selectedLocale, setSelectedLocale] = useState<string>("en-US");
    const [searchQuery, setSearchQuery] = useState("");
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [newLocaleCode, setNewLocaleCode] = useState("");
    const [isAddingLocale, setIsAddingLocale] = useState(false);

    const i18n = document?.i18n;
    const defaultLocale = i18n?.default_locale || "en-US";
    const availableLocales = useMemo(() => {
        if (!i18n?.locales) {
            return ["en-US"];
        }
        return Object.keys(i18n.locales);
    }, [i18n]);

    const activeLocale = availableLocales.includes(selectedLocale)
        ? selectedLocale
        : defaultLocale;

    const allKeys = useMemo(() => {
        if (!i18n?.locales) {
            return [];
        }
        const keySet = new Set<string>();
        for (const loc of Object.keys(i18n.locales)) {
            for (const k of Object.keys(i18n.locales[loc] || {})) {
                keySet.add(k);
            }
        }
        return Array.from(keySet).sort();
    }, [i18n]);

    const filteredKeys = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return allKeys;
        }
        return allKeys.filter((k) => {
            const val = i18n?.locales?.[activeLocale]?.[k] || "";
            return k.toLowerCase().includes(query) || val.toLowerCase().includes(query);
        });
    }, [allKeys, searchQuery, i18n, activeLocale]);

    const handleInitialize = useCallback(() => {
        executeDocumentMutation("Initialize i18n configuration", (doc) => ({
            ...doc,
            i18n: {
                default_locale: "en-US",
                locales: {
                    "en-US": {
                        welcome_title: "Welcome to Ruxel Studio",
                        login_action: "Sign In",
                        cancel_action: "Cancel",
                    },
                    "cs-CZ": {
                        welcome_title: "Vítejte v Ruxel Studio",
                        login_action: "Přihlásit se",
                        cancel_action: "Zrušit",
                    },
                },
            },
        }));
    }, [executeDocumentMutation]);

    const handleSetDefaultLocale = useCallback(
        (loc: string) => {
            executeDocumentMutation(`Set default locale to ${loc}`, (doc) => {
                if (!doc.i18n) {
                    return doc;
                }
                return {
                    ...doc,
                    i18n: {
                        ...doc.i18n,
                        default_locale: loc,
                    },
                };
            });
        },
        [executeDocumentMutation]
    );

    const handleAddLocale = useCallback(() => {
        const loc = newLocaleCode.trim();
        if (!loc) {
            return;
        }
        executeDocumentMutation(`Add locale ${loc}`, (doc) => {
            const currentI18n: I18nConfig = doc.i18n ?? {
                default_locale: "en-US",
                locales: { "en-US": {} },
            };
            const nextLocales = { ...currentI18n.locales };
            if (!nextLocales[loc]) {
                nextLocales[loc] = {};
            }
            return {
                ...doc,
                i18n: {
                    ...currentI18n,
                    locales: nextLocales,
                },
            };
        });
        setSelectedLocale(loc);
        setNewLocaleCode("");
        setIsAddingLocale(false);
    }, [newLocaleCode, executeDocumentMutation]);

    const handleUpdateTranslation = useCallback(
        (key: string, value: string) => {
            executeDocumentMutation(
                `Update translation ${key} in ${activeLocale}`,
                (doc) => {
                    if (!doc.i18n) {
                        return doc;
                    }
                    const currentLocales = doc.i18n.locales;
                    const localeMapping = { ...(currentLocales[activeLocale] ?? {}) };
                    localeMapping[key] = value;
                    return {
                        ...doc,
                        i18n: {
                            ...doc.i18n,
                            locales: {
                                ...currentLocales,
                                [activeLocale]: localeMapping,
                            },
                        },
                    };
                }
            );
        },
        [activeLocale, executeDocumentMutation]
    );

    const handleAddKey = useCallback(() => {
        const k = newKey.trim();
        if (!k) {
            return;
        }
        executeDocumentMutation(`Add translation key ${k}`, (doc) => {
            const currentI18n: I18nConfig = doc.i18n ?? {
                default_locale: "en-US",
                locales: { "en-US": {} },
            };
            const nextLocales = { ...currentI18n.locales };
            for (const loc of Object.keys(nextLocales)) {
                nextLocales[loc] = {
                    ...nextLocales[loc],
                    [k]: loc === activeLocale ? newValue : (nextLocales[loc]?.[k] ?? newValue),
                };
            }
            return {
                ...doc,
                i18n: {
                    ...currentI18n,
                    locales: nextLocales,
                },
            };
        });
        setNewKey("");
        setNewValue("");
    }, [newKey, newValue, activeLocale, executeDocumentMutation]);

    const handleDeleteKey = useCallback(
        (key: string) => {
            executeDocumentMutation(`Delete translation key ${key}`, (doc) => {
                if (!doc.i18n) {
                    return doc;
                }
                const nextLocales: Record<string, Record<string, string>> = {};
                for (const [loc, mapping] of Object.entries(doc.i18n.locales)) {
                    const nextMapping = { ...mapping };
                    delete nextMapping[key];
                    nextLocales[loc] = nextMapping;
                }
                return {
                    ...doc,
                    i18n: {
                        ...doc.i18n,
                        locales: nextLocales,
                    },
                };
            });
        },
        [executeDocumentMutation]
    );

    const handleScanDocument = useCallback(() => {
        if (!document) {
            return;
        }
        const extracted: Record<string, string> = {};
        function walk(node: WidgetNode) {
            if (node.properties?.text_key) {
                const rawText = node.properties.text;
                const textVal =
                    typeof rawText === "string"
                        ? rawText
                        : typeof rawText === "object" && rawText && "value" in rawText
                        ? String((rawText as { value: unknown }).value)
                        : node.properties.text_key;
                extracted[node.properties.text_key] = textVal;
            }
            if (node.children) {
                for (const child of node.children) {
                    walk(child);
                }
            }
        }
        walk(document.root);

        executeDocumentMutation("Extract keys from document widgets", (doc) => {
            const currentI18n: I18nConfig = doc.i18n ?? {
                default_locale: "en-US",
                locales: { "en-US": {} },
            };
            const nextLocales = { ...currentI18n.locales };
            const defLoc = currentI18n.default_locale || "en-US";
            const defMapping = { ...(nextLocales[defLoc] ?? {}) };

            for (const [k, v] of Object.entries(extracted)) {
                if (!defMapping[k]) {
                    defMapping[k] = v;
                }
            }
            nextLocales[defLoc] = defMapping;

            return {
                ...doc,
                i18n: {
                    ...currentI18n,
                    locales: nextLocales,
                },
            };
        });
    }, [document, executeDocumentMutation]);

    if (!i18n) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <span className="text-3xl mb-2">🌐</span>
                <span className="text-xs font-semibold text-zinc-200 mb-1">
                    Localization Not Configured
                </span>
                <p className="text-[11px] text-zinc-400 mb-4 max-w-xs">
                    Configure multi-locale Project Fluent (.ftl) and JSON dictionary generation for native Iced, egui, and Fyne apps.
                </p>
                <button
                    type="button"
                    onClick={handleInitialize}
                    className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-sm transition-colors"
                >
                    + Initialize i18n Dictionary
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden text-xs text-zinc-300">
            <div className="p-2 border-b border-zinc-800 flex flex-col gap-2 bg-zinc-950/40">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-200">
                        Locales ({availableLocales.length})
                    </span>
                    <button
                        type="button"
                        onClick={handleScanDocument}
                        className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-[10px] transition-colors"
                        title="Scan canvas for widgets using text_key"
                    >
                        ⚡ Scan Canvas
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                    {availableLocales.map((loc) => {
                        const isSelected = loc === activeLocale;
                        const isDefault = loc === defaultLocale;
                        return (
                            <button
                                key={loc}
                                type="button"
                                onClick={() => setSelectedLocale(loc)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-colors ${
                                    isSelected
                                        ? "bg-blue-600/30 text-blue-300 border border-blue-500/50 font-semibold"
                                        : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                                }`}
                            >
                                <span>{loc}</span>
                                {isDefault && (
                                    <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">
                                        DEF
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {isAddingLocale ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={newLocaleCode}
                                onChange={(e) => setNewLocaleCode(e.target.value)}
                                placeholder="de-DE"
                                className="w-16 h-5 px-1 rounded bg-zinc-950 border border-zinc-700 text-[10px] font-mono text-zinc-200 outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleAddLocale}
                                className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px]"
                            >
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsAddingLocale(false)}
                                className="px-1 py-0.5 rounded text-zinc-500 hover:text-zinc-300 text-[10px]"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsAddingLocale(true)}
                            className="px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-[10px] border border-dashed border-zinc-700"
                        >
                            + New Locale
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search translation keys..."
                        className="flex-1 h-6 px-2 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                    />
                    <select
                        value={defaultLocale}
                        onChange={(e) => handleSetDefaultLocale(e.target.value)}
                        className="h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-300 outline-none"
                        title="Default fallback locale"
                    >
                        {availableLocales.map((loc) => (
                            <option key={loc} value={loc}>
                                Def: {loc}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-2 border-b border-zinc-800 bg-zinc-950/20 flex items-center gap-1.5">
                <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="new_key"
                    className="w-28 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] font-mono text-zinc-200 outline-none focus:border-blue-500/70"
                />
                <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder={`Value in ${activeLocale}`}
                    className="flex-1 h-6 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 outline-none focus:border-blue-500/70"
                />
                <button
                    type="button"
                    onClick={handleAddKey}
                    disabled={!newKey.trim()}
                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-[10px] transition-colors"
                >
                    + Add
                </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60 p-2 flex flex-col gap-1.5 scrollbar-thin scrollbar-thumb-zinc-700">
                {filteredKeys.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 text-[11px]">
                        No translation keys found. Click "+ Add" or "Scan Canvas" to populate keys.
                    </div>
                ) : (
                    filteredKeys.map((k) => {
                        const val = i18n.locales?.[activeLocale]?.[k] ?? "";
                        const defVal =
                            activeLocale !== defaultLocale
                                ? i18n.locales?.[defaultLocale]?.[k]
                                : undefined;

                        return (
                            <div
                                key={k}
                                className="flex flex-col gap-1 py-1.5 bg-zinc-950/40 p-2 rounded border border-zinc-800/80 hover:border-zinc-700 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[10px] font-semibold text-amber-300/90 truncate">
                                        {k}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteKey(k)}
                                        className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors"
                                        title="Delete key"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => handleUpdateTranslation(k, e.target.value)}
                                    placeholder={`[${activeLocale}] Translation...`}
                                    className="w-full h-6 px-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 outline-none focus:border-blue-500/70"
                                />

                                {defVal !== undefined && (
                                    <div className="text-[9px] text-zinc-500 flex items-center gap-1 font-mono truncate">
                                        <span>[{defaultLocale}]:</span>
                                        <span className="italic truncate">{defVal}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

