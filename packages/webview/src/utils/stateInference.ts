import type { RuxDocument, WidgetNode } from "@ruxel/shared-types";

export type InferredStateTypeName =
    | "String"
    | "bool"
    | "f64"
    | "Option<String>"
    | "Vec<String>";

export interface InferredStateField {
    readonly name: string;
    readonly fullPath: string;
    readonly typeName: InferredStateTypeName;
    readonly sourceNodeId: string;
    readonly isImplicit: boolean;
}

export interface InferredEventHandlerSuggestion {
    readonly handlerName: string;
    readonly messageVariant: string;
    readonly eventKind: string;
    readonly payloadType: "Unit" | "String" | "bool" | "f64";
}

export function toSnakeCase(input: string): string {
    const raw = input.startsWith("app_state.")
        ? input.slice("app_state.".length)
        : input.startsWith("state.")
        ? input.slice("state.".length)
        : input;

    return raw
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .toLowerCase()
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export function toPascalCase(input: string): string {
    return input
        .split(/[^a-zA-Z0-9]/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join("");
}

export function inferDocumentStateFields(
    doc: RuxDocument | null
): readonly InferredStateField[] {
    if (!doc) {
        return [];
    }

    const fields: InferredStateField[] = [];
    const seenNames = new Set<string>();

    function traverseNode(node: WidgetNode) {
        collectExplicitBindings(node);
        collectImplicitControlState(node);

        if (node.children) {
            for (const child of node.children) {
                traverseNode(child);
            }
        }
    }

    function collectExplicitBindings(node: WidgetNode) {
        const bindings = node.bindings;
        if (!bindings) {
            return;
        }

        if (bindings.value) {
            const fieldName = toSnakeCase(bindings.value);
            if (fieldName && !seenNames.has(fieldName)) {
                seenNames.add(fieldName);
                let typeName: InferredStateTypeName = "String";
                if (
                    node.widget_type === "checkbox" ||
                    node.widget_type === "radio_button"
                ) {
                    typeName = "bool";
                } else if (
                    node.widget_type === "slider" ||
                    node.widget_type === "progress_bar"
                ) {
                    typeName = "f64";
                } else if (node.widget_type === "combo_box") {
                    typeName = "Option<String>";
                } else if (
                    node.widget_type === "table_view" ||
                    node.widget_type === "tree_view"
                ) {
                    typeName = "Vec<String>";
                }

                fields.push({
                    name: fieldName,
                    fullPath: `app_state.${fieldName}`,
                    typeName,
                    sourceNodeId: node.id,
                    isImplicit: false,
                });
            }
        }

        if (bindings.items) {
            const fieldName = toSnakeCase(bindings.items);
            if (fieldName && !seenNames.has(fieldName)) {
                seenNames.add(fieldName);
                fields.push({
                    name: fieldName,
                    fullPath: `app_state.${fieldName}`,
                    typeName: "Vec<String>",
                    sourceNodeId: node.id,
                    isImplicit: false,
                });
            }
        }

        if (bindings.selected) {
            const fieldName = toSnakeCase(bindings.selected);
            if (fieldName && !seenNames.has(fieldName)) {
                seenNames.add(fieldName);
                fields.push({
                    name: fieldName,
                    fullPath: `app_state.${fieldName}`,
                    typeName: "Option<String>",
                    sourceNodeId: node.id,
                    isImplicit: false,
                });
            }
        }

        if (bindings.disabled) {
            const fieldName = toSnakeCase(bindings.disabled);
            if (fieldName && !seenNames.has(fieldName)) {
                seenNames.add(fieldName);
                fields.push({
                    name: fieldName,
                    fullPath: `app_state.${fieldName}`,
                    typeName: "bool",
                    sourceNodeId: node.id,
                    isImplicit: false,
                });
            }
        }

        if (bindings.visible) {
            const fieldName = toSnakeCase(bindings.visible);
            if (fieldName && !seenNames.has(fieldName)) {
                seenNames.add(fieldName);
                fields.push({
                    name: fieldName,
                    fullPath: `app_state.${fieldName}`,
                    typeName: "bool",
                    sourceNodeId: node.id,
                    isImplicit: false,
                });
            }
        }

        if (bindings.custom_bindings) {
            for (const [key, val] of Object.entries(bindings.custom_bindings)) {
                const fieldName = toSnakeCase(val);
                if (fieldName && !seenNames.has(fieldName)) {
                    seenNames.add(fieldName);
                    const keyLower = key.toLowerCase();
                    let typeName: InferredStateTypeName = "String";
                    if (
                        keyLower.includes("visible") ||
                        keyLower.includes("enabled") ||
                        keyLower.includes("active") ||
                        keyLower.includes("checked")
                    ) {
                        typeName = "bool";
                    } else if (
                        keyLower.includes("count") ||
                        keyLower.includes("amount") ||
                        keyLower.includes("index")
                    ) {
                        typeName = "f64";
                    }

                    fields.push({
                        name: fieldName,
                        fullPath: `app_state.${fieldName}`,
                        typeName,
                        sourceNodeId: node.id,
                        isImplicit: false,
                    });
                }
            }
        }
    }

    function collectImplicitControlState(node: WidgetNode) {
        if (node.bindings?.value) {
            return;
        }

        const name = toSnakeCase(node.id);
        if (!name || seenNames.has(name)) {
            return;
        }

        switch (node.widget_type) {
            case "text_input":
                seenNames.add(name);
                fields.push({
                    name,
                    fullPath: `app_state.${name}`,
                    typeName: "String",
                    sourceNodeId: node.id,
                    isImplicit: true,
                });
                break;
            case "checkbox":
            case "radio_button":
                seenNames.add(name);
                fields.push({
                    name,
                    fullPath: `app_state.${name}`,
                    typeName: "bool",
                    sourceNodeId: node.id,
                    isImplicit: true,
                });
                break;
            case "slider":
            case "progress_bar":
                seenNames.add(name);
                fields.push({
                    name,
                    fullPath: `app_state.${name}`,
                    typeName: "f64",
                    sourceNodeId: node.id,
                    isImplicit: true,
                });
                break;
            case "combo_box":
                seenNames.add(name);
                fields.push({
                    name,
                    fullPath: `app_state.${name}`,
                    typeName: "Option<String>",
                    sourceNodeId: node.id,
                    isImplicit: true,
                });
                break;
            case "table_view":
            case "tree_view":
                seenNames.add(name);
                fields.push({
                    name,
                    fullPath: `app_state.${name}`,
                    typeName: "Vec<String>",
                    sourceNodeId: node.id,
                    isImplicit: true,
                });
                break;
            default:
                break;
        }
    }

    traverseNode(doc.root);
    return fields;
}

export function suggestEventForNode(
    node: WidgetNode,
    eventKind: string
): InferredEventHandlerSuggestion {
    const rawKind = eventKind.startsWith("on_") ? eventKind.slice(3) : eventKind;
    const baseId = node.id.replace(/[^a-zA-Z0-9_]/g, "_");
    const handlerName = `on_${baseId}_${rawKind}`;
    const messageVariant = toPascalCase(`${baseId}_${rawKind}`);

    let payloadType: "Unit" | "String" | "bool" | "f64" = "Unit";
    if (eventKind === "on_change") {
        if (
            node.widget_type === "checkbox" ||
            node.widget_type === "radio_button"
        ) {
            payloadType = "bool";
        } else if (
            node.widget_type === "slider" ||
            node.widget_type === "progress_bar"
        ) {
            payloadType = "f64";
        } else {
            payloadType = "String";
        }
    }

    return {
        handlerName,
        messageVariant,
        eventKind,
        payloadType,
    };
}

