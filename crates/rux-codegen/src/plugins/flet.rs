use std::collections::{BTreeMap, HashSet};
use rux_ast::document::RuxDocument;
use rux_ast::layout::{ContainerLayout, Size};
use rux_ast::widget::{WidgetNode, WidgetType};

use crate::error::CodegenError;
use crate::events::{BoundEvent, EventPayloadType};
use crate::generator::CodegenDiagnostic;
use crate::plugin::{
    CodeGenerator, CodegenOptions, CodegenOutput, FrameworkProfile, TargetFramework,
};
use crate::sanitizer::to_snake_case;
use crate::state::{InferredField, StateDefaultValue};

fn get_gap(node: &WidgetNode) -> f64 {
    if let Some(ref layout) = node.layout {
        if let Some(ContainerLayout::Flex(ref flex)) = layout.container {
            return flex.gap;
        }
    }
    8.0
}

fn get_width(node: &WidgetNode) -> Option<f64> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(w) = layout.dimensions.width {
            return Some(w);
        }
    }
    None
}

fn get_height(node: &WidgetNode) -> Option<f64> {
    if let Some(ref layout) = node.layout {
        if let Size::Fixed(h) = layout.dimensions.height {
            return Some(h);
        }
    }
    None
}

pub struct FletPlugin;

impl FletPlugin {
    pub fn new() -> Self {
        Self
    }

    fn to_screaming_snake_case(input: &str) -> String {
        to_snake_case(input).to_uppercase()
    }

    fn generate_ui_code(
        &self,
        doc: &RuxDocument,
        state_fields: &[InferredField],
        events: &[BoundEvent],
    ) -> String {
        let mut out = String::new();
        out.push_str("from __future__ import annotations\n\n");
        out.push_str("from dataclasses import dataclass, field\n");
        out.push_str("from enum import Enum, auto\n");
        out.push_str("from typing import Any, Callable, List, Optional, Protocol\n");
        out.push_str("import flet as ft\n\n");

        self.generate_python_app_state(&mut out, state_fields);
        self.generate_python_ui_messages(&mut out, events);
        self.generate_python_ui_handler(&mut out, events);
        self.generate_python_widget_ids(&mut out, doc);
        self.generate_python_view_builder(&mut out, doc, events);

        out
    }

    fn generate_python_app_state(&self, out: &mut String, fields: &[InferredField]) {
        out.push_str("@dataclass\n");
        out.push_str("class AppState:\n");
        if fields.is_empty() {
            out.push_str("    pass\n\n");
            return;
        }

        for f in fields {
            let name = to_snake_case(&f.name);
            match &f.default_value {
                StateDefaultValue::String(val) => {
                    out.push_str(&format!("    {}: str = \"{}\"\n", name, val));
                }
                StateDefaultValue::Bool(val) => {
                    let bool_val = if *val { "True" } else { "False" };
                    out.push_str(&format!("    {}: bool = {}\n", name, bool_val));
                }
                StateDefaultValue::F64(val) => {
                    out.push_str(&format!("    {}: float = {:.1}\n", name, val));
                }
                StateDefaultValue::OptionString(opt) => match opt {
                    Some(val) => {
                        out.push_str(&format!("    {}: Optional[str] = \"{}\"\n", name, val));
                    }
                    None => {
                        out.push_str(&format!("    {}: Optional[str] = None\n", name));
                    }
                },
                StateDefaultValue::VecString(items) => {
                    if items.is_empty() {
                        out.push_str(&format!(
                            "    {}: List[str] = field(default_factory=list)\n",
                            name
                        ));
                    } else {
                        let formatted = items
                            .iter()
                            .map(|it| format!("\"{}\"", it))
                            .collect::<Vec<_>>()
                            .join(", ");
                        out.push_str(&format!(
                            "    {}: List[str] = field(default_factory=lambda: [{}])\n",
                            name, formatted
                        ));
                    }
                }
            }
        }
        out.push('\n');
    }

