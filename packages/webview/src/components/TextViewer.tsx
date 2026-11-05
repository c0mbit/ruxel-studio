import { ChangeEvent, FC, UIEvent, useEffect, useMemo, useRef, useState } from "react";
import type { TargetFramework } from "@ruxel/shared-types";
import { formatJson } from "../utils/treeTraversal";
import { useEditorStore } from "../state/editorStore";
import { useExtensionIpc } from "../hooks/useExtensionIpc";
import { CodeViewer, CodeViewerLanguage } from "./CodeViewer";

interface TextViewerProps {
    readonly onDocumentChange: (rawText: string, summary?: string) => void;
    readonly onValidateRequest: (rawText: string) => void;
    readonly onRequestSave: () => void;
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

export const TextViewer: FC<TextViewerProps> = ({
    onDocumentChange,
    onValidateRequest,
    onRequestSave,
}) => {
    const rawText = useEditorStore((state) => state.rawText);
    const setRawText = useEditorStore((state) => state.setRawText);
    const validationResult = useEditorStore((state) => state.validationResult);
    const isDirty = useEditorStore((state) => state.isDirty);
    const isReadOnly = useEditorStore((state) => state.isReadOnly);
    const generatedUiCode = useEditorStore((state) => state.generatedUiCode);
    const generatedControllerCode = useEditorStore(
        (state) => state.generatedControllerCode
    );
    const isGeneratingCode = useEditorStore((state) => state.isGeneratingCode);
    const targetFramework = useEditorStore((state) => state.targetFramework);
    const setTargetFramework = useEditorStore((state) => state.setTargetFramework);
    const uiGeneratedFilename = useEditorStore((state) => state.uiGeneratedFilename);
    const controllerFilename = useEditorStore((state) => state.controllerFilename);
    const auxiliaryFiles = useEditorStore((state) => state.auxiliaryFiles);
    const frameworkVersion = useEditorStore((state) => state.frameworkVersion);

    const { sendGenerateCode, sendExportCode } = useExtensionIpc();

    const [localText, setLocalText] = useState<string>(rawText);
    const [lineCount, setLineCount] = useState<number>(1);
    const [showErrorsDrawer, setShowErrorsDrawer] = useState<boolean>(true);
    const [showCodeDrawer, setShowCodeDrawer] = useState<boolean>(false);
    const [activeFileTab, setActiveFileTab] = useState<string>("ui_generated");

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const currentFramework = useMemo(
        () => FRAMEWORKS.find((f) => f.id === targetFramework) ?? FRAMEWORKS[0],
        [targetFramework]
    );

    useEffect(() => {
        setLocalText(rawText);
        const lines = rawText.split("\n").length;
        setLineCount(Math.max(1, lines));
    }, [rawText]);

    const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const nextText = e.target.value;
        setLocalText(nextText);
        setRawText(nextText);
        const lines = nextText.split("\n").length;
        setLineCount(Math.max(1, lines));
        onDocumentChange(nextText, "Edit Raw JSON");
    };

