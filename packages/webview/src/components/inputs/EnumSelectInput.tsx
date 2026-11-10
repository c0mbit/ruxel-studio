import React from "react";

export interface EnumOption<T extends string = string> {
    readonly value: T;
    readonly label: string;
    readonly description?: string;
}

export interface EnumSelectInputProps<T extends string = string> {
    readonly value?: T;
    readonly options: readonly (EnumOption<T> | T)[];
    readonly onChange: (value: T) => void;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly className?: string;
}

export function EnumSelectInput<T extends string = string>({
    value,
    options,
    onChange,
    placeholder = "Select...",
    disabled = false,
    className = "",
}: EnumSelectInputProps<T>): React.ReactElement {
    const normalizedOptions: readonly EnumOption<T>[] = options.map((opt) => {
        if (typeof opt === "string") {
            const formattedLabel = opt
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase());
            return { value: opt as T, label: formattedLabel };
        }
        return opt;
    });

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value as T);
    };

    return (
        <div className={`relative flex-1 ${className}`}>
            <select
                value={value ?? ""}
                disabled={disabled}
                onChange={handleChange}
                className="w-full h-6 pl-2 pr-6 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 outline-none focus:border-blue-500/70 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer hover:border-zinc-600 transition-colors"
            >
                {placeholder && !value && (
                    <option value="" disabled>
                        {placeholder}
                    </option>
                )}
                {normalizedOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200">
                        {opt.label}
                    </option>
                ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 text-[10px]">
                ▼
            </div>
        </div>
    );
}
