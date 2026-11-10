use rux_ast::document::RuxDocument;
use rux_ast::widget::{WidgetNode, WidgetType};

use crate::error::CodegenError;
use crate::events::{BoundEvent, EventCollector, EventPayloadType};
use crate::sanitizer::to_snake_case;
use crate::state::{InferredField, StateDefaultValue, StateInferenceEngine, StateType};

pub fn generate_go_ui_code(doc: &RuxDocument) -> Result<String, CodegenError> {
    let fields = StateInferenceEngine::infer_document(doc);
    let events = EventCollector::collect_document(doc);

    let mut out = String::new();
    out.push_str("package main\n\n");
    out.push_str("import (\n");
    out.push_str("\t_ \"embed\"\n");
    out.push_str("\t\"fmt\"\n");
    out.push_str("\t\"fyne.io/fyne/v2\"\n");
    out.push_str("\t\"fyne.io/fyne/v2/canvas\"\n");
    out.push_str("\t\"fyne.io/fyne/v2/container\"\n");
    out.push_str("\t\"fyne.io/fyne/v2/widget\"\n");
    out.push_str(")\n\n");

    let mut image_assets = Vec::new();
    collect_image_assets(&doc.root, &mut image_assets);
    for (path, alias) in &image_assets {
        out.push_str(&format!("//go:embed {}\nvar asset_{} []byte\n\n", path, alias));
    }

    generate_go_app_state(&mut out, &fields);
    generate_go_messages(&mut out, &events);
    generate_go_handler_interface(&mut out, &events);
    generate_go_widget_ids(&mut out, doc);
    generate_go_view_builder(&mut out, doc, &events);

    Ok(out)
}

fn collect_image_assets<'a>(node: &'a WidgetNode, list: &mut Vec<(&'a str, String)>) {
    if node.widget_type == WidgetType::Image {
        let path = node.properties.image_path.as_deref().unwrap_or("assets/image.png");
        let alias = to_snake_case(&node.id);
        list.push((path, alias));
    } else if let Some(path) = node.properties.image_path.as_deref().or_else(|| {
        node.properties.custom_properties.get("image_path").and_then(|v| v.as_str())
    }) {
        let alias = to_snake_case(&node.id);
        list.push((path, alias));
    }
    for child in &node.children {
        collect_image_assets(child, list);
    }
}

