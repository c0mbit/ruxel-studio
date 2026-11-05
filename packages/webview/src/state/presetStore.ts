import { create } from "zustand";
import type { TeamPreset, CreateTeamPresetRequest } from "@ruxel/shared-types";

function getHttpApiUrl(): string {
    return "http://127.0.0.1:4040/api/presets";
}

export interface PresetState {
    readonly presets: readonly TeamPreset[];
    readonly isLoading: boolean;
    readonly error: string | null;
    readonly isSavePresetModalOpen: boolean;

    readonly setIsSavePresetModalOpen: (isOpen: boolean) => void;
    readonly fetchPresets: () => Promise<void>;
    readonly savePreset: (request: CreateTeamPresetRequest) => Promise<TeamPreset | null>;
    readonly deletePreset: (id: string) => Promise<boolean>;
}

export const usePresetStore = create<PresetState>((set) => ({
    presets: [],
    isLoading: false,
    error: null,
    isSavePresetModalOpen: false,

    setIsSavePresetModalOpen: (isSavePresetModalOpen) =>
        set({ isSavePresetModalOpen }),

    fetchPresets: async () => {
        set({ isLoading: true, error: null });
        try {
            const resp = await fetch(getHttpApiUrl());
            if (!resp.ok) {
                throw new Error(`Failed to fetch presets: ${resp.status}`);
            }
            const data: TeamPreset[] = await resp.json();
            set({ presets: data, isLoading: false });
        } catch (err) {
            set({
                error: err instanceof Error ? err.message : "Failed to load presets",
                isLoading: false,
            });
        }
    },

    savePreset: async (request: CreateTeamPresetRequest) => {
        set({ isLoading: true, error: null });
        try {
            const resp = await fetch(getHttpApiUrl(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });
            if (!resp.ok) {
                throw new Error(`Failed to save preset: ${resp.status}`);
            }
            const created: TeamPreset = await resp.json();
            set((state) => ({
                presets: [created, ...state.presets],
                isLoading: false,
                isSavePresetModalOpen: false,
            }));
            return created;
        } catch (err) {
            set({
                error: err instanceof Error ? err.message : "Failed to save preset",
                isLoading: false,
            });
            return null;
        }
    },

    deletePreset: async (id: string) => {
        try {
            const resp = await fetch(`${getHttpApiUrl()}/${id}`, {
                method: "DELETE",
            });
            if (!resp.ok) {
                return false;
            }
            set((state) => ({
                presets: state.presets.filter((p) => p.id !== id),
            }));
            return true;
        } catch {
            return false;
        }
    },
}));

