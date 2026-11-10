import assert from "node:assert/strict";
import test from "node:test";
import { SmartDebounceController } from "../dist/editor/DebounceQueue.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("DebounceQueue: delays execution of text-buffer changes by the specified duration", async () => {
    const controller = new SmartDebounceController(50);
    const executed = [];

    controller.schedule("doc1", "first-keystroke", (payload) => {
        executed.push(payload);
    });

    assert.equal(controller.isPending("doc1"), true);
    assert.equal(controller.getPendingPayload("doc1"), "first-keystroke");
    assert.equal(executed.length, 0);

    // After 20ms, it should not have fired yet
    await sleep(20);
    assert.equal(executed.length, 0);

    // After full delay, it should have fired
    await sleep(45);
    assert.equal(executed.length, 1);
    assert.equal(executed[0], "first-keystroke");
    assert.equal(controller.isPending("doc1"), false);

    controller.dispose();
});

test("DebounceQueue: collapses rapid successive keystrokes into a single latest execution", async () => {
    const controller = new SmartDebounceController(50);
    const executed = [];

    // Simulate 5 rapid keystrokes within 20ms
    for (let i = 1; i <= 5; i++) {
        controller.schedule("doc1", `keystroke-${i}`, (payload) => {
            executed.push(payload);
        });
        await sleep(5);
    }

    assert.equal(controller.isPending("doc1"), true);
    assert.equal(controller.getPendingPayload("doc1"), "keystroke-5");
    assert.equal(executed.length, 0);

    await sleep(60);

    // Only keystroke-5 should have fired!
    assert.equal(executed.length, 1);
    assert.equal(executed[0], "keystroke-5");
    assert.equal(controller.isPending("doc1"), false);

    controller.dispose();
});

test("DebounceQueue: RACE CONDITION PREVENTION - Canvas visual change cancels pending text keystrokes instantly", async () => {
    const controller = new SmartDebounceController(50);
    const textEditorUpdates = [];
    const canvasInstantUpdates = [];

    // Step 1: User types in text editor
    controller.schedule("file:///app.rux", "keystroke-draft-from-code", (text) => {
        textEditorUpdates.push(text);
    });

    assert.equal(controller.isPending("file:///app.rux"), true);

    // Step 2: 15ms later, user drags a slider in Canvas (instant visual mutation)
    await sleep(15);
    
    // Canvas-to-Code sync: must be instant and MUST cancel pending text debounces!
    const cancelled = controller.cancel("file:///app.rux");
    assert.equal(cancelled, true);
    assert.equal(controller.isPending("file:///app.rux"), false);

    // Canvas update applies immediately
    canvasInstantUpdates.push("slider-value-42");

    // Step 3: Wait for original debounce duration to expire
    await sleep(60);

    // The outdated text-editor draft MUST NOT have executed!
    assert.equal(textEditorUpdates.length, 0, "Outdated keystroke must be dropped");
    assert.equal(canvasInstantUpdates.length, 1, "Canvas mutation remains authoritative");
    assert.equal(canvasInstantUpdates[0], "slider-value-42");

    controller.dispose();
});

test("DebounceQueue: flush immediately executes pending task without waiting", async () => {
    const controller = new SmartDebounceController(100);
    const executed = [];

    controller.schedule("doc1", "must-save-now", (payload) => {
        executed.push(payload);
    });

    assert.equal(executed.length, 0);
    controller.flush("doc1");

    assert.equal(executed.length, 1);
    assert.equal(executed[0], "must-save-now");
    assert.equal(controller.isPending("doc1"), false);

    // Wait to verify timer doesn't fire a second time
    await sleep(120);
    assert.equal(executed.length, 1);

    controller.dispose();
});

test("DebounceQueue: manages multiple documents independently without cross-talk", async () => {
    const controller = new SmartDebounceController(40);
    const executed = [];

    controller.schedule("docA", "updateA", (p) => executed.push(`A:${p}`));
    controller.schedule("docB", "updateB", (p) => executed.push(`B:${p}`));

    assert.equal(controller.isPending("docA"), true);
    assert.equal(controller.isPending("docB"), true);

    // Cancel docA (e.g. canvas mutation on docA)
    controller.cancel("docA");
    assert.equal(controller.isPending("docA"), false);
    assert.equal(controller.isPending("docB"), true);

    await sleep(55);

    assert.equal(executed.length, 1);
    assert.equal(executed[0], "B:updateB");

    controller.dispose();
});

test("DebounceQueue: dispose halts all pending timers and prevents leaks", async () => {
    const controller = new SmartDebounceController(30);
    const executed = [];

    controller.schedule("doc1", "val1", (p) => executed.push(p));
    controller.schedule("doc2", "val2", (p) => executed.push(p));

    controller.dispose();
    assert.equal(controller.isPending("doc1"), false);
    assert.equal(controller.isPending("doc2"), false);

    // Scheduling after dispose is a no-op
    const rev = controller.schedule("doc3", "val3", (p) => executed.push(p));
    assert.equal(rev, -1);

    await sleep(40);
    assert.equal(executed.length, 0);
});

test("DebounceQueue: CRDT delta dispatch applies visual mutations instantly and drops stale text buffers", async () => {
    const textDebouncer = new SmartDebounceController(50);
    const crdtDeltaDebouncer = new SmartDebounceController(20);
    const textBufferApplies = [];
    const crdtDeltaDispatches = [];

    // User is typing slowly in VSCode text buffer
    textDebouncer.schedule("file:///crdt_app.rux", '{"root":{"id":"old_text"}}', (text) => {
        textBufferApplies.push(text);
    });

    assert.equal(textDebouncer.isPending("file:///crdt_app.rux"), true);

    // Concurrently, user drags a node in Canvas, generating rapid CRDT deltas
    await sleep(10);

    // Visual CRDT mutation arrives -> cancels text debouncer immediately
    textDebouncer.cancel("file:///crdt_app.rux");
    assert.equal(textDebouncer.isPending("file:///crdt_app.rux"), false);

    // Delta 1 scheduled
    crdtDeltaDebouncer.schedule("file:///crdt_app.rux", "delta_base64_v1", (delta) => {
        crdtDeltaDispatches.push(delta);
    });

    // Rapid follow-up visual drag delta 2
    await sleep(5);
    crdtDeltaDebouncer.schedule("file:///crdt_app.rux", "delta_base64_v2", (delta) => {
        crdtDeltaDispatches.push(delta);
    });

    // Wait for crdt debounce delay (20ms) to fire
    await sleep(35);
    assert.equal(crdtDeltaDispatches.length, 1);
    assert.equal(crdtDeltaDispatches[0], "delta_base64_v2");

    // Wait for text buffer delay to pass
    await sleep(40);
    assert.equal(textBufferApplies.length, 0, "Stale text keystroke was completely dropped");

    textDebouncer.dispose();
    crdtDeltaDebouncer.dispose();
});

