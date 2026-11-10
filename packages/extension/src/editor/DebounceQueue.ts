export interface PendingDebounceTask<T> {
    readonly timer: NodeJS.Timeout;
    readonly payload: T;
    readonly scheduledAt: number;
    readonly revision: number;
    readonly action: (payload: T) => void | Promise<void>;
}

/**
 * SmartDebounceController manages debounced tasks with race-condition prevention.
 * Text buffer updates can be debounced (e.g. 300ms), while visual mutations
 * from the Webview Canvas can synchronously cancel pending text debounces to guarantee
 * that an older keystroke never overwrites a newer visual canvas state.
 */
export class SmartDebounceController<T = unknown> {
    private tasks: Map<string, PendingDebounceTask<T>> = new Map();
    private revisionCounter: number = 0;
    private isDisposed: boolean = false;

    constructor(private readonly defaultDelayMs: number = 300) {}

    /**
     * Schedules a debounced task under a specific key (e.g. document URI).
     * If a task under that key is already pending, its timer is cleared and rescheduled.
     */
    public schedule(
        key: string,
        payload: T,
        action: (payload: T) => void | Promise<void>,
        delayMs: number = this.defaultDelayMs
    ): number {
        if (this.isDisposed) {
            return -1;
        }

        this.cancel(key);

        this.revisionCounter++;
        const currentRevision = this.revisionCounter;

        const timer = setTimeout(() => {
            const currentTask = this.tasks.get(key);
            if (!currentTask || currentTask.revision !== currentRevision || this.isDisposed) {
                return;
            }

            this.tasks.delete(key);
            try {
                void currentTask.action(currentTask.payload);
            } catch (err) {
                console.error(`Error executing debounced task for ${key}:`, err);
            }
        }, delayMs);

        this.tasks.set(key, {
            timer,
            payload,
            scheduledAt: Date.now(),
            revision: currentRevision,
            action,
        });

        return currentRevision;
    }

    /**
     * Instantly cancels any pending debounced task under the specified key.
     * Crucial for preventing race conditions when an instant Canvas visual change arrives.
     */
    public cancel(key: string): boolean {
        const task = this.tasks.get(key);
        if (task) {
            clearTimeout(task.timer);
            this.tasks.delete(key);
            return true;
        }
        return false;
    }

    /**
     * Cancels all pending debounced tasks.
     */
    public cancelAll(): void {
        for (const [key, task] of this.tasks.entries()) {
            clearTimeout(task.timer);
        }
        this.tasks.clear();
    }

    /**
     * Immediately executes any pending task under key and clears it.
     */
    public flush(key: string): void {
        const task = this.tasks.get(key);
        if (task && !this.isDisposed) {
            clearTimeout(task.timer);
            this.tasks.delete(key);
            void task.action(task.payload);
        }
    }

    /**
     * Checks whether a task is currently pending for key.
     */
    public isPending(key: string): boolean {
        return this.tasks.has(key);
    }

    /**
     * Returns the pending payload if available.
     */
    public getPendingPayload(key: string): T | undefined {
        return this.tasks.get(key)?.payload;
    }

    /**
     * Cleans up all pending timers and prevents new tasks.
     */
    public dispose(): void {
        this.isDisposed = true;
        this.cancelAll();
    }
}
