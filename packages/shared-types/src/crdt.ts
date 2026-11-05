import type { WidgetNode } from "./widget";

export const SYNC_MESSAGE_SYNC_STEP_1 = 0;
export const SYNC_MESSAGE_SYNC_STEP_2 = 1;
export const SYNC_MESSAGE_UPDATE = 2;
export const MESSAGE_AWARENESS = 3;

export type SyncMessageType =
    | typeof SYNC_MESSAGE_SYNC_STEP_1
    | typeof SYNC_MESSAGE_SYNC_STEP_2
    | typeof SYNC_MESSAGE_UPDATE;

export interface PeerCursor {
    readonly x: number;
    readonly y: number;
}

export interface PeerPresence {
    readonly clientId: number;
    readonly userId: string;
    readonly userName: string;
    readonly userColor: string;
    readonly cursor: PeerCursor | null;
    readonly selectedNodeId: string | null;
    readonly lastActive: number;
}

export interface TeamPreset {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly category: string;
    readonly author: string;
    readonly createdAt: string;
    readonly rootNode: WidgetNode;
    readonly tags: readonly string[];
}

export interface CreateTeamPresetRequest {
    readonly name: string;
    readonly description?: string;
    readonly category?: string;
    readonly author?: string;
    readonly rootNode: WidgetNode;
    readonly tags?: readonly string[];
}

export type RoomConnectionStatus =
    | "disconnected"
    | "connecting"
    | "connected"
    | "error";

export interface SyncServerConfig {
    readonly serverUrl: string;
    readonly roomId: string;
    readonly userName: string;
    readonly userColor: string;
}

