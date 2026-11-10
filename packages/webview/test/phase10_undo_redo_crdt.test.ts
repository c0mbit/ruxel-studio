import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import type { RuxDocument } from "@ruxel/shared-types";
import {
    CrdtDocumentBridge,
    sharedCrdtBridge,
    CRDT_ORIGIN_LOCAL,
    CRDT_ORIGIN_REMOTE,
    CRDT_ORIGIN_INIT,
    uint8ArrayToBase64,
    base64ToUint8Array,
} from "../src/crdt/crdtBridge.ts";
import { useHistoryStore } from "../src/state/historyStore.ts";
import { useEditorStore } from "../src/state/editorStore.ts";

function createStarterDocument(): RuxDocument {
    return {
        metadata: { name: "UndoRedoCollabApp", version: "0.1.0" },
        window: { title: "Collaborative Canvas", width: 800, height: 600, resizable: true },
        assets: { fonts: [], icons: [], images: [], models3d: [] },
        theme: { active_theme: "default_dark", custom_palettes: [] },
        root: {
            id: "root_container",
            widget_type: "v_box",
            properties: { spacing: 8 },
            children: [],
        },
    };
}

test("Directive 1: Zustand History Store initializes bound to Y.UndoManager with empty stacks", () => {
    const bridge = new CrdtDocumentBridge();
    bridge.syncFromLocalDocument(createStarterDocument(), CRDT_ORIGIN_INIT);

    useHistoryStore.getState().bindUndoManager(bridge.getUndoManager(), bridge);
    useHistoryStore.getState().clear();

    const state = useHistoryStore.getState();
    assert.equal(state.canUndo, false, "canUndo must be false on initial document load");
    assert.equal(state.canRedo, false, "canRedo must be false on initial document load");
    assert.equal(state.undoStack.length, 0, "undoStack must be empty");
    assert.equal(state.redoStack.length, 0, "redoStack must be empty");
    assert.ok(state.undoManager instanceof Y.UndoManager, "undoManager must be an instance of Y.UndoManager");
});

test("Directive 1: Local document mutations are captured by Y.UndoManager and enable canUndo", () => {
    const bridge = new CrdtDocumentBridge();
    const doc = createStarterDocument();
    bridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);

    useHistoryStore.getState().bindUndoManager(bridge.getUndoManager(), bridge);
    useHistoryStore.getState().clear();

    assert.equal(useHistoryStore.getState().canUndo, false);

    // Perform a local user edit: append a button
    useHistoryStore.getState().stopCapturing();
    const mutatedDoc: RuxDocument = {
        ...doc,
        root: {
            ...doc.root,
            children: [
                {
                    id: "btn_action_1",
                    widget_type: "button",
                    properties: { text: "Action Button 1" },
                },
            ],
        },
    };
    bridge.syncFromLocalDocument(mutatedDoc, CRDT_ORIGIN_LOCAL);

    const stateAfterEdit = useHistoryStore.getState();
    assert.equal(stateAfterEdit.canUndo, true, "canUndo must become true after local user edit");
    assert.equal(stateAfterEdit.canRedo, false, "canRedo must remain false until an undo occurs");
    assert.equal(stateAfterEdit.undoStack.length, 1, "undoStack must contain exactly 1 stack item");
});

test("Directive 1 & 2: undo() reverts local change, updates UI canUndo/canRedo flags and synchronizes editorStore", () => {
    const doc = createStarterDocument();
    useEditorStore.getState().setInitialDocument(JSON.stringify(doc), doc, false, false);

    useHistoryStore.getState().bindUndoManager(sharedCrdtBridge.getUndoManager(), sharedCrdtBridge);
    useHistoryStore.getState().clear();

    useHistoryStore.getState().stopCapturing();
    const mutatedDoc: RuxDocument = {
        ...doc,
        root: {
            ...doc.root,
            children: [
                {
                    id: "btn_primary",
                    widget_type: "button",
                    properties: { text: "Confirm Purchase" },
                },
            ],
        },
    };
    sharedCrdtBridge.syncFromLocalDocument(mutatedDoc, CRDT_ORIGIN_LOCAL);
    useHistoryStore.getState().stopCapturing();

    // Verify document in bridge before undo
    const beforeUndo = sharedCrdtBridge.toRuxDocument();
    assert.ok(beforeUndo);
    assert.equal(beforeUndo.root.children?.length, 1);
    assert.equal(beforeUndo.root.children?.[0].id, "btn_primary");

    // Execute Undo
    const poppedItem = useHistoryStore.getState().undo();
    assert.ok(poppedItem, "undo() must return the popped stack item");

    // Verify UI state flags
    const stateAfterUndo = useHistoryStore.getState();
    assert.equal(stateAfterUndo.canUndo, false, "canUndo must be false after reverting the only change");
    assert.equal(stateAfterUndo.canRedo, true, "canRedo must be true after undo");
    assert.equal(stateAfterUndo.undoStack.length, 0);
    assert.equal(stateAfterUndo.redoStack.length, 1);

    // Verify CRDT document reverted
    const afterUndoDoc = sharedCrdtBridge.toRuxDocument();
    assert.ok(afterUndoDoc);
    assert.equal(afterUndoDoc.root.children?.length ?? 0, 0, "Button must be removed by undo");

    // Verify editorStore updated synchronously
    const editorDoc = useEditorStore.getState().document;
    assert.ok(editorDoc);
    assert.equal(editorDoc.root.children?.length ?? 0, 0, "useEditorStore must mirror undone state");
});

