import type { WidgetNode, WidgetType } from "@ruxel/shared-types";

export interface WidgetValidationError {
    readonly nodeId: string;
    readonly widgetType: WidgetType;
    readonly property: string;
    readonly message: string;
    readonly severity: "error" | "warning";
}

function hasEventHandler(node: WidgetNode, eventName: string): boolean {
    if (!node.events) return false;
    if (eventName === "on_press" || eventName === "on_click") {
        return Boolean(
            node.events.on_click ||
            node.events.navigate ||
            node.events.custom_events?.on_press ||
            node.events.custom_events?.on_click ||
            (node.properties?.custom_properties as Record<string, unknown> | undefined)?.on_press
        );
    }
    if (eventName === "on_change") {
        return Boolean(node.events.on_change || node.events.custom_events?.on_change);
    }
    return Boolean(node.events.custom_events?.[eventName]);
}

function validateNode(
    node: WidgetNode,
    seenIds: Set<string>,
    errors: WidgetValidationError[]
): void {
    if (seenIds.has(node.id)) {
        errors.push({
            nodeId: node.id,
            widgetType: node.widget_type,
            property: "id",
            message: `Duplicate widget id: "${node.id}" detected in tree`,
            severity: "error",
        });
    } else {
        seenIds.add(node.id);
    }

    const props = node.properties ?? {};

    switch (node.widget_type) {
        case "button": {
            if (!hasEventHandler(node, "on_press")) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "on_press",
                    message: "Missing required property: on_press",
                    severity: "error",
                });
            }
            break;
        }

        case "image": {
            const hasPath = Boolean(
                props.image_path ||
                props.image_alias ||
                (props.custom_properties as Record<string, unknown> | undefined)?.image_path
            );
            if (!hasPath) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "image_path",
                    message: "Missing required property: image_path",
                    severity: "error",
                });
            }
            break;
        }

        case "custom_component": {
            if (!props.custom_type?.trim()) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "custom_type",
                    message: "Missing required property: custom_type",
                    severity: "error",
                });
            }
            break;
        }

        case "generic_widget": {
            if (!props.custom_type?.trim()) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "custom_type",
                    message: "Missing required property: custom_type",
                    severity: "error",
                });
            }
            break;
        }

        case "conditional_node": {
            if (!props.condition?.trim()) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "condition",
                    message: "Missing required property: condition",
                    severity: "error",
                });
            }
            break;
        }

        case "slider": {
            const min = props.min_value ?? 0;
            const max = props.max_value ?? 100;
            if (min > max) {
                errors.push({
                    nodeId: node.id,
                    widgetType: node.widget_type,
                    property: "min_value",
                    message: `Invalid range: min (${min}) cannot exceed max (${max})`,
                    severity: "error",
                });
            }
            break;
        }

        default:
            break;
    }

    if (node.children) {
        for (const child of node.children) {
            validateNode(child, seenIds, errors);
        }
    }
}

export function validateWidgetTree(
    root: WidgetNode
): Map<string, WidgetValidationError[]> {
    const errors: WidgetValidationError[] = [];
    const seenIds = new Set<string>();

    validateNode(root, seenIds, errors);

    const resultMap = new Map<string, WidgetValidationError[]>();
    for (const err of errors) {
        const existing = resultMap.get(err.nodeId) ?? [];
        existing.push(err);
        resultMap.set(err.nodeId, existing);
    }

    return resultMap;
}