fn to_pascal_case(input: &str) -> String {
    input
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

fn generate_go_app_state(out: &mut String, fields: &[InferredField]) {
    out.push_str("type AppState struct {\n");
    for f in fields {
        let field_name = to_pascal_case(&f.name);
        let go_type = match f.field_type {
            StateType::String => "string",
            StateType::Bool => "bool",
            StateType::F64 => "float64",
            StateType::OptionString => "*string",
            StateType::VecString => "[]string",
        };
        out.push_str(&format!("\t{} {}\n", field_name, go_type));
    }
    out.push_str("}\n\n");

    out.push_str("func NewAppState() *AppState {\n");
    out.push_str("\treturn &AppState{\n");
    for f in fields {
        let field_name = to_pascal_case(&f.name);
        match &f.default_value {
            StateDefaultValue::String(val) => {
                out.push_str(&format!("\t\t{}: \"{}\",\n", field_name, val));
            }
            StateDefaultValue::Bool(val) => {
                out.push_str(&format!("\t\t{}: {},\n", field_name, val));
            }
            StateDefaultValue::F64(val) => {
                out.push_str(&format!("\t\t{}: {:.1},\n", field_name, val));
            }
            StateDefaultValue::OptionString(opt) => match opt {
                Some(val) => {
                    out.push_str(&format!(
                        "\t\t{}: func(s string) *string {{ return &s }}(\"{}\"),\n",
                        field_name, val
                    ));
                }
                None => {
                    out.push_str(&format!("\t\t{}: nil,\n", field_name));
                }
            },
            StateDefaultValue::VecString(items) => {
                if items.is_empty() {
                    out.push_str(&format!("\t\t{}: []string{{}},\n", field_name));
                } else {
                    let formatted = items
                        .iter()
                        .map(|it| format!("\"{}\"", it))
                        .collect::<Vec<_>>()
                        .join(", ");
                    out.push_str(&format!("\t\t{}: []string{{{}}},\n", field_name, formatted));
                }
            }
        }
    }
    out.push_str("\t}\n");
    out.push_str("}\n\n");
}

fn generate_go_messages(out: &mut String, events: &[BoundEvent]) {
    out.push_str("type UiMessageType string\n\n");
    out.push_str("const (\n");
    for ev in events {
        out.push_str(&format!(
            "\tMsg{} UiMessageType = \"{}\"\n",
            ev.message_variant, ev.message_variant
        ));
    }
    out.push_str(")\n\n");

    out.push_str("type UiMessage struct {\n");
    out.push_str("\tType    UiMessageType\n");
    out.push_str("\tPayload any\n");
    out.push_str("}\n\n");
}

fn generate_go_handler_interface(out: &mut String, events: &[BoundEvent]) {
    out.push_str("type UiHandler interface {\n");
    for ev in events {
        let method_name = to_pascal_case(&ev.handler_name);
        match ev.payload_type {
            EventPayloadType::Unit => {
                out.push_str(&format!("\t{}(state *AppState)\n", method_name));
            }
            EventPayloadType::String => {
                out.push_str(&format!("\t{}(state *AppState, value string)\n", method_name));
            }
            EventPayloadType::Bool => {
                out.push_str(&format!("\t{}(state *AppState, checked bool)\n", method_name));
            }
            EventPayloadType::F64 => {
                out.push_str(&format!("\t{}(state *AppState, value float64)\n", method_name));
            }
        }
    }
    out.push_str("\tDispatch(state *AppState, msg UiMessage)\n");
    out.push_str("}\n\n");
}

fn generate_go_widget_ids(out: &mut String, doc: &RuxDocument) {
    let mut ids: Vec<String> = Vec::new();
    collect_ids(&doc.root, &mut ids);

    out.push_str("type WidgetId string\n\n");
    out.push_str("const (\n");
    for id in &ids {
        let const_name = to_pascal_case(id);
        out.push_str(&format!("\tId{} WidgetId = \"{}\"\n", const_name, id));
    }
    out.push_str(")\n\n");
}

fn collect_ids(node: &WidgetNode, ids: &mut Vec<String>) {
    ids.push(node.id.clone());
    for child in &node.children {
        collect_ids(child, ids);
    }
}

fn generate_go_view_builder(out: &mut String, doc: &RuxDocument, events: &[BoundEvent]) {
    out.push_str("func BuildView(window fyne.Window, state *AppState, handler UiHandler) fyne.CanvasObject {\n");
    let mut counter = 0;
    let root_var = generate_node_go_expr(out, &doc.root, events, &mut counter);
    out.push_str(&format!("\treturn {}\n", root_var));
    out.push_str("}\n\n");
}

fn generate_node_go_expr(
    out: &mut String,
    node: &WidgetNode,
    events: &[BoundEvent],
    counter: &mut usize,
) -> String {
    *counter += 1;
    let var_name = format!("w{}", counter);

    let text_val = if let Some(key) = &node.properties.text_key {
        format!("i18n.Get(\"{}\")", key)
    } else if let Some(binding) = &node.bindings.value {
        let field = to_pascal_case(&to_snake_case(binding));
        format!("fmt.Sprintf(\"%v\", state.{})", field)
    } else if let Some(t) = &node.properties.text {
        format!("\"{}\"", t)
    } else {
        "\"\"".to_string()
    };

    match node.widget_type {
        WidgetType::Button => {
            let nav_target = node
                .events
                .on_click
                .as_ref()
                .and_then(|e| e.navigate_to.as_ref())
                .or(node.events.navigate.as_ref());

            let click_event = events
                .iter()
                .find(|e| e.widget_id == node.id && e.event_kind == "on_click");

            if let Some(target_screen) = nav_target {
                out.push_str(&format!(
                    "\t{} := widget.NewButton({}, func() {{\n\t\trouter.Navigate(Screen{})\n\t}})\n",
                    var_name, text_val, to_pascal_case(target_screen)
                ));
            } else if let Some(ev) = click_event {
                let method = to_pascal_case(&ev.handler_name);
                out.push_str(&format!(
                    "\t{} := widget.NewButton({}, func() {{\n\t\thandler.{}(state)\n\t}})\n",
                    var_name, text_val, method
                ));
            } else {
                out.push_str(&format!(
                    "\t{} := widget.NewButton({}, func() {{}})\n",
                    var_name, text_val
                ));
            }
        }
        WidgetType::TextInput => {
            let change_event = events
                .iter()
                .find(|e| e.widget_id == node.id && e.event_kind == "on_change");

            out.push_str(&format!("\t{} := widget.NewEntry()\n", var_name));
            out.push_str(&format!("\t{}.SetText({})\n", var_name, text_val));
            if let Some(ev) = change_event {
                let method = to_pascal_case(&ev.handler_name);
                out.push_str(&format!(
                    "\t{}.OnChanged = func(val string) {{\n\t\thandler.{}(state, val)\n\t}}\n",
                    var_name, method
                ));
            }
        }
        WidgetType::Checkbox | WidgetType::RadioButton => {
            let change_event = events
                .iter()
                .find(|e| e.widget_id == node.id && e.event_kind == "on_change");

            if let Some(ev) = change_event {
                let method = to_pascal_case(&ev.handler_name);
                out.push_str(&format!(
                    "\t{} := widget.NewCheck({}, func(b bool) {{\n\t\thandler.{}(state, b)\n\t}})\n",
                    var_name, text_val, method
                ));
            } else {
                out.push_str(&format!(
                    "\t{} := widget.NewCheck({}, func(b bool) {{}})\n",
                    var_name, text_val
                ));
            }
        }
        WidgetType::Slider => {
            let min = node.properties.min_value.unwrap_or(0.0);
            let max = node.properties.max_value.unwrap_or(100.0);
            let change_event = events
                .iter()
                .find(|e| e.widget_id == node.id && e.event_kind == "on_change");

            out.push_str(&format!(
                "\t{} := widget.NewSlider({:.1}, {:.1})\n",
                var_name, min, max
            ));
            if let Some(ev) = change_event {
                let method = to_pascal_case(&ev.handler_name);
                out.push_str(&format!(
                    "\t{}.OnChanged = func(f float64) {{\n\t\thandler.{}(state, f)\n\t}}\n",
                    var_name, method
                ));
            }
        }
        WidgetType::Label => {
            out.push_str(&format!("\t{} := widget.NewLabel({})\n", var_name, text_val));
        }
        WidgetType::DataGrid => {
            let row_count = node.properties.total_rows.unwrap_or(100);
            let col_count = if !node.properties.columns.is_empty() {
                node.properties.columns.len()
            } else {
                4
            };
            out.push_str(&format!(
                "\t{} := widget.NewTable(\n\t\tfunc() (int, int) {{ return {}, {} }},\n\t\tfunc() fyne.CanvasObject {{ return widget.NewLabel(\"Cell\") }},\n\t\tfunc(id widget.TableCellID, cell fyne.CanvasObject) {{\n\t\t\tcell.(*widget.Label).SetText(fmt.Sprintf(\"R%d:C%d\", id.Row, id.Col))\n\t\t}},\n\t)\n",
                var_name, row_count, col_count
            ));
        }
        WidgetType::Chart | WidgetType::LineChart | WidgetType::BarChart | WidgetType::PieChart | WidgetType::ScatterChart => {
            let title = node.properties.text.as_deref().unwrap_or("Analytical Chart");
            out.push_str(&format!(
                "\t{} := widget.NewLabelWithStyle(\"{}\", fyne.TextAlignCenter, fyne.TextStyle{{Bold: true}})\n",
                var_name, title
            ));
        }
        WidgetType::TreeView => {
            let root_title = node.properties.text.as_deref().unwrap_or("Root");
            out.push_str(&format!(
                "\t{} := widget.NewTree(\n\t\tfunc(id widget.TreeNodeID) []widget.TreeNodeID {{\n\t\t\tif id == \"\" {{\n\t\t\t\treturn []string{{\"{}\", \"src\", \"assets\"}}\n\t\t\t}}\n\t\t\treturn nil\n\t\t}},\n\t\tfunc(id widget.TreeNodeID) bool {{\n\t\t\treturn id == \"\" || id == \"src\"\n\t\t}},\n\t\tfunc(branch bool) fyne.CanvasObject {{\n\t\t\treturn widget.NewLabel(\"item\")\n\t\t}},\n\t\tfunc(id widget.TreeNodeID, branch bool, obj fyne.CanvasObject) {{\n\t\t\tobj.(*widget.Label).SetText(id)\n\t\t}},\n\t)\n",
                var_name, root_title
            ));
        }
        WidgetType::Viewport3D | WidgetType::Canvas3D => {
            let model_path = node.properties.model_3d_path.as_deref().unwrap_or("assets/model.gltf");
            out.push_str(&format!(
                "\t{} := widget.NewLabelWithStyle(\"3D Viewport: {}\", fyne.TextAlignCenter, fyne.TextStyle{{Monospace: true}})\n",
                var_name, model_path
            ));
        }
        WidgetType::Image => {
            let clean_alias = to_snake_case(&node.id);
            out.push_str(&format!(
                "\t{} := canvas.NewImageFromResource(fyne.NewStaticResource(\"{}\", asset_{}))\n",
                var_name, clean_alias, clean_alias
            ));
        }
        WidgetType::HBox => {
            let mut child_vars = Vec::new();
            for child in &node.children {
                child_vars.push(generate_node_go_expr(out, child, events, counter));
            }
            out.push_str(&format!(
                "\t{} := container.NewHBox({})\n",
                var_name,
                child_vars.join(", ")
            ));
        }
        _ => {
            let mut child_vars = Vec::new();
            for child in &node.children {
                child_vars.push(generate_node_go_expr(out, child, events, counter));
            }
            out.push_str(&format!(
                "\t{} := container.NewVBox({})\n",
                var_name,
                child_vars.join(", ")
            ));
        }
    }

    var_name
}

pub fn generate_go_initial_controller(events: &[BoundEvent]) -> String {
    let mut out = String::new();
    out.push_str("package main\n\n");
    out.push_str("type Controller struct {}\n\n");
    out.push_str("func NewController() *Controller {\n");
    out.push_str("\treturn &Controller{}\n");
    out.push_str("}\n\n");

    out.push_str("func (c *Controller) Dispatch(state *AppState, msg UiMessage) {\n");
    out.push_str("\tswitch msg.Type {\n");
    for ev in events {
        let method = to_pascal_case(&ev.handler_name);
        out.push_str(&format!("\tcase Msg{}:\n", ev.message_variant));
        match ev.payload_type {
            EventPayloadType::Unit => {
                out.push_str(&format!("\t\tc.{}(state)\n", method));
            }
            EventPayloadType::String => {
                out.push_str(&format!(
                    "\t\tif val, ok := msg.Payload.(string); ok {{\n\t\t\tc.{}(state, val)\n\t\t}}\n",
                    method
                ));
            }
            EventPayloadType::Bool => {
                out.push_str(&format!(
                    "\t\tif val, ok := msg.Payload.(bool); ok {{\n\t\t\tc.{}(state, val)\n\t\t}}\n",
                    method
                ));
            }
            EventPayloadType::F64 => {
                out.push_str(&format!(
                    "\t\tif val, ok := msg.Payload.(float64); ok {{\n\t\t\tc.{}(state, val)\n\t\t}}\n",
                    method
                ));
            }
        }
    }
    out.push_str("\t}\n");
    out.push_str("}\n\n");

    for ev in events {
        let method = to_pascal_case(&ev.handler_name);
        match ev.payload_type {
            EventPayloadType::Unit => {
                out.push_str(&format!("func (c *Controller) {}(state *AppState) {{\n}}\n\n", method));
            }
            EventPayloadType::String => {
                out.push_str(&format!(
                    "func (c *Controller) {}(state *AppState, value string) {{\n}}\n\n",
                    method
                ));
            }
            EventPayloadType::Bool => {
                out.push_str(&format!(
                    "func (c *Controller) {}(state *AppState, checked bool) {{\n}}\n\n",
                    method
                ));
            }
            EventPayloadType::F64 => {
                out.push_str(&format!(
                    "func (c *Controller) {}(state *AppState, value float64) {{\n}}\n\n",
                    method
                ));
            }
        }
    }

    out
}

pub fn merge_go_controller(existing: &str, events: &[BoundEvent]) -> Result<String, CodegenError> {
    let mut out = existing.to_string();

    for ev in events {
        let method = to_pascal_case(&ev.handler_name);
        let pattern = format!("func (c *Controller) {}", method);
        if !out.contains(&pattern) {
            out.push('\n');
            match ev.payload_type {
                EventPayloadType::Unit => {
                    out.push_str(&format!(
                        "func (c *Controller) {}(state *AppState) {{\n}}\n",
                        method
                    ));
                }
                EventPayloadType::String => {
                    out.push_str(&format!(
                        "func (c *Controller) {}(state *AppState, value string) {{\n}}\n",
                        method
                    ));
                }
                EventPayloadType::Bool => {
                    out.push_str(&format!(
                        "func (c *Controller) {}(state *AppState, checked bool) {{\n}}\n",
                        method
                    ));
                }
                EventPayloadType::F64 => {
                    out.push_str(&format!(
                        "func (c *Controller) {}(state *AppState, value float64) {{\n}}\n",
                        method
                    ));
                }
            }
        }
    }

    Ok(out)
}

