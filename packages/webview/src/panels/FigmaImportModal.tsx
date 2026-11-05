import { FC, useState, useMemo } from "react";
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

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
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
    );
};