test("Directive 1 & 2: redo() restores the reverted change and updates state flags", () => {
    const bridge = new CrdtDocumentBridge();
    const doc = createStarterDocument();
    bridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);

    useHistoryStore.getState().bindUndoManager(bridge.getUndoManager(), bridge);
    useHistoryStore.getState().clear();

    useHistoryStore.getState().stopCapturing();
    const mutatedDoc: RuxDocument = {
        ...doc,
        root: {
            ...doc.root,
            children: [
                {
                    id: "btn_checkout",
                    widget_type: "button",
                    properties: { text: "Checkout" },
                },
            ],
        },
    };
    bridge.syncFromLocalDocument(mutatedDoc, CRDT_ORIGIN_LOCAL);
    useHistoryStore.getState().stopCapturing();

    useHistoryStore.getState().undo();
    assert.equal(useHistoryStore.getState().canRedo, true);

    // Execute Redo
    const redoneItem = useHistoryStore.getState().redo();
    assert.ok(redoneItem, "redo() must return the restored stack item");

    const stateAfterRedo = useHistoryStore.getState();
    assert.equal(stateAfterRedo.canUndo, true, "canUndo must be restored to true after redo");
    assert.equal(stateAfterRedo.canRedo, false, "canRedo must be false once redo stack is exhausted");

    const redoneDoc = bridge.toRuxDocument();
    assert.ok(redoneDoc);
    assert.equal(redoneDoc.root.children?.length, 1);
    assert.equal(redoneDoc.root.children?.[0].id, "btn_checkout");
    assert.equal(redoneDoc.root.children?.[0].properties?.text, "Checkout");
});

test("Directive 1 & 3: Origin Isolation - Remote peer updates are NEVER captured by local UndoManager", () => {
    const bridge = new CrdtDocumentBridge();
    const doc = createStarterDocument();
    bridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);

    useHistoryStore.getState().bindUndoManager(bridge.getUndoManager(), bridge);
    useHistoryStore.getState().clear();

    assert.equal(useHistoryStore.getState().canUndo, false);

    // Simulate incoming delta from a remote WebSocket peer
    const remoteDoc: RuxDocument = {
        ...doc,
        root: {
            ...doc.root,
            children: [
                {
                    id: "remote_widget_peerB",
                    widget_type: "label",
                    properties: { text: "Peer B Label" },
                },
            ],
        },
    };
    bridge.syncFromLocalDocument(remoteDoc, CRDT_ORIGIN_REMOTE);

    // Document in CRDT now contains the remote widget
    const updatedDoc = bridge.toRuxDocument();
    assert.ok(updatedDoc);
    assert.equal(updatedDoc.root.children?.length, 1);
    assert.equal(updatedDoc.root.children?.[0].id, "remote_widget_peerB");

    // BUT local UndoManager MUST NOT track it!
    const state = useHistoryStore.getState();
    assert.equal(state.canUndo, false, "Remote transactions MUST NOT populate the local undo stack");
    assert.equal(state.undoStack.length, 0);

    // Calling undo() when only remote changes occurred must be a no-op
    const popped = state.undo();
    assert.equal(popped, null, "undo() must return null when no local changes exist");
    assert.equal(bridge.toRuxDocument()?.root.children?.length, 1, "Remote widget must remain untouched");
});

