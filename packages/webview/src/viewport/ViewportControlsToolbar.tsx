import { FC, useCallback } from "react";
import {
    useViewportStore,
    type DevicePreset,
    DEVICE_PRESETS,
} from "../state/viewportStore";

interface ViewportControlsToolbarProps {
    readonly className?: string;
    readonly onPresetSelected?: (preset: DevicePreset) => void;
}

export const ViewportControlsToolbar: FC<ViewportControlsToolbarProps> = ({
    className = "",
    onPresetSelected,
}) => {
    const deviceMode = useViewportStore((state) => state.deviceMode);
    const orientation = useViewportStore((state) => state.orientation);
    const customDimensions = useViewportStore((state) => state.customDimensions);
    const autoFitScale = useViewportStore((state) => state.autoFitScale);
    const previewScale = useViewportStore((state) => state.previewScale);

    const setDeviceMode = useViewportStore((state) => state.setDeviceMode);
    const toggleOrientation = useViewportStore((state) => state.toggleOrientation);
    const setCustomWidth = useViewportStore((state) => state.setCustomWidth);
    const setCustomHeight = useViewportStore((state) => state.setCustomHeight);
    const setAutoFitScale = useViewportStore((state) => state.setAutoFitScale);
    const resetToDefaultResolution = useViewportStore(
        (state) => state.resetToDefaultResolution
    );
    const getEffectiveDimensions = useViewportStore(
        (state) => state.getEffectiveDimensions
    );

    const effective = getEffectiveDimensions();

    const handleSelectPreset = useCallback(
        (preset: DevicePreset) => {
            setDeviceMode(preset);
            onPresetSelected?.(preset);
        },
        [setDeviceMode, onPresetSelected]
    );

    const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val > 0) {
            setCustomWidth(val);
        }
    };

    const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val > 0) {
            setCustomHeight(val);
        }
    };

    return (
        <div
            data-testid="viewport-controls-toolbar"
            className={`h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3 shrink-0 text-xs select-none z-20 ${className}`}
        >
            {/* Left: Device Presets Toggle Group */}
            <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-zinc-400 mr-1.5 uppercase tracking-wider flex items-center gap-1">
                    <span>📱</span>
                    <span>Preview:</span>
                </span>

                {/* Mobile Button */}
                <button
                    type="button"
                    data-testid="viewport-mode-mobile"
                    onClick={() => handleSelectPreset("mobile")}
                    className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
                        deviceMode === "mobile"
                            ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700/80 border-zinc-700/60"
                    }`}
                    title="Mobile Viewport (375x812 iPhone Standard)"
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <rect x="7" y="2" width="10" height="20" rx="2" />
                        <circle cx="12" cy="18" r="1" />
                    </svg>
                    <span>Mobile</span>
                    <span className="text-[10px] opacity-75 font-mono">
                        ({DEVICE_PRESETS.mobile.width}&times;{DEVICE_PRESETS.mobile.height})
                    </span>
                </button>

                {/* Tablet Button */}
                <button
                    type="button"
                    data-testid="viewport-mode-tablet"
                    onClick={() => handleSelectPreset("tablet")}
                    className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
                        deviceMode === "tablet"
                            ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700/80 border-zinc-700/60"
                    }`}
                    title="Tablet Viewport (768x1024 iPad Standard)"
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <rect x="4" y="3" width="16" height="18" rx="2" />
                        <circle cx="12" cy="18" r="1" />
                    </svg>
                    <span>Tablet</span>
                    <span className="text-[10px] opacity-75 font-mono">
                        ({DEVICE_PRESETS.tablet.width}&times;{DEVICE_PRESETS.tablet.height})
                    </span>
                </button>

                {/* Desktop Button */}
                <button
                    type="button"
                    data-testid="viewport-mode-desktop"
                    onClick={() => handleSelectPreset("desktop")}
                    className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
                        deviceMode === "desktop"
                            ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700/80 border-zinc-700/60"
                    }`}
                    title="Desktop Viewport (1440x900 HD Display)"
                >
                    <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>Desktop</span>
                    <span className="text-[10px] opacity-75 font-mono">
                        ({DEVICE_PRESETS.desktop.width}&times;{DEVICE_PRESETS.desktop.height})
                    </span>
                </button>

                {/* Responsive / Custom Button */}
                <button
                    type="button"
                    data-testid="viewport-mode-responsive"
                    onClick={() => handleSelectPreset("responsive")}
                    className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 border transition-all ${
                        deviceMode === "responsive"
                            ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                            : "bg-zinc-800/80 text-zinc-300 hover:text-white hover:bg-zinc-700/80 border-zinc-700/60"
                    }`}
                    title="Responsive / Custom Fluid Viewport (Draggable Handles)"
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
                            d="M8 7h8m-8 5h8m-8 5h8M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"
                        />
                    </svg>
                    <span>Responsive / Custom</span>
                </button>
            </div>

            {/* Center: Dimensions Display & Editing / Rotation */}
            <div className="flex items-center gap-2">
                <div className="flex items-center bg-zinc-950/80 border border-zinc-800 rounded px-2 py-0.5 gap-1.5 font-mono text-[11px] text-zinc-300">
                    {deviceMode === "responsive" ? (
                        <div className="flex items-center gap-1">
                            <span className="text-zinc-500">W:</span>
                            <input
                                type="number"
                                data-testid="custom-width-input"
                                value={customDimensions.width}
                                onChange={handleWidthChange}
                                className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1 text-center text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                                min={280}
                                max={3840}
                            />
                            <span className="text-zinc-500">&times;</span>
                            <span className="text-zinc-500">H:</span>
                            <input
                                type="number"
                                data-testid="custom-height-input"
                                value={customDimensions.height}
                                onChange={handleHeightChange}
                                className="w-14 bg-zinc-900 border border-zinc-700/80 rounded px-1 text-center text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
                                min={200}
                                max={2560}
                            />
                            <span className="text-zinc-500">px</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400 font-sans font-medium capitalize">
                                {deviceMode}
                            </span>
                            <span className="text-blue-400 font-bold">
                                {effective.width} &times; {effective.height} px
                            </span>
                        </div>
                    )}
                </div>

                {/* Rotate Orientation Toggle */}
                {deviceMode !== "responsive" && (
                    <button
                        type="button"
                        data-testid="toggle-orientation"
                        onClick={toggleOrientation}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700/60 transition-colors flex items-center gap-1"
                        title={`Toggle Orientation (Currently ${orientation})`}
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
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        <span className="capitalize">{orientation}</span>
                    </button>
                )}
            </div>

            {/* Right: Scaling & Auto-Fit Indicator */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    data-testid="toggle-auto-fit"
                    onClick={() => setAutoFitScale(!autoFitScale)}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors flex items-center gap-1 ${
                        autoFitScale
                            ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-400 font-medium"
                            : "bg-zinc-800/80 border-zinc-700/60 text-zinc-400"
                    }`}
                    title="Scale preview proportionally to fit webview physical bounds"
                >
                    <span>🔍</span>
                    <span>Auto-Fit: {autoFitScale ? "ON" : "OFF"}</span>
                </button>

                {previewScale < 0.999 && (
                    <span
                        data-testid="preview-scale-badge"
                        className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-amber-400 font-mono text-[10px]"
                        title="Proportional scale applied to fit VS Code panel bounds"
                    >
                        Scaled: {Math.round(previewScale * 100)}%
                    </span>
                )}

                {deviceMode === "responsive" && (
                    <button
                        type="button"
                        data-testid="reset-resolution"
                        onClick={() => resetToDefaultResolution(1200, 800)}
                        className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs border border-zinc-700/60 transition-colors"
                        title="Reset custom viewport to standard dimensions (1200x800)"
                    >
                        Reset
                    </button>
                )}
            </div>
        </div>
    );
};