    const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    };

    const handleFormat = () => {
        const formatted = formatJson(localText);
        setLocalText(formatted);
        setRawText(formatted);
        const lines = formatted.split("\n").length;
        setLineCount(Math.max(1, lines));
        onDocumentChange(formatted, "Format Document");
        onValidateRequest(formatted);
    };

    const handleValidate = () => {
        onValidateRequest(localText);
    };

    const handleGenerate = () => {
        setShowCodeDrawer(true);
        sendGenerateCode(localText, undefined, currentFramework.language, targetFramework);
    };

    const handleExport = () => {
        sendExportCode(localText, undefined, currentFramework.language, targetFramework);
    };

    const errorCount = validationResult.errors.length;

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

    const codeViewerLanguage = useMemo((): CodeViewerLanguage => {
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

    return (
        <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden font-mono text-sm">
            <header className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 select-none shrink-0 text-xs">
                <div className="flex items-center gap-2">
                    <span className="text-zinc-400 font-sans font-medium">
                        Raw .rux JSON Editor
                    </span>
                    {isDirty && (
                        <span
                            className="w-2 h-2 rounded-full bg-amber-400"
                            title="Unsaved changes"
                        />
                    )}
                    <span className="text-zinc-500 text-[11px]">
                        ({lineCount} lines)
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGeneratingCode}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 font-sans text-xs"
                    >
                        {isGeneratingCode ? (
                            <span className="w-3 h-3 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg
                                className="w-3.5 h-3.5 text-blue-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                />
                            </svg>
                        )}
                        <span>Live Code ({currentFramework.label})</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium transition-colors flex items-center gap-1 font-sans text-xs shadow-sm"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                        </svg>
                        <span>Export</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleFormat}
                        disabled={isReadOnly}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 font-sans text-xs disabled:opacity-50"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 6h16M4 12h16m-7 6h7"
                            />
                        </svg>
                        Format
                    </button>
                    <button
                        type="button"
                        onClick={handleValidate}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 font-sans text-xs"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        Validate
                    </button>
                    <button
                        type="button"
                        onClick={onRequestSave}
                        disabled={isReadOnly}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center gap-1 font-sans text-xs disabled:opacity-50"
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                            />
                        </svg>
                        Save
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                <div
                    ref={lineNumbersRef}
                    className="w-12 bg-zinc-900/60 border-r border-zinc-800 text-zinc-600 text-right pr-2 select-none overflow-hidden py-2"
                >
                    {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i + 1} className="leading-6 text-xs">
                            {i + 1}
                        </div>
                    ))}
                </div>

                <textarea
                    ref={textareaRef}
                    value={localText}
                    onChange={handleTextChange}
                    onScroll={handleScroll}
                    readOnly={isReadOnly}
                    spellCheck={false}
                    className="flex-1 bg-transparent text-zinc-200 resize-none outline-none p-2 leading-6 font-mono text-xs whitespace-pre tab-4 overflow-auto border-none"
                    placeholder="Enter .rux document JSON structure..."
                />

                {showCodeDrawer && (
                    <div className="w-1/2 border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
                        <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-2 select-none shrink-0">
                            <div className="flex items-center gap-1.5 text-[10px] overflow-x-auto">
                                <div className="flex items-center bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[10px]">
                                    {FRAMEWORKS.map((fw) => (
                                        <button
                                            key={fw.id}
                                            type="button"
                                            onClick={() => {
                                                setTargetFramework(fw.id);
                                                sendGenerateCode(localText, undefined, fw.language, fw.id);
                                            }}
                                            className={`px-1.5 py-0.5 rounded font-medium text-[9px] ${
                                                targetFramework === fw.id
                                                    ? "bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700"
                                                    : "text-zinc-400 hover:text-zinc-200"
                                            }`}
                                        >
                                            {fw.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-0.5 bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[10px]">
                                    <button
                                        type="button"
                                        onClick={() => setActiveFileTab("ui_generated")}
                                        className={`px-1.5 py-0.5 rounded font-medium text-[9px] whitespace-nowrap ${
                                            activeFileTab === "ui_generated"
                                                ? "bg-zinc-800 text-blue-400"
                                                : "text-zinc-400 hover:text-zinc-200"
                                        }`}
                                    >
                                        {uiGeneratedFilename}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveFileTab("controller")}
                                        className={`px-1.5 py-0.5 rounded font-medium text-[9px] whitespace-nowrap ${
                                            activeFileTab === "controller"
                                                ? "bg-zinc-800 text-emerald-400"
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
                                            className={`px-1.5 py-0.5 rounded font-medium text-[9px] whitespace-nowrap ${
                                                activeFileTab === aux.filename
                                                    ? "bg-zinc-800 text-violet-400"
                                                    : "text-zinc-400 hover:text-zinc-200"
                                            }`}
                                        >
                                            {aux.filename}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCodeDrawer(false)}
                                className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 shrink-0 ml-1"
                            >
                                ×
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-2">
                            {displayedCode ? (
                                <CodeViewer
                                    code={displayedCode}
                                    language={codeViewerLanguage}
                                    maxHeight="calc(100vh - 120px)"
                                    showLineNumbers={true}
                                />
                            ) : (
                                <div className="text-zinc-500 text-xs p-4 text-center">
                                    Click &quot;Live Code&quot; to inspect code.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {errorCount > 0 && showErrorsDrawer && (
                <div className="h-28 bg-rose-950/20 border-t border-rose-900/40 flex flex-col shrink-0 select-none">
                    <div className="h-6 bg-rose-950/40 border-b border-rose-900/30 flex items-center justify-between px-3 text-[11px] text-rose-300">
                        <span>AST Validation Errors ({errorCount})</span>
                        <button
                            type="button"
                            onClick={() => setShowErrorsDrawer(false)}
                            className="hover:text-rose-100"
                        >
                            Dismiss
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-1 font-mono text-xs text-rose-300">
                        {validationResult.errors.map((err, idx) => (
                            <div key={idx} className="leading-5">
                                • {err.message}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
