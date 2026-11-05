import { FC, useMemo, useState } from "react";

export type CodeViewerLanguage = "rust" | "go" | "python" | "slint" | "json";

export interface CodeViewerProps {
    readonly code: string;
    readonly language: CodeViewerLanguage;
    readonly maxHeight?: string | number;
    readonly showLineNumbers?: boolean;
    readonly copyable?: boolean;
    readonly title?: string;
}

interface CodeToken {
    readonly text: string;
    readonly className: string;
}

const RUST_CONTROL_KEYWORDS = new Set([
    "if", "else", "match", "for", "while", "loop", "return", "in", "where", "async", "await",
]);

const RUST_DECL_KEYWORDS = new Set([
    "pub", "fn", "struct", "impl", "enum", "trait", "type", "use", "super", "crate", "let",
    "mut", "const", "static", "self", "Self", "ref", "move", "dyn", "true", "false", "vec", "format",
]);

const GO_CONTROL_KEYWORDS = new Set([
    "if", "else", "for", "range", "return", "switch", "case", "select", "default", "defer", "go",
]);

const GO_DECL_KEYWORDS = new Set([
    "package", "import", "func", "type", "struct", "interface", "var", "const", "nil",
    "make", "new", "chan", "map", "true", "false",
]);

const PYTHON_CONTROL_KEYWORDS = new Set([
    "if", "elif", "else", "for", "while", "break", "continue", "return", "yield", "try",
    "except", "finally", "raise", "with", "as", "assert", "match", "case", "in", "is", "not", "and", "or",
]);

const PYTHON_DECL_KEYWORDS = new Set([
    "def", "class", "import", "from", "lambda", "global", "nonlocal", "pass", "None",
    "True", "False", "async", "await", "self",
]);

const SLINT_CONTROL_KEYWORDS = new Set([
    "if", "for", "in", "return", "root", "self", "parent",
]);

const SLINT_DECL_KEYWORDS = new Set([
    "import", "from", "export", "component", "inherits", "property", "in-out", "in", "out",
    "callback", "pure", "global", "struct", "enum",
]);

const STANDARD_TYPES = new Set([
    "String", "Option", "Vec", "Result", "Some", "None", "Ok", "Err",
    "bool", "f64", "f32", "usize", "i32", "u32", "i64", "u64",
    "AppState", "UiMessage", "UiHandler", "Controller", "ViewNode", "WidgetIds",
    "string", "int", "float64", "any", "error", "CanvasObject", "App", "Window",
    "Entry", "Button", "Check", "Slider", "Label",
    "str", "float", "bytes", "list", "dict", "set", "tuple", "Any", "Optional",
    "List", "Dict", "Set", "Tuple", "Callable", "Protocol", "Enum", "auto",
    "Page", "Control", "VerticalBox", "HorizontalBox", "GridBox", "ScrollView",
    "CheckBox", "ProgressIndicator", "LineEdit", "Text", "Rectangle", "Image",
]);

