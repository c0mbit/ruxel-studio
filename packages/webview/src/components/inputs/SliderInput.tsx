import React, { FC, useCallback } from "react";

export interface SliderInputProps {
    readonly value?: number;
    readonly onChange: (value: number) => void;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly unit?: string;
    readonly disabled?: boolean;
    readonly className?: string;
}

export const SliderInput: FC<SliderInputProps> = ({
    value = 0,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    unit = "",
    disabled = false,
    className = "",
}) => {
    const clampedValue = Math.min(Math.max(value, min), max);

    const handleSliderChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = parseFloat(e.target.value);
            if (!isNaN(raw)) {
                const clamped = Math.min(Math.max(raw, min), max);
                onChange(clamped);
            }
        },
        [onChange, min, max]
    );

    const handleNumberChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = parseFloat(e.target.value);
            if (!isNaN(raw)) {
                const clamped = Math.min(Math.max(raw, min), max);
                onChange(clamped);
            }
        },
        [onChange, min, max]
    );

    const percentage = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;

    return (
        <div className={`flex items-center gap-2 flex-1 w-full ${className}`}>
            <div className="relative flex-1 flex items-center">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={clampedValue}
                    disabled={disabled}
                    onChange={handleSliderChange}
                    style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #3f3f46 ${percentage}%, #3f3f46 100%)`,
                    }}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-900 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-blue-300 transition-all"
                />
            </div>

            <div className="relative flex items-center shrink-0 w-16">
                <input
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={clampedValue}
                    disabled={disabled}
                    onChange={handleNumberChange}
                    className="w-full h-6 px-1.5 pr-5 text-right rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-200 outline-none focus:border-blue-500/70 disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {unit && (
                    <span className="absolute right-1 text-[10px] text-zinc-500 pointer-events-none select-none font-mono">
                        {unit}
                    </span>
                )}
            </div>
        </div>
    );
};
