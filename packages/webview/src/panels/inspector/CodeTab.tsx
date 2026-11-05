import { FC, useCallback, useState, useMemo } from "react";
import type {
    WidgetNode,
    WidgetEvents,
    WidgetBindings,
    EventHandler,
    TargetFramework,
    TargetLanguage,
} from "@ruxel/shared-types";
import { useEditorStore } from "../../state/editorStore";
import { useDocumentMutation } from "../../hooks/useDocumentMutation";
import { useExtensionIpc } from "../../hooks/useExtensionIpc";
import { findNodeById } from "../../utils/treeTraversal";
import { collectAllIds } from "../../utils/widgetFactory";
import { CollapsibleSection, PropertyRow } from "./PropertiesTab";
import { StateAutocompleteInput } from "../../components/StateAutocompleteInput";
import { CodeViewer } from "../../components/CodeViewer";
import {
    inferDocumentStateFields,
    suggestEventForNode,
} from "../../utils/stateInference";

interface CodeTabProps {
    readonly onDocumentChange?: (rawText: string, summary?: string) => void;
}

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
    "as", "break", "const", "continue", "crate", "else", "enum", "extern",
    "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
    "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct",
    "super", "trait", "true", "type", "unsafe", "use", "where", "while",
    "async", "await", "dyn", "abstract", "become", "box", "do", "final",
    "macro", "override", "priv", "typeof", "unsized", "virtual", "yield",
    "try",
    "and", "as", "assert", "break", "class", "continue", "def", "del",
    "elif", "else", "except", "False", "finally", "for", "from", "global",
    "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or",
    "pass", "raise", "return", "True", "try", "while", "with", "yield",
    "func", "var", "package", "import", "const", "type", "struct", "interface",
    "map", "chan", "go", "defer", "select", "case", "default", "fallthrough",
    "range", "switch",
]);

const EVENT_TYPES = [
    { key: "on_click", label: "On Click" },
    { key: "on_change", label: "On Change" },
    { key: "on_hover", label: "On Hover" },
    { key: "on_submit", label: "On Submit" },
    { key: "on_focus", label: "On Focus" },
] as const;

const BINDING_KEYS = [
    { key: "value", label: "Value" },
    { key: "items", label: "Items" },
    { key: "selected", label: "Selected" },
    { key: "disabled", label: "Disabled" },
    { key: "visible", label: "Visible" },
] as const;

type StandardEventKey = (typeof EVENT_TYPES)[number]["key"];
type StandardBindingKey = (typeof BINDING_KEYS)[number]["key"];

interface IdValidationResult {
    readonly valid: boolean;
    readonly message: string;
}

const FRAMEWORKS: readonly {
    readonly id: TargetFramework;
    readonly label: string;
    readonly version: string;
    readonly language: "rust" | "go" | "python";
    readonly color: string;
}[] = [
    { id: "iced", label: "Iced", version: "0.13", language: "rust", color: "text-orange-400 border-orange-500/40 bg-orange-600/20" },
    { id: "egui", label: "egui", version: "0.29", language: "rust", color: "text-amber-400 border-amber-500/40 bg-amber-600/20" },
    { id: "slint", label: "Slint", version: "1.8", language: "rust", color: "text-violet-400 border-violet-500/40 bg-violet-600/20" },
    { id: "dioxus", label: "Dioxus", version: "0.5", language: "rust", color: "text-pink-400 border-pink-500/40 bg-pink-600/20" },
    { id: "fyne", label: "Go (Fyne)", version: "v2.5", language: "go", color: "text-cyan-400 border-cyan-500/40 bg-cyan-600/20" },
    { id: "flet", label: "Python (Flet)", version: "0.24", language: "python", color: "text-emerald-400 border-emerald-500/40 bg-emerald-600/20" },
];