function tokenizeLine(line: string, language: CodeViewerLanguage): CodeToken[] {
    if (!line) {
        return [{ text: " ", className: "text-zinc-300" }];
    }

    const tokens: CodeToken[] = [];
    let i = 0;
    const len = line.length;

    while (i < len) {
        const char = line[i];

        if (char === " " || char === "\t") {
            let spaceEnd = i;
            while (spaceEnd < len && (line[spaceEnd] === " " || line[spaceEnd] === "\t")) {
                spaceEnd++;
            }
            tokens.push({
                text: line.slice(i, spaceEnd),
                className: "text-zinc-500",
            });
            i = spaceEnd;
            continue;
        }

        if (char === '"' || char === "'") {
            const quote = char;
            let strEnd = i + 1;
            while (strEnd < len) {
                if (line[strEnd] === "\\" && strEnd + 1 < len) {
                    strEnd += 2;
                } else if (line[strEnd] === quote) {
                    strEnd++;
                    break;
                } else {
                    strEnd++;
                }
            }
            tokens.push({
                text: line.slice(i, strEnd),
                className: "text-amber-400/90",
            });
            i = strEnd;
            continue;
        }

        if (
            (char === "/" && i + 1 < len && (line[i + 1] === "/" || line[i + 1] === "*")) ||
            (char === "#" && language === "python")
        ) {
            tokens.push({
                text: line.slice(i),
                className: "text-zinc-500 italic",
            });
            break;
        }

        if (char === "@" && language === "python") {
            let decEnd = i + 1;
            while (decEnd < len && /[a-zA-Z0-9_]/.test(line[decEnd])) {
                decEnd++;
            }
            tokens.push({
                text: line.slice(i, decEnd),
                className: "text-purple-400 font-semibold",
            });
            i = decEnd;
            continue;
        }

        if (/[0-9]/.test(char)) {
            let numEnd = i;
            while (numEnd < len && /[0-9a-fA-FxX._px]/.test(line[numEnd])) {
                numEnd++;
            }
            tokens.push({
                text: line.slice(i, numEnd),
                className: "text-emerald-400",
            });
            i = numEnd;
            continue;
        }

        if (/[a-zA-Z_]/.test(char)) {
            let identEnd = i;
            while (identEnd < len && (/[a-zA-Z0-9_]/.test(line[identEnd]) || (language === "slint" && line[identEnd] === "-"))) {
                identEnd++;
            }
            const ident = line.slice(i, identEnd);
            let nextNonSpace = identEnd;
            while (nextNonSpace < len && (line[nextNonSpace] === " " || line[nextNonSpace] === "\t")) {
                nextNonSpace++;
            }
            const isCall = nextNonSpace < len && (line[nextNonSpace] === "(" || line[nextNonSpace] === "!");

            let className = "text-zinc-200";

            if (language === "rust") {
                if (RUST_CONTROL_KEYWORDS.has(ident)) {
                    className = "text-purple-400 font-semibold";
                } else if (RUST_DECL_KEYWORDS.has(ident)) {
                    className = "text-blue-400 font-semibold";
                } else if (STANDARD_TYPES.has(ident) || /^[A-Z][a-zA-Z0-9_]*$/.test(ident)) {
                    className = "text-cyan-300";
                } else if (isCall) {
                    className = "text-yellow-300";
                }
            } else if (language === "go") {
                if (GO_CONTROL_KEYWORDS.has(ident)) {
                    className = "text-purple-400 font-semibold";
                } else if (GO_DECL_KEYWORDS.has(ident)) {
                    className = "text-blue-400 font-semibold";
                } else if (STANDARD_TYPES.has(ident) || /^[A-Z][a-zA-Z0-9_]*$/.test(ident)) {
                    className = "text-cyan-300";
                } else if (isCall) {
                    className = "text-yellow-300";
                }
            } else if (language === "python") {
                if (PYTHON_CONTROL_KEYWORDS.has(ident)) {
                    className = "text-purple-400 font-semibold";
                } else if (PYTHON_DECL_KEYWORDS.has(ident)) {
                    className = "text-blue-400 font-semibold";
                } else if (STANDARD_TYPES.has(ident) || /^[A-Z][a-zA-Z0-9_]*$/.test(ident)) {
                    className = "text-cyan-300";
                } else if (isCall) {
                    className = "text-yellow-300";
                }
            } else if (language === "slint") {
                if (SLINT_CONTROL_KEYWORDS.has(ident)) {
                    className = "text-purple-400 font-semibold";
                } else if (SLINT_DECL_KEYWORDS.has(ident)) {
                    className = "text-blue-400 font-semibold";
                } else if (STANDARD_TYPES.has(ident) || /^[A-Z][a-zA-Z0-9_]*$/.test(ident)) {
                    className = "text-cyan-300";
                } else if (isCall) {
                    className = "text-yellow-300";
                }
            } else {
                if (ident === "true" || ident === "false" || ident === "null") {
                    className = "text-purple-400 font-semibold";
                }
            }

            tokens.push({
                text: ident,
                className,
            });
            i = identEnd;
            continue;
        }

        if (char === "<" && i + 2 < len && line[i + 1] === "=" && line[i + 2] === ">") {
            tokens.push({ text: "<=>", className: "text-zinc-400 font-semibold" });
            i += 3;
            continue;
        }

        if (char === "-" && i + 1 < len && line[i + 1] === ">") {
            tokens.push({ text: "->", className: "text-zinc-400 font-semibold" });
            i += 2;
            continue;
        }

        if (char === "=" && i + 1 < len && line[i + 1] === ">") {
            tokens.push({ text: "=>", className: "text-zinc-400 font-semibold" });
            i += 2;
            continue;
        }

        if (char === ":" && i + 1 < len && line[i + 1] === ":") {
            tokens.push({ text: "::", className: "text-zinc-400" });
            i += 2;
            continue;
        }

        if (char === ":" && i + 1 < len && line[i + 1] === "=") {
            tokens.push({ text: ":=", className: "text-zinc-400 font-semibold" });
            i += 2;
            continue;
        }

        tokens.push({
            text: char,
            className: "text-zinc-400",
        });
        i++;
    }

    return tokens;
}

export const CodeViewer: FC<CodeViewerProps> = ({
    code,
    language,
    maxHeight = 360,
    showLineNumbers = true,
    copyable = true,
    title,
}) => {
    const [copied, setCopied] = useState(false);

    const tokenizedLines = useMemo(() => {
        const rawLines = code.split("\n");
        return rawLines.map((line) => tokenizeLine(line, language));
    }, [code, language]);

    const handleCopy = () => {
        void navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden font-mono text-[11px] select-text">
            {(title || copyable) && (
                <div className="h-7 bg-zinc-900 border-b border-zinc-800 px-2 flex items-center justify-between select-none shrink-0">
                    <div className="flex items-center gap-1.5">
                        {title && (
                            <span className="font-sans font-medium text-zinc-300 text-[10px]">
                                {title}
                            </span>
                        )}
                        <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[9px] uppercase font-mono text-zinc-400 border border-zinc-700">
                            {language}
                        </span>
                        <span className="text-zinc-500 text-[9px] font-sans">
                            {tokenizedLines.length} lines
                        </span>
                    </div>

                    {copyable && (
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-sans border border-zinc-700 transition-colors flex items-center gap-1"
                        >
                            {copied ? (
                                <>
                                    <span className="text-emerald-400 font-bold">✓</span>
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <span>Copy</span>
                            )}
                        </button>
                    )}
                </div>
            )}

            <div
                className="overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 p-1"
                style={{ maxHeight }}
            >
                <table className="border-collapse w-full">
                    <tbody>
                        {tokenizedLines.map((tokens, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/60 transition-colors">
                                {showLineNumbers && (
                                    <td className="select-none text-right pr-2 pl-1 text-zinc-600 font-mono text-[10px] w-7 border-r border-zinc-800/60 align-top leading-5">
                                        {idx + 1}
                                    </td>
                                )}
                                <td className="pl-2.5 pr-2 whitespace-pre font-mono text-[11px] align-top leading-5">
                                    {tokens.map((tok, tokIdx) => (
                                        <span key={tokIdx} className={tok.className}>
                                            {tok.text}
                                        </span>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
