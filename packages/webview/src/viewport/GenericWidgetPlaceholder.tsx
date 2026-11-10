import React, { FC, ReactNode } from "react";
import type { WidgetNode } from "@ruxel/shared-types";

export interface GenericWidgetPlaceholderProps {
    readonly node: WidgetNode;
    readonly children?: ReactNode;
    readonly isSelected?: boolean;
}

export const GenericWidgetPlaceholder: FC<GenericWidgetPlaceholderProps> = ({
    node,
    children,
    isSelected = false,
}) => {
    const customType = node.properties?.custom_type ?? "GenericWidget";
    const rawArgs = node.properties?.raw_args;
    const hasChildren = Boolean(children);

    return (
        <div
            className={`min-w-[140px] rounded-md border transition-all flex flex-col overflow-hidden text-xs ${
                isSelected
                    ? "border-purple-400 bg-purple-950/30 shadow-[0_0_15px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/50"
                    : "border-purple-500/50 bg-purple-950/20 hover:border-purple-400/80 hover:bg-purple-950/25 shadow-md"
            }`}
        >
            {/* Header with Type and AST Tag */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-purple-900/40 border-b border-purple-500/30 select-none">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-purple-200">
                    <span className="text-purple-400 text-sm">⚡</span>
                    <span className="text-white truncate max-w-[180px]" title={customType}>
                        {customType}
                    </span>
                </div>
                <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono text-[9px] border border-purple-500/30 shrink-0">
                    Macro
                </span>
            </div>

            {/* Content / Raw Arguments */}
            <div className="p-2 flex flex-col gap-1.5">
                {rawArgs ? (
                    <div className="bg-black/60 border border-purple-500/20 rounded p-1.5 font-mono text-[11px] text-purple-200/90 break-all select-text">
                        <div className="text-[9px] uppercase tracking-wider text-purple-400/70 font-sans font-semibold mb-0.5">
                            Args
                        </div>
                        <code>{rawArgs}</code>
                    </div>
                ) : (
                    <div className="text-[10px] text-purple-300/60 font-mono italic">
                        No explicit arguments provided
                    </div>
                )}

                {/* Nested Children Slot */}
                {hasChildren && (
                    <div className="mt-1 pt-1 border-t border-purple-500/20 flex flex-col gap-1">
                        <div className="text-[9px] text-purple-400/80 font-mono flex items-center gap-1">
                            <span>↳</span>
                            <span>Nested Children</span>
                        </div>
                        <div className="pl-1">
                            {children}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