export const CodeTab: FC<CodeTabProps> = ({ onDocumentChange }) => {
    const document = useEditorStore((state) => state.document);
    const rawText = useEditorStore((state) => state.rawText);
    const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
    const setSelectedNodeId = useEditorStore((state) => state.setSelectedNodeId);
    const generatedUiCode = useEditorStore((state) => state.generatedUiCode);
    const generatedControllerCode = useEditorStore((state) => state.generatedControllerCode);
    const isGeneratingCode = useEditorStore((state) => state.isGeneratingCode);
    const codegenDiagnostics = useEditorStore((state) => state.codegenDiagnostics);

    const { sendGenerateCode, sendExportCode } = useExtensionIpc();
    const { executeNodeMutation } = useDocumentMutation(onDocumentChange);

    const targetLanguage = useEditorStore((state) => state.targetLanguage);
    const targetFramework = useEditorStore((state) => state.targetFramework);
    const setTargetFramework = useEditorStore((state) => state.setTargetFramework);
    const uiGeneratedFilename = useEditorStore((state) => state.uiGeneratedFilename);
    const controllerFilename = useEditorStore((state) => state.controllerFilename);
    const auxiliaryFiles = useEditorStore((state) => state.auxiliaryFiles);
    const frameworkVersion = useEditorStore((state) => state.frameworkVersion);

    const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(
        new Set(["identity", "events", "bindings", "codegen"])
    );
    const [activeFileTab, setActiveFileTab] = useState<string>("ui_generated");
    const [copied, setCopied] = useState<boolean>(false);

    const currentFramework = useMemo(
        () => FRAMEWORKS.find((f) => f.id === targetFramework) ?? FRAMEWORKS[0],
        [targetFramework]
    );

    const displayedCode = useMemo(() => {
        if (activeFileTab === "ui_generated") {
            return generatedUiCode;
        }
        if (activeFileTab === "controller") {
            return generatedControllerCode;
        }
        const aux = auxiliaryFiles.find((f) => f.filename === activeFileTab);
        return aux ? aux.content : "";
    }, [activeFileTab, generatedUiCode, generatedControllerCode, auxiliaryFiles]);

    const codeViewerLanguage = useMemo((): import("../../components/CodeViewer").CodeViewerLanguage => {
        if (activeFileTab.endsWith(".slint")) {
            return "slint";
        }
        if (currentFramework.language === "go") {
            return "go";
        }
        if (currentFramework.language === "python") {
            return "python";
        }
        return "rust";
    }, [activeFileTab, currentFramework]);

    const inferredStateFields = useMemo(
        () => inferDocumentStateFields(document),
        [document]
    );

    const selectedNode =
        document && selectedNodeId
            ? findNodeById(document.root, selectedNodeId)
            : null;

    const allIds = useMemo(
        () => (document ? collectAllIds(document.root) : new Set<string>()),
        [document]
    );

    const toggleSection = useCallback((section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    }, []);

    const validateId = useCallback(
        (newId: string): IdValidationResult => {
            if (newId.length === 0) {
                return { valid: false, message: "ID cannot be empty" };
            }

            if (!IDENTIFIER_REGEX.test(newId)) {
                return {
                    valid: false,
                    message: "Must start with letter or _, only alphanumerics and _",
                };
            }

            if (RESERVED_KEYWORDS.has(newId)) {
                return {
                    valid: false,
                    message: `"${newId}" is a reserved keyword`,
                };
            }

            if (newId !== selectedNodeId && allIds.has(newId)) {
                return {
                    valid: false,
                    message: "ID already exists in document",
                };
            }

            return { valid: true, message: "Valid identifier" };
        },
        [selectedNodeId, allIds]
    );

    const handleIdChange = useCallback(
        (newId: string) => {
            if (!selectedNodeId || !document) {
                return;
            }
            const validation = validateId(newId);
            if (!validation.valid || newId === selectedNodeId) {
                return;
            }

            executeNodeMutation(
                `Rename Widget ${selectedNodeId} to ${newId}`,
                (root) =>
                    updateNodeFieldInTree(root, selectedNodeId, (node) => ({
                        ...node,
                        id: newId,
                    }))
            );
            setSelectedNodeId(newId);
        },
        [selectedNodeId, document, validateId, executeNodeMutation, setSelectedNodeId]
    );

    const updateEvents = useCallback(
        (updater: (events: WidgetEvents) => WidgetEvents) => {
            if (!selectedNodeId) {
                return;
            }
            executeNodeMutation(
                `Update events on ${selectedNodeId}`,
                (root) =>
                    updateNodeFieldInTree(root, selectedNodeId, (node) => ({
                        ...node,
                        events: updater(node.events ?? {}),
                    }))
            );
        },
        [selectedNodeId, executeNodeMutation]
    );

    const updateBindings = useCallback(
        (updater: (bindings: WidgetBindings) => WidgetBindings) => {
            if (!selectedNodeId) {
                return;
            }
            executeNodeMutation(
                `Update bindings on ${selectedNodeId}`,
                (root) =>
                    updateNodeFieldInTree(root, selectedNodeId, (node) => ({
                        ...node,
                        bindings: updater(node.bindings ?? {}),
                    }))
            );
        },
        [selectedNodeId, executeNodeMutation]
    );

    const handleGenerateClick = useCallback(() => {
        sendGenerateCode(rawText, undefined, currentFramework.language, targetFramework);
    }, [sendGenerateCode, rawText, currentFramework, targetFramework]);

    const handleExportClick = useCallback(() => {
        sendExportCode(rawText, undefined, currentFramework.language, targetFramework);
    }, [sendExportCode, rawText, currentFramework, targetFramework]);

    const handleCopyCode = useCallback(() => {
        if (!displayedCode) {
            return;
        }
        void navigator.clipboard.writeText(displayedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [displayedCode]);

    return (
        <div className="flex flex-col select-none text-xs text-zinc-300 pb-8">
            {selectedNode && (
                <>
                    <CollapsibleSection
                        title="Identity"
                        sectionKey="identity"
                        expanded={expandedSections.has("identity")}
                        onToggle={toggleSection}
                    >
                        <IdEditor
                            currentId={selectedNode.id}
                            validate={validateId}
                            onCommit={handleIdChange}
                        />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Event Handlers"
                        sectionKey="events"
                        expanded={expandedSections.has("events")}
                        onToggle={toggleSection}
                    >
                        {EVENT_TYPES.map(({ key, label }) => (
                            <EventHandlerRow
                                key={key}
                                label={label}
                                handler={(selectedNode.events ?? {})[key as StandardEventKey]}
                                suggestion={selectedNode ? suggestEventForNode(selectedNode, key) : undefined}
                                onChange={(handler) =>
                                    updateEvents((ev) => ({
                                        ...ev,
                                        [key]: handler,
                                    }))
                                }
                                onRemove={() =>
                                    updateEvents((ev) => {
                                        const next = { ...ev };
                                        delete (next as Record<string, unknown>)[key];
                                        return next;
                                    })
                                }
                            />
                        ))}

                        <CustomEventsEditor
                            customEvents={selectedNode.events?.custom_events ?? {}}
                            onUpdate={(ce) =>
                                updateEvents((ev) => ({
                                    ...ev,
                                    custom_events: ce,
                                }))
                            }
                        />
                    </CollapsibleSection>

                    <CollapsibleSection
                        title="Data Bindings"
                        sectionKey="bindings"
                        expanded={expandedSections.has("bindings")}
                        onToggle={toggleSection}
                    >
                        {BINDING_KEYS.map(({ key, label }) => (
                            <BindingRow
                                key={key}
                                label={label}
                                value={(selectedNode.bindings ?? {})[key as StandardBindingKey]}
                                inferredFields={inferredStateFields}
                                onChange={(val) =>
                                    updateBindings((b) => ({
                                        ...b,
                                        [key]: val.length > 0 ? val : undefined,
                                    }))
                                }
                            />
                        ))}

                        <CustomBindingsEditor
                            customBindings={selectedNode.bindings?.custom_bindings ?? {}}
                            inferredFields={inferredStateFields}
                            onUpdate={(cb) =>
                                updateBindings((b) => ({
                                    ...b,
                                    custom_bindings: cb,
                                }))
                            }
                        />
                    </CollapsibleSection>
                </>
            )}

            <CollapsibleSection
                title={`${currentFramework.label} Code Generation`}
                sectionKey="codegen"
                expanded={expandedSections.has("codegen")}
                onToggle={toggleSection}
            >
                <div className="flex flex-col gap-2 pt-1">
                    <div className="flex flex-col gap-1.5 bg-zinc-950 p-1.5 rounded border border-zinc-800 text-[10px]">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-400 font-medium pl-0.5">Target Framework:</span>
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[9px] font-mono text-zinc-300 border border-zinc-700">
                                v{frameworkVersion || currentFramework.version}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {FRAMEWORKS.map((fw) => (
                                <button
                                    key={fw.id}
                                    type="button"
                                    onClick={() => {
                                        setTargetFramework(fw.id);
                                        sendGenerateCode(rawText, undefined, fw.language, fw.id);
                                    }}
                                    className={`px-1.5 py-1 rounded transition-colors font-medium text-[10px] flex items-center justify-between border ${
                                        targetFramework === fw.id
                                            ? fw.color
                                            : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                                    }`}
                                >
                                    <span className="truncate">{fw.label}</span>
                                    <span className="text-[8px] opacity-70 font-mono ml-0.5">{fw.version}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={handleGenerateClick}
                            disabled={isGeneratingCode}
                            className="flex-1 py-1 px-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-[11px] transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            {isGeneratingCode ? (
                                <>
                                    <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Generating...</span>
                                </>
                            ) : (
                                <>
                                    <span>Generate Preview</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleExportClick}
                            className="flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors flex items-center justify-center gap-1 shadow-sm"
                        >
                            <span>Export to Disk</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mt-1">
                        <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[10px] overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setActiveFileTab("ui_generated")}
                                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                                    activeFileTab === "ui_generated"
                                        ? "bg-zinc-800 text-blue-400 font-semibold"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                {uiGeneratedFilename}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveFileTab("controller")}
                                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                                    activeFileTab === "controller"
                                        ? "bg-zinc-800 text-emerald-400 font-semibold"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                {controllerFilename}
                            </button>
                            {auxiliaryFiles.map((aux) => (
                                <button
                                    key={aux.filename}
                                    type="button"
                                    onClick={() => setActiveFileTab(aux.filename)}
                                    className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                                        activeFileTab === aux.filename
                                            ? "bg-zinc-800 text-violet-400 font-semibold"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    {aux.filename}
                                </button>
                            ))}
                        </div>

                        {displayedCode && (
                            <button
                                type="button"
                                onClick={handleCopyCode}
                                className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] border border-zinc-700 transition-colors ml-1 shrink-0"
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        )}
                    </div>

                    {codegenDiagnostics.length > 0 && (
                        <div className="flex flex-col gap-1 py-1">
                            {codegenDiagnostics.map((diag, i) => (
                                <div
                                    key={i}
                                    className={`px-2 py-1 rounded text-[10px] flex items-center gap-1.5 ${
                                        diag.level === "warning"
                                            ? "bg-amber-950/40 border border-amber-800 text-amber-300"
                                            : "bg-blue-950/40 border border-blue-800 text-blue-300"
                                    }`}
                                >
                                    <span className="font-semibold uppercase">{diag.level}:</span>
                                    <span className="truncate">{diag.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {displayedCode ? (
                        <div className="mt-1">
                            <CodeViewer
                                code={displayedCode}
                                language={codeViewerLanguage}
                                maxHeight={340}
                                showLineNumbers={true}
                                copyable={false}
                            />
                        </div>
                    ) : (
                        <div className="p-4 rounded border border-dashed border-zinc-800 text-center text-zinc-500 text-[11px] mt-1">
                            Click &quot;Generate Preview&quot; to inspect live {currentFramework.label} code.
                        </div>
                    )}
                </div>
            </CollapsibleSection>
        </div>
    );
};

interface IdEditorProps {
    readonly currentId: string;
    readonly validate: (id: string) => IdValidationResult;
    readonly onCommit: (id: string) => void;
}

const IdEditor: FC<IdEditorProps> = ({ currentId, validate, onCommit }) => {
    const [draft, setDraft] = useState(currentId);
    const [validation, setValidation] = useState<IdValidationResult>(() =>
        validate(currentId)
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        setDraft(next);
        setValidation(validate(next));
    };

    const handleBlur = () => {
        if (validation.valid && draft !== currentId) {
            onCommit(draft);
        } else {
            setDraft(currentId);
            setValidation(validate(currentId));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleBlur();
        } else if (e.key === "Escape") {
            setDraft(currentId);
            setValidation(validate(currentId));
        }
    };

    return (
        <div className="flex flex-col gap-1 py-1">
            <PropertyRow label="Variable ID">
                <input
                    type="text"
                    value={draft}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className={`w-full h-6 px-2 rounded bg-zinc-950 border text-xs font-mono outline-none transition-colors ${
                        validation.valid
                            ? "border-zinc-700 text-zinc-200 focus:border-blue-500/70"
                            : "border-rose-600 text-rose-300 focus:border-rose-500"
                    }`}
                    placeholder="widget_id"
                />
            </PropertyRow>
            {!validation.valid && (
                <div className="text-[10px] text-rose-400 pl-24 -mt-0.5">
                    {validation.message}
                </div>
            )}
        </div>
    );
};

interface EventHandlerRowProps {
    readonly label: string;
    readonly handler?: EventHandler;
    readonly suggestion?: import("../../utils/stateInference").InferredEventHandlerSuggestion;
    readonly onChange: (handler: EventHandler) => void;
    readonly onRemove: () => void;
}

const EventHandlerRow: FC<EventHandlerRowProps> = ({
    label,
    handler,
    suggestion,
    onChange,
    onRemove,
}) => {
    const isBound = handler !== undefined;
    const [fnName, setFnName] = useState(handler?.handler_name ?? "");
    const [msgName, setMsgName] = useState(handler?.message ?? "");

    const handleCommit = (nextFn: string, nextMsg: string) => {
        if (nextFn.trim().length === 0) {
            onRemove();
        } else {
            onChange({
                handler_name: nextFn.trim(),
                message: nextMsg.trim().length > 0 ? nextMsg.trim() : undefined,
            });
        }
    };

    return (
        <div className="py-1 border-b border-zinc-800/40">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-400">{label}</span>
                <div className="flex items-center gap-1.5">
                    {!isBound && suggestion && (
                        <button
                            type="button"
                            onClick={() => {
                                setFnName(suggestion.handlerName);
                                setMsgName(suggestion.messageVariant);
                                handleCommit(suggestion.handlerName, suggestion.messageVariant);
                            }}
                            className="text-[9px] text-blue-400 hover:text-blue-300 font-mono transition-colors"
                        >
                            + Suggest: {suggestion.handlerName}
                        </button>
                    )}
                    {isBound && (
                        <button
                            type="button"
                            onClick={onRemove}
                            className="text-[10px] text-rose-400 hover:text-rose-300"
                        >
                            clear
                        </button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    value={fnName}
                    onChange={(e) => setFnName(e.target.value)}
                    onBlur={() => handleCommit(fnName, msgName)}
                    className="flex-1 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                    placeholder="handler_fn"
                />
                <input
                    type="text"
                    value={msgName}
                    onChange={(e) => setMsgName(e.target.value)}
                    onBlur={() => handleCommit(fnName, msgName)}
                    className="w-24 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                    placeholder="UiMessage"
                />
            </div>
        </div>
    );
};

interface CustomEventsEditorProps {
    readonly customEvents: Readonly<Record<string, EventHandler>>;
    readonly onUpdate: (events: Readonly<Record<string, EventHandler>>) => void;
}

const CustomEventsEditor: FC<CustomEventsEditorProps> = ({
    customEvents,
    onUpdate,
}) => {
    const entries = Object.entries(customEvents);

    const addEvent = () => {
        const key = `custom_event_${entries.length + 1}`;
        onUpdate({
            ...customEvents,
            [key]: { handler_name: `on_${key}`, message: undefined },
        });
    };

    const removeEvent = (key: string) => {
        const next = { ...customEvents };
        delete (next as Record<string, unknown>)[key];
        onUpdate(next);
    };

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500">Custom Events</span>
                <button
                    type="button"
                    onClick={addEvent}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                >
                    + Add
                </button>
            </div>
            {entries.map(([key, handler]) => (
                <div key={key} className="flex flex-col gap-1 mb-1.5 p-1 rounded bg-zinc-900/40 border border-zinc-800">
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={key}
                            onChange={(e) => {
                                const next: Record<string, EventHandler> = {};
                                for (const [k, v] of Object.entries(customEvents)) {
                                    next[k === key ? e.target.value : k] = v;
                                }
                                onUpdate(next);
                            }}
                            className="w-20 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                            placeholder="event_name"
                        />
                        <input
                            type="text"
                            value={handler.handler_name}
                            onChange={(e) =>
                                onUpdate({
                                    ...customEvents,
                                    [key]: {
                                        ...handler,
                                        handler_name: e.target.value,
                                    },
                                })
                            }
                            className="flex-1 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                            placeholder="handler"
                        />
                        <button
                            type="button"
                            onClick={() => removeEvent(key)}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400"
                        >
                            ×
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

interface BindingRowProps {
    readonly label: string;
    readonly value?: string;
    readonly onChange: (val: string) => void;
    readonly inferredFields: readonly import("../../utils/stateInference").InferredStateField[];
}

const BindingRow: FC<BindingRowProps> = ({
    label,
    value,
    onChange,
    inferredFields,
}) => {
    return (
        <div className="flex items-center justify-between py-1 gap-2">
            <span className="text-[11px] text-zinc-400 w-16 shrink-0 truncate">{label}</span>
            <StateAutocompleteInput
                value={value}
                onChange={onChange}
                inferredFields={inferredFields}
                placeholder="app_state.field"
            />
        </div>
    );
};

interface CustomBindingsEditorProps {
    readonly customBindings: Readonly<Record<string, string>>;
    readonly onUpdate: (bindings: Readonly<Record<string, string>>) => void;
    readonly inferredFields: readonly import("../../utils/stateInference").InferredStateField[];
}

const CustomBindingsEditor: FC<CustomBindingsEditorProps> = ({
    customBindings,
    onUpdate,
    inferredFields,
}) => {
    const entries = Object.entries(customBindings);

    const addBinding = () => {
        const key = `custom_binding_${entries.length + 1}`;
        onUpdate({ ...customBindings, [key]: "" });
    };

    const removeBinding = (key: string) => {
        const next = { ...customBindings };
        delete (next as Record<string, unknown>)[key];
        onUpdate(next);
    };

    return (
        <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-zinc-500">Custom Bindings</span>
                <button
                    type="button"
                    onClick={addBinding}
                    className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] border border-zinc-700"
                >
                    + Add
                </button>
            </div>
            {entries.map(([key, val]) => (
                <div key={key} className="flex items-center gap-1 mb-1">
                    <input
                        type="text"
                        value={key}
                        onChange={(e) => {
                            const next: Record<string, string> = {};
                            for (const [k, v] of Object.entries(customBindings)) {
                                next[k === key ? e.target.value : k] = v;
                            }
                            onUpdate(next);
                        }}
                        className="w-24 h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70 shrink-0"
                        placeholder="binding_key"
                    />
                    <StateAutocompleteInput
                        value={val}
                        onChange={(nextVal) =>
                            onUpdate({
                                ...customBindings,
                                [key]: nextVal,
                            })
                        }
                        inferredFields={inferredFields}
                        placeholder="state.field"
                    />
                    <button
                        type="button"
                        onClick={() => removeBinding(key)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-900/60 text-zinc-500 hover:text-rose-400 shrink-0"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};

function updateNodeFieldInTree(
    root: WidgetNode,
    nodeId: string,
    updater: (node: WidgetNode) => WidgetNode
): WidgetNode {
    if (root.id === nodeId) {
        return updater(root);
    }
    if (root.children) {
        return {
            ...root,
            children: root.children.map((child) =>
                updateNodeFieldInTree(child, nodeId, updater)
            ),
        };
    }
    return root;
}
