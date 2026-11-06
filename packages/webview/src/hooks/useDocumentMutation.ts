import { useCallback } from "react";
import {
    type RuxDocument,
    type WidgetNode,
    serializeRuxDocument,
} from "@ruxel/shared-types";
import { DocumentMutationCommand } from "../history/types";
import { useEditorStore } from "../state/editorStore";
import { useHistoryStore } from "../state/historyStore";

interface DocumentMutationActions {
    readonly executeDocumentMutation: (
        description: string,
        mutator: (doc: RuxDocument) => RuxDocument
    ) => void;
    readonly executeNodeMutation: (
        description: string,
        rootMutator: (root: WidgetNode) => WidgetNode
    ) => void;
}

export function useDocumentMutation(
    onDocumentChange?: (rawText: string, summary?: string) => void
): DocumentMutationActions {
    const pushCommand = useHistoryStore((state) => state.pushCommand);

    const executeDocumentMutation = useCallback(
        (description: string, mutator: (doc: RuxDocument) => RuxDocument) => {
            const currentDoc = useEditorStore.getState().document;
            if (!currentDoc) {
                return;
            }

            const updatedDoc = mutator(currentDoc);

            const applyDoc = (docToApply: RuxDocument, summary: string) => {
                const updatedJson = serializeRuxDocument(docToApply);
                useEditorStore.getState().setRawText(updatedJson);
                onDocumentChange?.(updatedJson, summary);
            };

            const command = new DocumentMutationCommand(
                description,
                currentDoc,
                updatedDoc,
                applyDoc
            );

            pushCommand(command);
            command.execute();
        },
        [pushCommand, onDocumentChange]
    );

    const executeNodeMutation = useCallback(
        (description: string, rootMutator: (root: WidgetNode) => WidgetNode) => {
            executeDocumentMutation(description, (doc) => ({
                ...doc,
                root: rootMutator(doc.root),
            }));
        },
        [executeDocumentMutation]
    );

    return { executeDocumentMutation, executeNodeMutation };
}

