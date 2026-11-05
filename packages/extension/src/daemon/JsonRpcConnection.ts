import type { ChildProcess } from "child_process";
import type { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from "@ruxel/shared-types";

interface PendingRequest {
    readonly resolve: (result: unknown) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
}

export class JsonRpcConnection {
    private nextId: number = 1;
    private readonly pendingRequests: Map<string | number, PendingRequest> = new Map();
    private readonly notificationHandlers: Map<
        string,
        Set<(params: unknown) => void>
    > = new Map();
    private buffer: string = "";
    private isDisposed: boolean = false;

    constructor(private readonly process: ChildProcess) {
        this.setupProcessListeners();
    }

    private setupProcessListeners(): void {
        this.process.stdout?.on("data", (chunk: Buffer) => {
            this.handleData(chunk.toString("utf-8"));
        });

        this.process.stderr?.on("data", (chunk: Buffer) => {
            const message = chunk.toString("utf-8").trim();
            if (message.length > 0) {
                console.error(`[rux-daemon stderr] ${message}`);
            }
        });

        this.process.on("error", (error: Error) => {
            this.rejectAllPending(new Error(`Daemon process error: ${error.message}`));
        });

        this.process.on("close", (code: number | null) => {
            this.rejectAllPending(new Error(`Daemon process exited with code ${code}`));
        });
    }

    private handleData(chunk: string): void {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0) {
                continue;
            }
            try {
                const message = JSON.parse(trimmed) as {
                    id?: string | number;
                    method?: string;
                    params?: unknown;
                    result?: unknown;
                    error?: JsonRpcError;
                };

                if (message.id !== undefined && message.id !== null) {
                    this.handleResponse(message as JsonRpcResponse);
                } else if (message.method) {
                    this.handleNotification(message.method, message.params);
                }
            } catch (error) {
                console.error(`Failed to parse daemon JSON-RPC response: ${trimmed}`, error);
            }
        }
    }

    private handleResponse(response: JsonRpcResponse): void {
        const id = response.id;
        const pending = this.pendingRequests.get(id);
        if (!pending) {
            return;
        }

        this.pendingRequests.delete(id);
        clearTimeout(pending.timer);

        if (response.error) {
            pending.reject(
                new Error(
                    `Daemon JSON-RPC error [${response.error.code}]: ${response.error.message}`
                )
            );
        } else {
            pending.resolve(response.result);
        }
    }

    private handleNotification(method: string, params: unknown): void {
        const handlers = this.notificationHandlers.get(method);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(params);
                } catch (err) {
                    console.error(`Error in notification handler for ${method}:`, err);
                }
            }
        }
    }

    public onNotification<T>(method: string, handler: (params: T) => void): () => void {
        let handlers = this.notificationHandlers.get(method);
        if (!handlers) {
            handlers = new Set();
            this.notificationHandlers.set(method, handlers);
        }
        const castHandler = handler as (params: unknown) => void;
        handlers.add(castHandler);

        return () => {
            const current = this.notificationHandlers.get(method);
            if (current) {
                current.delete(castHandler);
                if (current.size === 0) {
                    this.notificationHandlers.delete(method);
                }
            }
        };
    }

    public sendRequest<TResult, TParams = unknown>(
        method: string,
        params?: TParams,
        timeoutMs: number = 10000
    ): Promise<TResult> {
        if (this.isDisposed) {
            return Promise.reject(new Error("JsonRpcConnection is already disposed"));
        }

        const id = this.nextId++;
        const request: JsonRpcRequest<TParams> = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };

        return new Promise<TResult>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(
                    new Error(
                        `Daemon JSON-RPC request '${method}' with id ${id} timed out after ${timeoutMs}ms`
                    )
                );
            }, timeoutMs);

            this.pendingRequests.set(id, {
                resolve: resolve as (result: unknown) => void,
                reject,
                timer,
            });

            const serialized = JSON.stringify(request) + "\n";
            const stdin = this.process.stdin;
            if (!stdin || !stdin.writable) {
                clearTimeout(timer);
                this.pendingRequests.delete(id);
                reject(new Error("Daemon process stdin is not writable"));
                return;
            }

            stdin.write(serialized, "utf-8", (error) => {
                if (error) {
                    clearTimeout(timer);
                    this.pendingRequests.delete(id);
                    reject(error);
                }
            });
        });
    }

    private rejectAllPending(error: Error): void {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pendingRequests.clear();
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.notificationHandlers.clear();
        this.rejectAllPending(new Error("Connection disposed"));
        this.buffer = "";
    }
}
