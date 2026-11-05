import type { RuxDocument } from "@ruxel/shared-types";

export interface Command {
    readonly id: string;
    readonly description: string;
    readonly timestamp: number;
    execute(): void;
    undo(): void;
    redo(): void;
}

export class DocumentMutationCommand implements Command {
    public readonly id: string;
    public readonly timestamp: number;

    constructor(
        public readonly description: string,
        private readonly beforeDoc: RuxDocument,
        private readonly afterDoc: RuxDocument,
        private readonly applyDoc: (doc: RuxDocument, summary: string) => void
    ) {
        this.id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.timestamp = Date.now();
    }

    public execute(): void {
        this.applyDoc(this.afterDoc, this.description);
    }

    public undo(): void {
        this.applyDoc(this.beforeDoc, `Undo: ${this.description}`);
    }

    public redo(): void {
        this.applyDoc(this.afterDoc, `Redo: ${this.description}`);
    }
}

