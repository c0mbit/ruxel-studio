import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type {
    PeerPresence,
    RoomConnectionStatus,
    SyncServerConfig,
} from "@ruxel/shared-types";
import { CRDT_ORIGIN_LOCAL, CRDT_ORIGIN_REMOTE, CrdtDocumentBridge } from "./crdtBridge";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export class CrdtSyncClient {
    private readonly bridge: CrdtDocumentBridge;
    private readonly ydoc: Y.Doc;
    private readonly awareness: awarenessProtocol.Awareness;
    private ws: WebSocket | null = null;
    private status: RoomConnectionStatus = "disconnected";
    private statusListener: ((status: RoomConnectionStatus) => void) | null = null;
    private peersListener: ((peers: readonly PeerPresence[]) => void) | null = null;
    private activeConfig: SyncServerConfig | null = null;
    private reconnectTimer: number | null = null;

    constructor(bridge: CrdtDocumentBridge) {
        this.bridge = bridge;
        this.ydoc = bridge.getYDoc();
        this.awareness = new awarenessProtocol.Awareness(this.ydoc);

        this.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
            if (origin !== CRDT_ORIGIN_REMOTE && this.ws && this.ws.readyState === WebSocket.OPEN) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_SYNC);
                syncProtocol.writeUpdate(encoder, update);
                this.ws.send(encoding.toUint8Array(encoder));
            }
        });

        this.awareness.on(
            "update",
            ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
                const changedClients = added.concat(updated).concat(removed);
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
                    encoding.writeVarUint8Array(
                        encoder,
                        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
                    );
                    this.ws.send(encoding.toUint8Array(encoder));
                }
                this.notifyPeersChanged();
            }
        );
    }

    public getStatus(): RoomConnectionStatus {
        return this.status;
    }

    public onStatusChange(listener: (status: RoomConnectionStatus) => void): void {
        this.statusListener = listener;
    }

    public onPeersChange(listener: (peers: readonly PeerPresence[]) => void): void {
        this.peersListener = listener;
    }

    public connect(config: SyncServerConfig): void {
        this.disconnect();
        this.activeConfig = config;
        this.setStatus("connecting");

        this.awareness.setLocalState({
            userId: `${this.ydoc.clientID}`,
            userName: config.userName,
            userColor: config.userColor,
            cursor: null,
            selectedNodeId: null,
            lastActive: Date.now(),
        });

        try {
            const url = new URL(config.serverUrl);
            url.searchParams.set("room", config.roomId);
            url.searchParams.set("user", config.userName);
            url.searchParams.set("color", encodeURIComponent(config.userColor));

            const ws = new WebSocket(url.toString());
            ws.binaryType = "arraybuffer";
            this.ws = ws;

            ws.onopen = () => {
                this.setStatus("connected");
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_SYNC);
                syncProtocol.writeSyncStep1(encoder, this.ydoc);
                ws.send(encoding.toUint8Array(encoder));

                const awarenessEncoder = encoding.createEncoder();
                encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
                encoding.writeVarUint8Array(
                    awarenessEncoder,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])
                );
                ws.send(encoding.toUint8Array(awarenessEncoder));
            };

            ws.onmessage = (event: MessageEvent) => {
                this.handleIncomingMessage(new Uint8Array(event.data));
            };

            ws.onerror = () => {
                this.setStatus("error");
            };

            ws.onclose = () => {
                this.setStatus("disconnected");
                this.notifyPeersChanged();
            };
        } catch {
            this.setStatus("error");
        }
    }

    public disconnect(): void {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.setStatus("disconnected");
        this.awareness.setLocalState(null);
        this.notifyPeersChanged();
    }

    public updateCursor(x: number, y: number): void {
        const current = this.awareness.getLocalState() as Record<string, unknown> | null;
        if (current) {
            this.awareness.setLocalStateField("cursor", { x, y });
            this.awareness.setLocalStateField("lastActive", Date.now());
        }
    }

    public clearCursor(): void {
        const current = this.awareness.getLocalState() as Record<string, unknown> | null;
        if (current) {
            this.awareness.setLocalStateField("cursor", null);
        }
    }

    public updateSelection(selectedNodeId: string | null): void {
        const current = this.awareness.getLocalState() as Record<string, unknown> | null;
        if (current) {
            this.awareness.setLocalStateField("selectedNodeId", selectedNodeId);
            this.awareness.setLocalStateField("lastActive", Date.now());
        }
    }

    private handleIncomingMessage(data: Uint8Array): void {
        try {
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);

            if (messageType === MESSAGE_SYNC) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, this.ydoc, CRDT_ORIGIN_REMOTE);

                if (encoding.length(encoder) > 1 && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(encoding.toUint8Array(encoder));
                }
            } else if (messageType === MESSAGE_AWARENESS) {
                const awarenessUpdate = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(this.awareness, awarenessUpdate, CRDT_ORIGIN_REMOTE);
                this.notifyPeersChanged();
            }
        } catch {
            return;
        }
    }

    private setStatus(status: RoomConnectionStatus): void {
        this.status = status;
        if (this.statusListener) {
            this.statusListener(status);
        }
    }

    private notifyPeersChanged(): void {
        if (!this.peersListener) {
            return;
        }
        const peers: PeerPresence[] = [];
        this.awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
            if (clientId === this.ydoc.clientID) {
                return;
            }
            if (state && typeof state === "object") {
                const userName = (state.userName as string) || `Peer-${clientId}`;
                const userColor = (state.userColor as string) || "#3b82f6";
                const userId = (state.userId as string) || String(clientId);
                const cursor = (state.cursor as { x: number; y: number } | null) ?? null;
                const selectedNodeId = (state.selectedNodeId as string | null) ?? null;
                const lastActive = (state.lastActive as number) || Date.now();

                peers.push({
                    clientId,
                    userId,
                    userName,
                    userColor,
                    cursor,
                    selectedNodeId,
                    lastActive,
                });
            }
        });
        this.peersListener(peers);
    }
}

