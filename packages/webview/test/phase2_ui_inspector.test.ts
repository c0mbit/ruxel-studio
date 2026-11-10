import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetNode } from "@ruxel/shared-types";
import { validateWidgetTree } from "../src/utils/schemaValidator.ts";
import { isContainerWidget } from "../src/utils/widgetFactory.ts";
import { insertChild, isDescendant, findNodeById } from "../src/utils/treeTraversal.ts";

test("Directive 3: Schema Validation detects missing required on_press on Button", () => {
    const root: WidgetNode = {
        id: "root",
        widget_type: "v_box",
        children: [
            {
                id: "btn_1",
                widget_type: "button",
                properties: { text: "Submit" },
                // Missing events / on_press
            },
        ],
    };

    const errors = validateWidgetTree(root);
    assert.equal(errors.has("btn_1"), true);
    const btnErrors = errors.get("btn_1")!;
    assert.equal(btnErrors.length, 1);
    assert.equal(btnErrors[0].property, "on_press");
    assert.equal(btnErrors[0].message, "Missing required property: on_press");
});

test("Directive 3: Schema Validation passes when Button has on_click or custom on_press", () => {
    const root: WidgetNode = {
        id: "root",
        widget_type: "v_box",
        children: [
            {
                id: "btn_valid",
                widget_type: "button",
                properties: { text: "Click Me" },
                events: {
                    on_click: { handler_name: "handle_click" },
                },
            },
        ],
    };

    const errors = validateWidgetTree(root);
    assert.equal(errors.has("btn_valid"), false);
});

test("Directive 3: Schema Validation detects missing required image_path and custom_type", () => {
    const root: WidgetNode = {
        id: "root",
        widget_type: "v_box",
        children: [
            {
                id: "img_empty",
                widget_type: "image",
                properties: {},
            },
            {
                id: "generic_empty",
                widget_type: "generic_widget",
                properties: {},
            },
        ],
    };

    const errors = validateWidgetTree(root);
    assert.equal(errors.has("img_empty"), true);
    assert.equal(errors.get("img_empty")![0].message, "Missing required property: image_path");

    assert.equal(errors.has("generic_empty"), true);
    assert.equal(errors.get("generic_empty")![0].message, "Missing required property: custom_type");
});

test("Directive 2: isContainerWidget accurately recognizes deep containers and generic_widget", () => {
    assert.equal(isContainerWidget("v_box"), true);
    assert.equal(isContainerWidget("h_box"), true);
    assert.equal(isContainerWidget("grid"), true);
    assert.equal(isContainerWidget("border_pane"), true);
    assert.equal(isContainerWidget("generic_widget"), true);
    assert.equal(isContainerWidget("conditional_node"), true);

    assert.equal(isContainerWidget("button"), false);
    assert.equal(isContainerWidget("label"), false);
    assert.equal(isContainerWidget("slider"), false);
    assert.equal(isContainerWidget("text_input"), false);
});

test("Directive 2: Deep Nesting - insertChild accurately nests inside deeply nested container", () => {
    const root: WidgetNode = {
        id: "root",
        widget_type: "v_box",
        children: [
            {
                id: "row_container",
                widget_type: "h_box",
                children: [
                    {
                        id: "inner_col",
                        widget_type: "v_box",
                        children: [],
                    },
                ],
            },
        ],
    };

    const newBtn: WidgetNode = {
        id: "nested_btn",
        widget_type: "button",
        properties: { text: "Deep Child" },
        events: { on_click: { handler_name: "test" } },
    };

    const updated = insertChild(root, "inner_col", newBtn);
    const innerCol = findNodeById(updated, "inner_col");
    assert.ok(innerCol);
    assert.equal(innerCol.children?.length, 1);
    assert.equal(innerCol.children[0].id, "nested_btn");
});

test("Directive 2: isDescendant prevents cyclic reparenting", () => {
    const root: WidgetNode = {
        id: "root",
        widget_type: "v_box",
        children: [
            {
                id: "parent_box",
                widget_type: "h_box",
                children: [
                    {
                        id: "child_box",
                        widget_type: "v_box",
                        children: [],
                    },
                ],
            },
        ],
    };

    assert.equal(isDescendant(root, "parent_box", "child_box"), true);
    assert.equal(isDescendant(root, "child_box", "parent_box"), false);
    assert.equal(isDescendant(root, "parent_box", "parent_box"), true);
});
