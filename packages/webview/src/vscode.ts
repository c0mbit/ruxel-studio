import type { WebviewToExtensionMessage } from "@ruxel/shared-types";

interface VsCodeApi {
    postMessage(message: WebviewToExtensionMessage): void;
    getState<T>(): T | undefined;
    setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeApi;

class VsCodeApiWrapper implements VsCodeApi {
    private readonly api: VsCodeApi | null = null;

    constructor() {
        if (typeof acquireVsCodeApi === "function") {
            try {
                this.api = acquireVsCodeApi();
            } catch {
                this.api = null;
            }
        }
    }

    public postMessage(message: WebviewToExtensionMessage): void {
        if (this.api) {
            this.api.postMessage(message);
        } else {
            window.parent.postMessage(message, "*");
        }
    }

    public getState<T>(): T | undefined {
        if (this.api) {
            return this.api.getState<T>();
        }
        return undefined;
    }

    public setState<T>(state: T): T {
        if (this.api) {
            return this.api.setState<T>(state);
        }
        return state;
    }
}

export const vscodeApi = new VsCodeApiWrapper();