test("Guardrail 2 (CRITICAL): Multiplayer Safety - User A adds 'Button 1', User B adds 'Button 2'. User A presses Undo. AST reverts 'Button 1' but keeps 'Button 2'", () => {
    // 1. Client A initializes the shared base document
    const baseDoc = createStarterDocument();

    const ydocA = new Y.Doc();
    const bridgeA = new CrdtDocumentBridge(ydocA);
    bridgeA.syncFromLocalDocument(baseDoc, CRDT_ORIGIN_INIT);

    // 2. Client B joins the room and synchronizes the base state from Client A
    const ydocB = new Y.Doc();
    const bridgeB = new CrdtDocumentBridge(ydocB);
    Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA), CRDT_ORIGIN_INIT);

    const umA = bridgeA.getUndoManager();
    const umB = bridgeB.getUndoManager();

    // 3. User A adds "Button 1" locally
    umA.stopCapturing();
    const docA1: RuxDocument = {
        ...baseDoc,
        root: {
            ...baseDoc.root,
            children: [
                {
                    id: "btn_user_a",
                    widget_type: "button",
                    properties: { text: "Button 1" },
                },
            ],
        },
    };
    bridgeA.syncFromLocalDocument(docA1, CRDT_ORIGIN_LOCAL);
    umA.stopCapturing();

    // 4. User B adds "Button 2" locally
    umB.stopCapturing();
    const docB1: RuxDocument = {
        ...baseDoc,
        root: {
            ...baseDoc.root,
            children: [
                {
                    id: "btn_user_b",
                    widget_type: "button",
                    properties: { text: "Button 2" },
                },
            ],
        },
    };
    bridgeB.syncFromLocalDocument(docB1, CRDT_ORIGIN_LOCAL);
    umB.stopCapturing();

    // 5. Synchronize deltas bi-directionally (simulating WebSocket rux-sync-server broadcast)
    const deltaA = Y.encodeStateAsUpdate(ydocA, Y.encodeStateVector(ydocB));
    const deltaB = Y.encodeStateAsUpdate(ydocB, Y.encodeStateVector(ydocA));

    Y.applyUpdate(ydocB, deltaA, CRDT_ORIGIN_REMOTE);
    Y.applyUpdate(ydocA, deltaB, CRDT_ORIGIN_REMOTE);

    // Both documents must contain both buttons
    const syncedA = bridgeA.toRuxDocument()!;
    const syncedB = bridgeB.toRuxDocument()!;
    assert.equal(syncedA.root.children?.length, 2, "Doc A must have 2 buttons");
    assert.equal(syncedB.root.children?.length, 2, "Doc B must have 2 buttons");

    const aIds = syncedA.root.children!.map((c) => c.id);
    assert.ok(aIds.includes("btn_user_a"), "Doc A must include Button 1");
    assert.ok(aIds.includes("btn_user_b"), "Doc A must include Button 2");

    // 6. User A presses Undo!
    assert.equal(umA.canUndo(), true, "User A can undo their local Button 1");
    umA.undo();

    // CRITICAL ASSERTION: The AST on Client A must revert "Button 1" but KEEP "Button 2"!
    const afterUndoA = bridgeA.toRuxDocument()!;
    assert.equal(afterUndoA.root.children?.length, 1, "Doc A must have exactly 1 button remaining");
    assert.equal(afterUndoA.root.children?.[0].id, "btn_user_b", "Remaining button must be User B's Button 2");
    assert.equal(afterUndoA.root.children?.[0].properties?.text, "Button 2");

    // 7. User A dispatches their undo CRDT delta to User B
    const undoDeltaFromA = Y.encodeStateAsUpdate(ydocA, Y.encodeStateVector(ydocB));
    Y.applyUpdate(ydocB, undoDeltaFromA, CRDT_ORIGIN_REMOTE);

    // Client B must also have only "Button 2" remaining
    const afterSyncB = bridgeB.toRuxDocument()!;
    assert.equal(afterSyncB.root.children?.length, 1, "Doc B must have converged to 1 button");
    assert.equal(afterSyncB.root.children?.[0].id, "btn_user_b", "Doc B must keep User B's Button 2");
    assert.equal(afterSyncB.root.children?.[0].properties?.text, "Button 2");

    // User B's undo stack must still be ready to undo Button 2!
    assert.equal(umB.canUndo(), true, "User B's undo stack was not corrupted by User A's undo");
    umB.undo();

    // Now Client B reverts Button 2
    const bAfterOwnUndo = bridgeB.toRuxDocument()!;
    assert.equal(bAfterOwnUndo.root.children?.length ?? 0, 0, "User B's undo properly removes Button 2");
});

