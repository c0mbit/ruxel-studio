import { create } from "zustand";
import type {
    PeerPresence,
    RoomConnectionStatus,
    SyncServerConfig,
} from "@ruxel/shared-types";
import { CrdtDocumentBridge } from "../crdt/crdtBridge";
import { CrdtSyncClient } from "../crdt/crdtSyncClient";

const DEFAULT_SERVER_URL = "ws://127.0.0.1:4040/ws";

const PALETTE_COLORS = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
];

function getRandomColor(): string {
    const index = Math.floor(Math.random() * PALETTE_COLORS.length);
    return PALETTE_COLORS[index];
}

function getRandomUserName(): string {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `Developer-${randomSuffix}`;
}

export const sharedCrdtBridge = new CrdtDocumentBridge();
export const sharedCrdtClient = new CrdtSyncClient(sharedCrdtBridge);

export interface CrdtState {
    readonly connectionStatus: RoomConnectionStatus;
    readonly serverUrl: string;
    readonly roomId: string;
    readonly userName: string;
    readonly userColor: string;
    readonly peers: readonly PeerPresence[];
    readonly isMultiplayerModalOpen: boolean;

    readonly setServerUrl: (url: string) => void;
    readonly setRoomId: (roomId: string) => void;
    readonly setUserName: (name: string) => void;
    readonly setUserColor: (color: string) => void;
    readonly setIsMultiplayerModalOpen: (isOpen: boolean) => void;
    readonly connect: (overrideConfig?: Partial<SyncServerConfig>) => void;
    readonly disconnect: () => void;
    readonly setLocalCursor: (pos: { x: number; y: number } | null) => void;
    readonly setLocalSelection: (selectedId: string | null) => void;
}

export const useCrdtStore = create<CrdtState>((set, get) => {
    sharedCrdtClient.onStatusChange((status) => {
        set({ connectionStatus: status });
    });

    sharedCrdtClient.onPeersChange((peers) => {
        set({ peers });
    });

    return {
        connectionStatus: "disconnected",
        serverUrl: DEFAULT_SERVER_URL,
        roomId: "default-room",
        userName: getRandomUserName(),
        userColor: getRandomColor(),
        peers: [],
        isMultiplayerModalOpen: false,

        setServerUrl: (serverUrl) => set({ serverUrl }),
        setRoomId: (roomId) => set({ roomId }),
        setUserName: (userName) => set({ userName }),
        setUserColor: (userColor) => set({ userColor }),
        setIsMultiplayerModalOpen: (isMultiplayerModalOpen) =>
            set({ isMultiplayerModalOpen }),

        connect: (overrideConfig) => {
            const state = get();
            const config: SyncServerConfig = {
                serverUrl: overrideConfig?.serverUrl ?? state.serverUrl,
                roomId: overrideConfig?.roomId ?? state.roomId,
                userName: overrideConfig?.userName ?? state.userName,
                userColor: overrideConfig?.userColor ?? state.userColor,
            };
            sharedCrdtClient.connect(config);
        },

        disconnect: () => {
            sharedCrdtClient.disconnect();
        },

        setLocalCursor: (pos) => {
            if (pos) {
                sharedCrdtClient.updateCursor(pos.x, pos.y);
            } else {
                sharedCrdtClient.clearCursor();
            }
        },

        setLocalSelection: (selectedId) => {
            sharedCrdtClient.updateSelection(selectedId);
        },
    };
});

