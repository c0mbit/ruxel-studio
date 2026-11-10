import React, { FC, useRef, useCallback } from "react";

export interface ColorPickerInputProps {
    readonly value?: string;
    readonly onChange: (color: string) => void;
    readonly onClear?: () => void;
    readonly disabled?: boolean;
    readonly label?: string;
    readonly placeholder?: string;
}

const PRESET_SWATCHES = [
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Rose
    "#8b5cf6", // Purple
    "#06b6d4", // Cyan
    "#ffffff", // White
    "#18181b", // Zinc 900
];

function normalizeToHex(color?: string): string {
    if (!color) return "#3b82f6";
    if (color.startsWith("#")) {
        if (color.length === 4) {
            return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        }
        if (color.length === 7) return color;
        if (color.length > 7) return color.slice(0, 7);
    }
    return "#3b82f6";
}

export const ColorPickerInput: FC<ColorPickerInputProps> = ({
    value,
    onChange,
    onClear,
    disabled = false,
    placeholder = "#000000",
}) => {
    const hiddenColorInputRef = useRef<HTMLInputElement>(null);

    const handleSwatchClick = useCallback(() => {
        if (disabled) return;
        hiddenColorInputRef.current?.click();
    }, [disabled]);

    const handleNativeColorChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
        },
        [onChange]
    );

    const handleTextChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
        },
        [onChange]
    );

    const isCustomValue = Boolean(value);
    const hexForPicker = normalizeToHex(value);

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex items-center gap-1.5 w-full">
                {/* Visual Swatch */}
                <div
                    onClick={handleSwatchClick}
                    title="Click to open color palette"
                    style={{
                        backgroundColor: isCustomValue ? value : "transparent",
                    }}
                    className={`relative w-6 h-6 rounded border shrink-0 cursor-pointer transition-all shadow-xs overflow-hidden ${
                        disabled
                            ? "opacity-50 cursor-not-allowed border-zinc-800"
                            : "border-zinc-700 hover:border-blue-500 hover:scale-105"
                    }`}
                >
                    {!isCustomValue && (
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,#27272a_25%,transparent_25%),linear-gradient(-45deg,#27272a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#27272a_75%),linear-gradient(-45deg,transparent_75%,#27272a_75%)] bg-[size:6px_6px] bg-[position:0_0,0_3px,3px_-3px,-3px_0]" />
                    )}
                    <input
                        ref={hiddenColorInputRef}
                        type="color"
                        value={hexForPicker}
                        disabled={disabled}
                        onChange={handleNativeColorChange}
                        className="sr-only"
                    />
                </div>

                {/* Direct Hex/Color Text Field */}
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={value ?? ""}
                        placeholder={placeholder}
                        disabled={disabled}
                        onChange={handleTextChange}
                        className="w-full h-6 px-2 pr-6 rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-200 outline-none focus:border-blue-500/70 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-600"
                    />
                    {isCustomValue && onClear && !disabled && (
                        <button
                            type="button"
                            onClick={onClear}
                            title="Reset color"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-zinc-800"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Swatch Palette */}
            {!disabled && (
                <div className="flex items-center gap-1 mt-0.5">
                    {PRESET_SWATCHES.map((swatch) => (
                        <button
                            key={swatch}
                            type="button"
                            onClick={() => onChange(swatch)}
                            title={`Apply ${swatch}`}
                            style={{ backgroundColor: swatch }}
                            className={`w-3.5 h-3.5 rounded-full border border-zinc-700/60 hover:scale-125 transition-transform shrink-0 ${
                                value?.toLowerCase() === swatch.toLowerCase()
                                    ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-zinc-900"
                                    : ""
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