test("Guardrail 1: Fine-grained property updates undo isolation between peers", () => {
    const baseDoc: RuxDocument = {
        metadata: { name: "PropCollabApp", version: "0.1.0" },
        window: { title: "Prop Canvas", width: 800, height: 600, resizable: true },
        assets: { fonts: [], icons: [], images: [], models3d: [] },
        theme: { active_theme: "default_dark", custom_palettes: [] },
        root: {
            id: "root_vbox",
            widget_type: "v_box",
            children: [
                {
                    id: "shared_card",
                    widget_type: "card",
                    properties: { title: "Initial Title" },
                    layout: { padding: 10 },
                },
            ],
        },
    };

    const ydocA = new Y.Doc();
    const bridgeA = new CrdtDocumentBridge(ydocA);
    bridgeA.syncFromLocalDocument(baseDoc, CRDT_ORIGIN_INIT);

    const ydocB = new Y.Doc();
    const bridgeB = new CrdtDocumentBridge(ydocB);
    Y.applyUpdate(ydocB, Y.encodeStateAsUpdate(ydocA), CRDT_ORIGIN_INIT);

    const umA = bridgeA.getUndoManager();

    // User A changes properties.title = "User A Title"
    umA.stopCapturing();
    const docA_edited: RuxDocument = {
        ...baseDoc,
        root: {
            ...baseDoc.root,
            children: [
                {
                    ...baseDoc.root.children![0],
                    properties: { title: "User A Title" },
                },
            ],
        },
    };
    bridgeA.syncFromLocalDocument(docA_edited, CRDT_ORIGIN_LOCAL);
    umA.stopCapturing();

    // User B changes layout.padding = 32
    const docB_edited: RuxDocument = {
        ...baseDoc,
        root: {
            ...baseDoc.root,
            children: [
                {
                    ...baseDoc.root.children![0],
                    layout: { padding: 32 },
                },
            ],
        },
    };
    bridgeB.syncFromLocalDocument(docB_edited, CRDT_ORIGIN_LOCAL);

    // Sync B -> A
    const deltaB = Y.encodeStateAsUpdate(ydocB, Y.encodeStateVector(ydocA));
    Y.applyUpdate(ydocA, deltaB, CRDT_ORIGIN_REMOTE);

    const mergedA = bridgeA.toRuxDocument()!;
    assert.equal(mergedA.root.children![0].properties?.title, "User A Title");
    assert.equal(mergedA.root.children![0].layout?.padding, 32);

    // User A undos their title change
    umA.undo();

    const afterUndoA = bridgeA.toRuxDocument()!;
    assert.equal(afterUndoA.root.children![0].properties?.title, "Initial Title", "User A title was reverted");
    assert.equal(afterUndoA.root.children![0].layout?.padding, 32, "User B's padding mutation was preserved");
});

test("Directive 3: CRDT mutations and Undos emit binary deltas and state vectors via onLocalDelta", () => {
    const bridge = new CrdtDocumentBridge();
    const doc = createStarterDocument();
    bridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);

    const capturedDeltas: Uint8Array[] = [];
    const capturedVectors: Uint8Array[] = [];

    const unsubscribe = bridge.onLocalDelta((delta, sv) => {
        capturedDeltas.push(delta);
        capturedVectors.push(sv);
    });

    // Local mutation
    const docEdit: RuxDocument = {
        ...doc,
        root: {
            ...doc.root,
            children: [
                {
                    id: "new_slider",
                    widget_type: "slider",
                    properties: { min: 0, max: 100, value: 50 },
                },
            ],
        },
    };
    bridge.syncFromLocalDocument(docEdit, CRDT_ORIGIN_LOCAL);

    assert.ok(capturedDeltas.length >= 1, "Local edit must emit delta bytes");
    assert.ok(capturedVectors.length >= 1, "Local edit must emit state vector");

    // Base64 encoding roundtrip test
    const lastDelta = capturedDeltas[capturedDeltas.length - 1];
    const b64 = uint8ArrayToBase64(lastDelta);
    const decodedBytes = base64ToUint8Array(b64);
    assert.deepEqual(decodedBytes, lastDelta, "Base64 encoding roundtrip must be lossless");

    // Verify Undo operation ALSO emits local delta
    const countBeforeUndo = capturedDeltas.length;
    bridge.getUndoManager().undo();

    assert.ok(
        capturedDeltas.length > countBeforeUndo,
        "undo() mutation must trigger onLocalDelta to synchronize reverse-patches with daemon"
    );

    unsubscribe();
});

test("Directive 1: maxHistory bounds the undo stack properly", () => {
    const bridge = new CrdtDocumentBridge();
    const doc = createStarterDocument();
    bridge.syncFromLocalDocument(doc, CRDT_ORIGIN_INIT);

    useHistoryStore.getState().bindUndoManager(bridge.getUndoManager(), bridge);
    useHistoryStore.getState().clear();

    const maxLimit = useHistoryStore.getState().maxHistory; // 50

    // Perform maxLimit + 10 distinct mutations
    for (let i = 1; i <= maxLimit + 10; i++) {
        useHistoryStore.getState().stopCapturing();
        const mutated: RuxDocument = {
            ...doc,
            root: {
                ...doc.root,
                properties: { step: i },
            },
        };
        bridge.syncFromLocalDocument(mutated, CRDT_ORIGIN_LOCAL);
    }

    assert.equal(
        useHistoryStore.getState().undoStack.length,
        maxLimit,
        `undoStack length must be capped at maxHistory (${maxLimit})`
    );
});
