import { FC } from "react";
import { useCrdtStore } from "../state/crdtStore";

const COLOR_SWATCHES = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
];

export const MultiplayerModal: FC = () => {
    const isMultiplayerModalOpen = useCrdtStore(
        (state) => state.isMultiplayerModalOpen
    );
    const setIsMultiplayerModalOpen = useCrdtStore(
        (state) => state.setIsMultiplayerModalOpen
    );
    const connectionStatus = useCrdtStore((state) => state.connectionStatus);
    const serverUrl = useCrdtStore((state) => state.serverUrl);
    const setServerUrl = useCrdtStore((state) => state.setServerUrl);
    const roomId = useCrdtStore((state) => state.roomId);
    const setRoomId = useCrdtStore((state) => state.setRoomId);
    const userName = useCrdtStore((state) => state.userName);
    const setUserName = useCrdtStore((state) => state.setUserName);
    const userColor = useCrdtStore((state) => state.userColor);
    const setUserColor = useCrdtStore((state) => state.setUserColor);
    const peers = useCrdtStore((state) => state.peers);
    const connect = useCrdtStore((state) => state.connect);
    const disconnect = useCrdtStore((state) => state.disconnect);

    if (!isMultiplayerModalOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none">
            <div className="w-[520px] rounded-lg bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
                <header className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">🌐</span>
                        <div>
                            <h2 className="text-sm font-semibold text-zinc-100">
                                Multiplayer Collaboration (CRDT)
                            </h2>
                            <p className="text-xs text-zinc-400">
                                Real-time conflict-free collaborative editing
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsMultiplayerModalOpen(false)}
                        className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </header>

                <div className="p-5 space-y-4 text-xs">
                    <div>
                        <label className="block text-zinc-300 font-medium mb-1">
                            WebSocket Sync Server URL
                        </label>
                        <input
                            type="text"
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            disabled={connectionStatus === "connected"}
                            className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-zinc-300 font-medium mb-1">
                                Document Room ID
                            </label>
                            <input
                                type="text"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                disabled={connectionStatus === "connected"}
                                className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-zinc-300 font-medium mb-1">
                                Display Name
                            </label>
                            <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                className="w-full h-8 px-2.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-200 outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-zinc-300 font-medium mb-1.5">
                            Presence Color
                        </label>
                        <div className="flex items-center gap-2">
                            {COLOR_SWATCHES.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setUserColor(color)}
                                    className={`w-6 h-6 rounded-full transition-transform ${
                                        userColor === color
                                            ? "ring-2 ring-white scale-110"
                                            : "opacity-80 hover:opacity-100"
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="pt-2">
                        {connectionStatus === "connected" ? (
                            <button
                                type="button"
                                onClick={disconnect}
                                className="w-full h-9 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors"
                            >
                                Disconnect from Room
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => connect()}
                                disabled={connectionStatus === "connecting"}
                                className="w-full h-9 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
                            >
                                {connectionStatus === "connecting"
                                    ? "Connecting..."
                                    : "Connect to Collaboration Room"}
                            </button>
                        )}
                    </div>

                    {connectionStatus === "connected" && (
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                                Active Collaborators ({peers.length + 1})
                            </h3>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                <div className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/80">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: userColor }}
                                        />
                                        <span className="font-medium text-zinc-200">
                                            {userName}
                                        </span>
                                        <span className="text-[10px] text-blue-400 bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800/60">
                                            You
                                        </span>
                                    </div>
                                    <span className="text-zinc-500 text-[11px] font-mono">
                                        Broadcasting
                                    </span>
                                </div>

                                {peers.map((peer) => (
                                    <div
                                        key={peer.clientId}
                                        className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/80"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: peer.userColor }}
                                            />
                                            <span className="font-medium text-zinc-200">
                                                {peer.userName}
                                            </span>
                                            {peer.selectedNodeId && (
                                                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">
                                                    {peer.selectedNodeId}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-emerald-400 text-[11px] flex items-center gap-1 font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                            Active
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

