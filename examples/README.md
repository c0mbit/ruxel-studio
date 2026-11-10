# Ruxel Studio — Examples Library

Welcome to the **Ruxel Studio Examples Library**! This directory contains functional desktop application examples demonstrating Ruxel Studio's universal visual scene builder, bidirectional sync engine, and multi-framework code generation across leading Rust GUI ecosystems.

---

## Included Sample Projects

| Project | Framework | Target Version | Paradigm | Key Highlights |
| :--- | :--- | :--- | :--- | :--- |
| [`iced_todo_app`](./iced_todo_app/) | **Iced** | `0.13.1` | Elm architecture / Retained | Reactive tasks list, checkboxes, pure functional `view()` |
| [`dioxus_dashboard`](./dioxus_dashboard/) | **Dioxus** | `0.5.6` | React-like `rsx!` declarative | Executive analytics dashboard, KPI metric cards, component props |
| [`egui_settings_panel`](./egui_settings_panel/) | **egui** / **eframe** | `0.29.1` | Immediate mode | Configuration settings, telemetry preferences, modal actions |

---

## Quickstart: Exploring with Ruxel Studio

1. Open this repository in **VS Code** with the **Ruxel Studio** extension installed and enabled.
2. Navigate to any of the sample directories above and click `app.rux`.
3. VS Code opens the visual editor powered by the background `rux-daemon` AST engine.
4. Experiment with bidirectional synchronization:
   - **Canvas to Code**: Select any widget, alter its properties in the Inspector pane on the right, and save (`Ctrl+S`). Notice the updated `src/ui_generated.rs` while `src/controller.rs` retains all custom business logic.
   - **Code to Canvas**: Edit any string or property in `src/ui_generated.rs` directly in the code editor and save. Notice `app.rux` automatically patched by the reverse parser in real time!

---

## Testing & Verifying Examples

All sample project schemas and generated code syntax are continuously validated as part of the workspace test suite:

```bash
cargo test --test examples_library_tests
```
