# egui Settings Panel — Ruxel Studio Example

This example demonstrates an immediate-mode desktop settings and configuration panel built using [egui](https://github.com/emilk/egui) (v0.29.1) and [eframe](https://github.com/emilk/egui/tree/master/crates/eframe), designed visually in **Ruxel Studio**.

---

## Architecture Overview

- **`app.rux`**: The visual AST document specifying settings headers, theme toggles, crash reporting preferences, server endpoints, and action buttons.
- **`src/ui_generated.rs`**: Clean, auto-generated Rust code providing `pub fn render_ui<H: UiHandler>(ui: &mut egui::Ui, state: &mut AppState, handler: &mut H)` using egui's immediate-mode layout primitives (`ui.vertical`, `ui.horizontal`, `ui.checkbox`, `ui.text_edit_singleline`).
- **`src/controller.rs`**: User-managed event handler implementing `UiHandler`, processing preference updates and default resets.
- **`src/main.rs`**: Standalone eframe application hosting the egui immediate-mode loop.

---

## Opening in Ruxel Studio

1. Open this folder in VS Code with the **Ruxel Studio** extension enabled.
2. Click `app.rux`. The visual scene builder renders the settings panel layout.
3. Select controls on the canvas to inspect their property bindings, identifiers, and event dispatch configurations in the Inspector pane.

---

## Testing Bidirectional Sync

### 1. Visual-to-Code Sync
1. In the Ruxel Visual Editor, click the `"Save Preferences"` button.
2. In the Properties panel, change its text property to `"Apply Preferences"`.
3. Press `Ctrl+S` or run `Ruxel: Generate & Export Rust Code`.
4. Open `src/ui_generated.rs`: verify that `ui.button("Apply Preferences")` has updated cleanly, while `src/controller.rs` preserves all business logic.

### 2. Code-to-Visual (egui Immediate Mode Reverse Parsing)
1. Open `src/ui_generated.rs`.
2. Locate the line with `let _ = ui.label("Ruxel Preferences");`.
3. Edit the label text to `let _ = ui.label("Studio Preferences & Telemetry");` and save.
4. The AST daemon detects the file modification, reverse-parses the closure structure, and patches the corresponding label node in `app.rux`.
5. The visual canvas reflects the updated label without any structural corruption.

---

## Running the Application Standalone

```bash
cargo run
```
