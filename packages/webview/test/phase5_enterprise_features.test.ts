import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import type { RuxDocument, WidgetNode } from "@ruxel/shared-types";
import { extractComponentFromNode } from "../src/utils/treeTraversal.ts";
import { CrdtDocumentBridge, CRDT_ORIGIN_LOCAL, CRDT_ORIGIN_REMOTE } from "../src/crdt/crdtBridge.ts";

test("Directive 2: extractComponentFromNode creates custom_component and registers in doc.components", () => {
    const originalDoc: RuxDocument = {
        metadata: { name: "TestApp", version: "0.1.0" },
        window: { title: "Test Window", width: 800, height: 600, resizable: true },
        assets: { fonts: [], icons: [], images: [], models3d: [] },
        theme: { active_theme: "default_dark", custom_palettes: [] },
        root: {
            id: "root_container",
            widget_type: "v_box",
            children: [
                {
                    id: "nav_header",
                    widget_type: "h_box",
                    properties: { spacing: 12 },
                    children: [
                        {
                            id: "title_label",
                            widget_type: "label",
                            properties: { text: "Navigation Bar" },
                        },
                    ],
                },
                {
                    id: "main_body",
                    widget_type: "v_box",
                    children: [
                        {
                            id: "body_text",
                            widget_type: "label",
                            properties: { text: "Hello World" },
                        },
                    ],
                },
            ],
        },
    };

    const extractionResult = extractComponentFromNode(originalDoc, "nav_header", "CustomNavBar");
    assert.ok(extractionResult);
    const updatedDoc = extractionResult.doc;

    // 1. Verify doc.components has CustomNavBar registered
    assert.ok(updatedDoc.components);
    assert.ok(updatedDoc.components["CustomNavBar"]);
    const compDef = updatedDoc.components["CustomNavBar"];
    assert.equal(compDef.name, "CustomNavBar");
    assert.equal(compDef.root.id, "nav_header");
    assert.equal(compDef.root.widget_type, "h_box");

    // 2. Verify root_container's child was replaced with custom_component instance
    const firstChild = updatedDoc.root.children![0];
    assert.equal(firstChild.id, "custom_nav_bar_inst");
    assert.equal(firstChild.widget_type, "custom_component");
    assert.equal((firstChild.properties as any).custom_type, "CustomNavBar");
    assert.equal((firstChild.properties as any).raw_args, "CustomNavBar::new()");

    // 3. Verify sibling was completely unaffected
    const secondChild = updatedDoc.root.children![1];
    assert.equal(secondChild.id, "main_body");
});

test("Directive 3: CrdtDocumentBridge syncs document with components and preserves bidirectional fidelity", () => {
    const doc: RuxDocument = {
        metadata: { name: "CollaborativeApp", version: "1.0.0" },
        window: { title: "Collab Canvas", width: 1024, height: 768, resizable: true },
        assets: { fonts: [], icons: [], images: [], models3d: [] },
        theme: { active_theme: "default_dark", custom_palettes: [] },
        components: {
            CustomHeader: {
                name: "CustomHeader",
                root: {
                    id: "comp_root",
                    widget_type: "h_box",
                    properties: { spacing: 16, fill_width: true },
                    children: [
                        {
                            id: "comp_title",
                            widget_type: "label",
                            properties: { text: "Shared Header" },
                        },
                    ],
                },
            },
        },
        root: {
            id: "main_root",
            widget_type: "v_box",
            layout: { padding: 24, spacing: 12 },
            children: [
                {
                    id: "header_call",
                    widget_type: "custom_component",
                    properties: { custom_type: "CustomHeader", raw_args: "" },
                },
            ],
        },
    };

    const bridgeA = new CrdtDocumentBridge();
    bridgeA.syncFromLocalDocument(doc);

    // Read back to RuxDocument
    const restoredDoc = bridgeA.toRuxDocument();
    assert.ok(restoredDoc);
    assert.equal(restoredDoc.metadata.name, "CollaborativeApp");
    assert.equal(restoredDoc.root.id, "main_root");
    assert.ok(restoredDoc.components);
    assert.ok(restoredDoc.components["CustomHeader"]);
    assert.equal(restoredDoc.components["CustomHeader"].name, "CustomHeader");
});

test("Directive 3: CRDT State Vector and Delta exchange converges two independent client sessions", () => {
    const docA: RuxDocument = {
        metadata: { name: "ClientADoc", version: "0.1.0" },
        window: { title: "App", width: 800, height: 600, resizable: true },
        assets: { fonts: [], icons: [], images: [], models3d: [] },
        theme: { active_theme: "default_dark", custom_palettes: [] },
        root: {
            id: "root",
            widget_type: "v_box",
            children: [
                {
                    id: "btn_1",
                    widget_type: "button",
                    properties: { text: "Initial Text" },
                },
            ],
        },
    };

    const ydocA = new Y.Doc();
    const bridgeA = new CrdtDocumentBridge(ydocA);
    bridgeA.syncFromLocalDocument(docA);

    const ydocB = new Y.Doc();
    const bridgeB = new CrdtDocumentBridge(ydocB);

    // Initial sync from A to B via state vector and diff
    const svB = Y.encodeStateVector(ydocB);
    const diffForB = Y.encodeStateAsUpdate(ydocA, svB);
    Y.applyUpdate(ydocB, diffForB, CRDT_ORIGIN_REMOTE);

    const docB = bridgeB.toRuxDocument();
    assert.ok(docB);
    assert.equal(docB.root.children![0].properties?.text, "Initial Text");

    // Client B mutates button text in their local session
    const docBMutated: RuxDocument = {
        ...docB,
        root: {
            ...docB.root,
            children: [
                {
                    ...docB.root.children![0],
                    properties: { text: "Mutated By Peer B" },
                },
            ],
        },
    };
    bridgeB.syncFromLocalDocument(docBMutated);

    // Incremental delta from B to A
    const svA = Y.encodeStateVector(ydocA);
    const deltaForA = Y.encodeStateAsUpdate(ydocB, svA);
    Y.applyUpdate(ydocA, deltaForA, CRDT_ORIGIN_REMOTE);

    // Both sessions must now have 100% converged state
    const convergedA = bridgeA.toRuxDocument()!;
    const convergedB = bridgeB.toRuxDocument()!;
    assert.equal(convergedA.root.children![0].properties?.text, "Mutated By Peer B");
    assert.equal(convergedB.root.children![0].properties?.text, "Mutated By Peer B");
});