    fn generate_python_ui_messages(&self, out: &mut String, events: &[BoundEvent]) {
        out.push_str("class UiMessage(Enum):\n");
        if events.is_empty() {
            out.push_str("    NONE = auto()\n\n");
            return;
        }

        let mut seen = HashSet::new();
        for ev in events {
            let variant = Self::to_screaming_snake_case(&ev.message_variant);
            if seen.insert(variant.clone()) {
                out.push_str(&format!("    {} = auto()\n", variant));
            }
        }
        out.push('\n');
    }

    fn generate_python_ui_handler(&self, out: &mut String, events: &[BoundEvent]) {
        out.push_str("class UiHandler(Protocol):\n");
        out.push_str("    def dispatch(self, state: AppState, message: UiMessage, payload: Any = None) -> None:\n");
        out.push_str("        ...\n\n");

        let mut unique_handlers: BTreeMap<String, &EventPayloadType> = BTreeMap::new();
        for ev in events {
            unique_handlers.insert(to_snake_case(&ev.handler_name), &ev.payload_type);
        }

        for (name, payload) in unique_handlers {
            match payload {
                EventPayloadType::Unit => {
                    out.push_str(&format!("    def {}(self, state: AppState) -> None:\n", name));
                    out.push_str("        ...\n\n");
                }
                EventPayloadType::String => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: str) -> None:\n", name));
                    out.push_str("        ...\n\n");
                }
                EventPayloadType::Bool => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: bool) -> None:\n", name));
                    out.push_str("        ...\n\n");
                }
                EventPayloadType::F64 => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: float) -> None:\n", name));
                    out.push_str("        ...\n\n");
                }
            }
        }
    }

    fn generate_python_widget_ids(&self, out: &mut String, doc: &RuxDocument) {
        out.push_str("class WidgetIds:\n");
        let mut ids = Vec::new();
        self.collect_ids(&doc.root, &mut ids);

        for id in &ids {
            let const_name = Self::to_screaming_snake_case(id);
            out.push_str(&format!("    {} = \"{}\"\n", const_name, id));
        }

        out.push_str("    ALL = [\n");
        for id in &ids {
            out.push_str(&format!("        \"{}\",\n", id));
        }
        out.push_str("    ]\n\n");
    }

    fn collect_ids(&self, node: &WidgetNode, ids: &mut Vec<String>) {
        ids.push(node.id.clone());
        for child in &node.children {
            self.collect_ids(child, ids);
        }
    }

    fn generate_python_view_builder(
        &self,
        out: &mut String,
        doc: &RuxDocument,
        events: &[BoundEvent],
    ) {
        out.push_str("def build_view(page: ft.Page, state: AppState, handler: UiHandler) -> ft.Control:\n");
        out.push_str("    return ");
        self.generate_python_node(out, &doc.root, events, 1);
        out.push('\n');
    }

    fn generate_python_node(
        &self,
        out: &mut String,
        node: &WidgetNode,
        events: &[BoundEvent],
        indent_level: usize,
    ) {
        let indent = "    ".repeat(indent_level);
        let next_indent = "    ".repeat(indent_level + 1);

        match node.widget_type {
            WidgetType::VBox | WidgetType::AnchorPane | WidgetType::BorderPane | WidgetType::Grid | WidgetType::TabPane | WidgetType::SplitPane | WidgetType::Accordion => {
                let gap = get_gap(node);
                out.push_str(&format!("ft.Column(\n{}controls=[\n", next_indent));
                for child in &node.children {
                    out.push_str(&format!("{}    ", next_indent));
                    self.generate_python_node(out, child, events, indent_level + 2);
                    out.push_str(",\n");
                }
                out.push_str(&format!("{}],\n{}spacing={:.1},\n", next_indent, next_indent, gap));
                if let Some(w) = get_width(node) {
                    out.push_str(&format!("{}width={:.1},\n", next_indent, w));
                }
                if let Some(h) = get_height(node) {
                    out.push_str(&format!("{}height={:.1},\n", next_indent, h));
                }
                out.push_str(&format!("{})\n", indent));
            }
            WidgetType::HBox => {
                let gap = get_gap(node);
                out.push_str(&format!("ft.Row(\n{}controls=[\n", next_indent));
                for child in &node.children {
                    out.push_str(&format!("{}    ", next_indent));
                    self.generate_python_node(out, child, events, indent_level + 2);
                    out.push_str(",\n");
                }
                out.push_str(&format!("{}],\n{}spacing={:.1},\n", next_indent, next_indent, gap));
                if let Some(w) = get_width(node) {
                    out.push_str(&format!("{}width={:.1},\n", next_indent, w));
                }
                if let Some(h) = get_height(node) {
                    out.push_str(&format!("{}height={:.1},\n", next_indent, h));
                }
                out.push_str(&format!("{})\n", indent));
            }
            WidgetType::ScrollPane => {
                out.push_str(&format!("ft.Column(\n{}scroll=ft.ScrollMode.AUTO,\n{}controls=[\n", next_indent, next_indent));
                for child in &node.children {
                    out.push_str(&format!("{}    ", next_indent));
                    self.generate_python_node(out, child, events, indent_level + 2);
                    out.push_str(",\n");
                }
                out.push_str(&format!("{}],\n{})\n", next_indent, indent));
            }
            WidgetType::Button => {
                let nav_target = node
                    .events
                    .on_click
                    .as_ref()
                    .and_then(|e| e.navigate_to.as_ref())
                    .or(node.events.navigate.as_ref());

                let txt = if let Some(key) = &node.properties.text_key {
                    format!("i18n.get(\"{}\")", key)
                } else {
                    let raw = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    format!("\"{}\"", raw)
                };

                let tooltip_attr = if let Some(aria) = &node.properties.aria_label {
                    format!(", tooltip=\"{}\"", aria)
                } else {
                    String::new()
                };

                let on_click = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_click");

                if let Some(target_screen) = nav_target {
                    out.push_str(&format!(
                        "ft.ElevatedButton(text={}, on_click=lambda e: router.navigate(\"{}\"){})",
                        txt, target_screen, tooltip_attr
                    ));
                } else if let Some(ev) = on_click {
                    let msg_variant = Self::to_screaming_snake_case(&ev.message_variant);
                    out.push_str(&format!(
                        "ft.ElevatedButton(text={}, on_click=lambda e: handler.dispatch(state, UiMessage.{}{}))",
                        txt, msg_variant, tooltip_attr
                    ));
                } else {
                    out.push_str(&format!("ft.ElevatedButton(text={}{})", txt, tooltip_attr));
                }
            }
            WidgetType::Label => {
                let tooltip_attr = if let Some(aria) = &node.properties.aria_label {
                    format!(", tooltip=\"{}\"", aria)
                } else {
                    String::new()
                };

                if let Some(binding) = &node.bindings.value {
                    let prop_name = to_snake_case(binding);
                    out.push_str(&format!("ft.Text(value=str(state.{}{}))", prop_name, tooltip_attr));
                } else if let Some(key) = &node.properties.text_key {
                    out.push_str(&format!("ft.Text(value=i18n.get(\"{}\"){})", key, tooltip_attr));
                } else {
                    let txt = node
                        .properties
                        .text
                        .as_deref()
                        .unwrap_or(node.id.as_str());
                    out.push_str(&format!("ft.Text(value=\"{}\"{})", txt, tooltip_attr));
                }
            }
            WidgetType::TextInput => {
                let placeholder = node
                    .properties
                    .placeholder
                    .as_deref()
                    .or(node.properties.text.as_deref())
                    .unwrap_or("");

                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };

                let on_change = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_input")
                });

                if let Some(ev) = on_change {
                    let msg_variant = Self::to_screaming_snake_case(&ev.message_variant);
                    out.push_str(&format!(
                        "ft.TextField(hint_text=\"{}\", value=state.{}, on_change=lambda e: handler.dispatch(state, UiMessage.{}, e.control.value))",
                        placeholder, prop_name, msg_variant
                    ));
                } else {
                    out.push_str(&format!(
                        "ft.TextField(hint_text=\"{}\", value=state.{})",
                        placeholder, prop_name
                    ));
                }
            }
            WidgetType::Checkbox => {
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());

                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };

                let on_toggle = events.iter().find(|ev| {
                    ev.widget_id == node.id && (ev.event_kind == "on_change" || ev.event_kind == "on_click")
                });

                if let Some(ev) = on_toggle {
                    let msg_variant = Self::to_screaming_snake_case(&ev.message_variant);
                    out.push_str(&format!(
                        "ft.Checkbox(label=\"{}\", value=state.{}, on_change=lambda e: handler.dispatch(state, UiMessage.{}, bool(e.control.value)))",
                        label, prop_name, msg_variant
                    ));
                } else {
                    out.push_str(&format!(
                        "ft.Checkbox(label=\"{}\", value=state.{})",
                        label, prop_name
                    ));
                }
            }
            WidgetType::RadioButton => {
                let label = node
                    .properties
                    .text
                    .as_deref()
                    .unwrap_or(node.id.as_str());
                out.push_str(&format!("ft.Radio(label=\"{}\")", label));
            }
            WidgetType::Slider => {
                let min = node.properties.min_value.unwrap_or(0.0);
                let max = node.properties.max_value.unwrap_or(100.0);
                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };

                let on_change = events
                    .iter()
                    .find(|ev| ev.widget_id == node.id && ev.event_kind == "on_change");

                if let Some(ev) = on_change {
                    let msg_variant = Self::to_screaming_snake_case(&ev.message_variant);
                    out.push_str(&format!(
                        "ft.Slider(min={:.1}, max={:.1}, value=state.{}, on_change=lambda e: handler.dispatch(state, UiMessage.{}, float(e.control.value)))",
                        min, max, prop_name, msg_variant
                    ));
                } else {
                    out.push_str(&format!(
                        "ft.Slider(min={:.1}, max={:.1}, value=state.{})",
                        min, max, prop_name
                    ));
                }
            }
            WidgetType::ProgressBar => {
                let prop_name = if let Some(binding) = &node.bindings.value {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!("ft.ProgressBar(value=state.{})", prop_name));
            }
            WidgetType::ComboBox => {
                let items_ident = if let Some(binding) = &node.bindings.items {
                    to_snake_case(binding)
                } else {
                    format!("{}_options", to_snake_case(&node.id))
                };
                let selected_ident = if let Some(binding) = &node.bindings.selected {
                    to_snake_case(binding)
                } else {
                    to_snake_case(&node.id)
                };
                out.push_str(&format!(
                    "ft.Dropdown(options=[ft.dropdown.Option(opt) for opt in state.{}], value=state.{})",
                    items_ident, selected_ident
                ));
            }
            WidgetType::DataGrid => {
                let columns_code = if !node.properties.columns.is_empty() {
                    let cols: Vec<String> = node.properties.columns.iter().map(|c| {
                        format!("ft.DataColumn(ft.Text(\"{}\"))", c.title)
                    }).collect();
                    cols.join(", ")
                } else {
                    "ft.DataColumn(ft.Text(\"ID\")), ft.DataColumn(ft.Text(\"Name\")), ft.DataColumn(ft.Text(\"Status\"))".to_string()
                };
                out.push_str(&format!(
                    "ft.DataTable(columns=[{}], rows=[ft.DataRow(cells=[ft.DataCell(ft.Text(\"#001\")), ft.DataCell(ft.Text(\"Alpha\")), ft.DataCell(ft.Text(\"Active\"))])])",
                    columns_code
                ));
            }
            WidgetType::Chart | WidgetType::LineChart | WidgetType::BarChart | WidgetType::PieChart | WidgetType::ScatterChart => {
                out.push_str("ft.LineChart(data_series=[ft.LineChartData(data_points=[ft.LineChartDataPoint(0, 10), ft.LineChartDataPoint(1, 25), ft.LineChartDataPoint(2, 40)])], animate=True)");
            }
            WidgetType::TreeView => {
                let header = node.properties.text.as_deref().unwrap_or("Root");
                out.push_str(&format!(
                    "ft.ExpansionTile(title=ft.Text(\"{}\"), controls=[ft.ListTile(title=ft.Text(\"src/\")), ft.ListTile(title=ft.Text(\"main.rs\"))])",
                    header
                ));
            }
            WidgetType::Viewport3D => {
                let model = node.properties.model_3d_path.as_deref().unwrap_or("assets/model.gltf");
                out.push_str(&format!("ft.Container(content=ft.Text(\"3D Viewport [{}]\"), bgcolor=\"#0f172a\", padding=10)", model));
            }
            WidgetType::Image => {
                let img_path = node
                    .properties
                    .image_path
                    .as_deref()
                    .or_else(|| {
                        node.properties
                            .custom_properties
                            .get("image_path")
                            .and_then(|v| v.as_str())
                    })
                    .unwrap_or("assets/image.png");
                out.push_str(&format!("ft.Image(src=\"{}\")", img_path));
            }
            _ => {
                out.push_str("ft.Container(bgcolor=\"#18181b\", expand=True)");
            }
        }
    }

    pub fn generate_initial_controller(&self, events: &[BoundEvent]) -> String {
        let mut out = String::new();
        out.push_str("from __future__ import annotations\n\n");
        out.push_str("from typing import Any\n");
        out.push_str("from ui_generated import AppState, UiHandler, UiMessage\n\n\n");
        out.push_str("class Controller(UiHandler):\n");
        out.push_str("    def __init__(self) -> None:\n");
        out.push_str("        pass\n\n");

        out.push_str("    def dispatch(self, state: AppState, message: UiMessage, payload: Any = None) -> None:\n");
        if events.is_empty() {
            out.push_str("        pass\n\n");
        } else {
            let mut unique_dispatches: BTreeMap<String, (String, &EventPayloadType)> = BTreeMap::new();
            for ev in events {
                let variant = Self::to_screaming_snake_case(&ev.message_variant);
                let method_name = to_snake_case(&ev.handler_name);
                unique_dispatches.insert(variant, (method_name, &ev.payload_type));
            }

            for (i, (variant, (method, payload))) in unique_dispatches.iter().enumerate() {
                let branch = if i == 0 { "if" } else { "elif" };
                match payload {
                    EventPayloadType::Unit => {
                        out.push_str(&format!(
                            "        {} message == UiMessage.{}:\n            self.{}(state)\n",
                            branch, variant, method
                        ));
                    }
                    _ => {
                        out.push_str(&format!(
                            "        {} message == UiMessage.{}:\n            self.{}(state, payload)\n",
                            branch, variant, method
                        ));
                    }
                }
            }
            out.push('\n');
        }

        let mut unique_handlers: BTreeMap<String, &EventPayloadType> = BTreeMap::new();
        for ev in events {
            unique_handlers.insert(to_snake_case(&ev.handler_name), &ev.payload_type);
        }

        for (name, payload) in unique_handlers {
            match payload {
                EventPayloadType::Unit => {
                    out.push_str(&format!("    def {}(self, state: AppState) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::String => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: str) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::Bool => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: bool) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::F64 => {
                    out.push_str(&format!("    def {}(self, state: AppState, value: float) -> None:\n        pass\n\n", name));
                }
            }
        }

        out
    }

    pub fn merge_controller(&self, existing_source: &str, events: &[BoundEvent]) -> String {
        if !existing_source.contains("class Controller") {
            return self.generate_initial_controller(events);
        }

        let mut existing_methods: HashSet<String> = HashSet::new();
        for line in existing_source.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("def ") {
                if let Some(open_paren) = trimmed.find('(') {
                    let fn_name = trimmed[4..open_paren].trim();
                    existing_methods.insert(fn_name.to_string());
                }
            }
        }

        let mut missing_methods = Vec::new();
        let mut unique_handlers: BTreeMap<String, &EventPayloadType> = BTreeMap::new();
        for ev in events {
            unique_handlers.insert(to_snake_case(&ev.handler_name), &ev.payload_type);
        }

        for (name, payload) in unique_handlers {
            if !existing_methods.contains(&name) {
                missing_methods.push((name, payload));
            }
        }

        if missing_methods.is_empty() {
            return existing_source.to_string();
        }

        let mut merged = existing_source.trim_end().to_string();
        merged.push_str("\n\n");

        for (name, payload) in missing_methods {
            match payload {
                EventPayloadType::Unit => {
                    merged.push_str(&format!("    def {}(self, state: AppState) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::String => {
                    merged.push_str(&format!("    def {}(self, state: AppState, value: str) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::Bool => {
                    merged.push_str(&format!("    def {}(self, state: AppState, value: bool) -> None:\n        pass\n\n", name));
                }
                EventPayloadType::F64 => {
                    merged.push_str(&format!("    def {}(self, state: AppState, value: float) -> None:\n        pass\n\n", name));
                }
            }
        }

        merged
    }
}

impl Default for FletPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeGenerator for FletPlugin {
    fn target_framework(&self) -> TargetFramework {
        TargetFramework::Flet
    }

    fn profile(&self) -> FrameworkProfile {
        FrameworkProfile {
            target_framework: TargetFramework::Flet,
            framework_name: "Python Flet".to_string(),
            version: "0.24".to_string(),
            language: "python".to_string(),
            description: "Build interactive multi-platform applications in Python using Flutter-backed Flet controls.".to_string(),
            ui_filename: "ui_generated.py".to_string(),
            controller_filename: "controller.py".to_string(),
        }
    }

    fn generate(
        &self,
        doc: &RuxDocument,
        state_fields: &[InferredField],
        events: &[BoundEvent],
        existing_controller: Option<&str>,
        _options: &CodegenOptions,
    ) -> Result<CodegenOutput, CodegenError> {
        let ui_generated_code = self.generate_ui_code(doc, state_fields, events);

        let mut diagnostics = Vec::new();
        let controller_code = match existing_controller {
            Some(existing) if !existing.trim().is_empty() => {
                self.merge_controller(existing, events)
            }
            _ => self.generate_initial_controller(events),
        };

        diagnostics.push(CodegenDiagnostic {
            level: "info".to_string(),
            message: format!(
                "Successfully generated Python Flet 0.24 UI ({} bytes) and controller ({} bytes)",
                ui_generated_code.len(),
                controller_code.len()
            ),
            widget_id: None,
        });

        let theme_file = crate::view::generate_theme_file(doc, TargetFramework::Flet);
        let mut auxiliary_files = vec![theme_file];
        let mut i18n_files = crate::view::generate_localization_files(doc);
        auxiliary_files.append(&mut i18n_files);

        let default_proj = rux_ast::project::RuxProject::new(&doc.metadata.app_name, "main");
        let router_file = crate::router::RouterGenerator::generate_router_file(
            &default_proj,
            TargetFramework::Flet,
        );
        auxiliary_files.push(router_file);

        Ok(CodegenOutput {
            ui_generated_filename: "ui_generated.py".to_string(),
            ui_generated_code,
            controller_filename: "controller.py".to_string(),
            controller_code,
            auxiliary_files,
            diagnostics,
            target_framework: TargetFramework::Flet,
            framework_version: "0.24".to_string(),
        })
    }
}
