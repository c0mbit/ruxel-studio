import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    readonly nodeId: string;
    readonly children: ReactNode;
}

interface State {
    readonly hasError: boolean;
    readonly error: Error | null;
}

export class WidgetErrorBoundary extends Component<Props, State> {
    public override state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error(`[WidgetErrorBoundary] Error in widget #${this.props.nodeId}:`, error, errorInfo);
    }

    public override render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="p-2 border border-red-500/80 bg-red-950/40 text-red-200 rounded text-xs font-mono flex flex-col gap-1 shadow-lg backdrop-blur-xs">
                    <div className="flex items-center gap-1 font-semibold text-red-400">
                        <span>⚠️</span>
                        <span>Widget #{this.props.nodeId} Rendering Error</span>
                    </div>
                    <div className="text-[10px] text-red-300/80 truncate">
                        {this.state.error?.message ?? "An unexpected rendering error occurred"}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
