import { FC, useEffect, useRef, useState, useMemo } from "react";
import type { InferredStateField, InferredStateTypeName } from "../utils/stateInference";

interface StateAutocompleteInputProps {
    readonly value?: string;
    readonly onChange: (val: string) => void;
    readonly inferredFields: readonly InferredStateField[];
    readonly placeholder?: string;
}

const TYPE_BADGE_COLORS: Readonly<Record<InferredStateTypeName, string>> = {
    String: "bg-teal-950/70 text-teal-300 border-teal-800/80",
    bool: "bg-amber-950/70 text-amber-300 border-amber-800/80",
    f64: "bg-purple-950/70 text-purple-300 border-purple-800/80",
    "Option<String>": "bg-blue-950/70 text-blue-300 border-blue-800/80",
    "Vec<String>": "bg-emerald-950/70 text-emerald-300 border-emerald-800/80",
};

export const StateAutocompleteInput: FC<StateAutocompleteInputProps> = ({
    value,
    onChange,
    inferredFields,
    placeholder = "app_state.field",
}) => {
    const [draft, setDraft] = useState(value ?? "");
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDraft(value ?? "");
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const filteredFields = useMemo(() => {
        const clean = draft.trim().toLowerCase();
        if (!clean) {
            return inferredFields;
        }
        return inferredFields.filter(
            (f) =>
                f.fullPath.toLowerCase().includes(clean) ||
                f.name.toLowerCase().includes(clean) ||
                f.sourceNodeId.toLowerCase().includes(clean)
        );
    }, [draft, inferredFields]);

    const handleSelect = (field: InferredStateField) => {
        setDraft(field.fullPath);
        onChange(field.fullPath);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setIsOpen(true);
            return;
        }

        if (isOpen && filteredFields.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % filteredFields.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(
                    (prev) => (prev - 1 + filteredFields.length) % filteredFields.length
                );
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                const target = filteredFields[selectedIndex];
                if (target) {
                    e.preventDefault();
                    handleSelect(target);
                    return;
                }
            }
            if (e.key === "Escape") {
                setIsOpen(false);
                return;
            }
        }

        if (e.key === "Enter") {
            onChange(draft.trim());
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="flex-1 relative">
            <div className="flex items-center gap-1">
                <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        setIsOpen(true);
                        setSelectedIndex(0);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setSelectedIndex(0);
                    }}
                    onBlur={() => {
                        setTimeout(() => {
                            onChange(draft.trim());
                        }, 150);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full h-5 px-1.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-200 font-mono outline-none focus:border-blue-500/70"
                    placeholder={placeholder}
                />
                {draft && (
                    <button
                        type="button"
                        onClick={() => {
                            setDraft("");
                            onChange("");
                            setIsOpen(false);
                        }}
                        className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-xs shrink-0"
                    >
                        ×
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl overflow-hidden max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    <div className="px-2 py-1 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-[9px] text-zinc-400 select-none">
                        <span>Inferred AppState Fields</span>
                        <span>{filteredFields.length} available</span>
                    </div>

                    {filteredFields.length === 0 ? (
                        <div className="p-2 text-center text-zinc-500 text-[10px] italic">
                            No matching state fields
                        </div>
                    ) : (
                        filteredFields.map((field, idx) => {
                            const isHighlighted = idx === selectedIndex;
                            const badgeClass =
                                TYPE_BADGE_COLORS[field.typeName] ??
                                "bg-zinc-800 text-zinc-300 border-zinc-700";

                            return (
                                <button
                                    key={`${field.fullPath}_${field.sourceNodeId}`}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(field);
                                    }}
                                    onMouseEnter={() => setSelectedIndex(idx)}
                                    className={`w-full px-2 py-1 text-left flex items-center justify-between gap-1 transition-colors ${
                                        isHighlighted
                                            ? "bg-blue-600/25 border-l-2 border-blue-500"
                                            : "hover:bg-zinc-800/70"
                                    }`}
                                >
                                    <div className="flex flex-col truncate">
                                        <span className="font-mono text-[10px] text-zinc-200 truncate">
                                            {field.fullPath}
                                        </span>
                                        <span className="text-[9px] text-zinc-500 truncate">
                                            {field.isImplicit
                                                ? `implicit #${field.sourceNodeId}`
                                                : `bound #${field.sourceNodeId}`}
                                        </span>
                                    </div>
                                    <span
                                        className={`px-1 py-0.2 rounded border text-[9px] font-mono shrink-0 ${badgeClass}`}
                                    >
                                        {field.typeName}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};

