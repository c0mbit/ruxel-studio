# Dioxus Analytics Dashboard — Ruxel Studio Example

This example demonstrates a responsive desktop analytics dashboard built using [Dioxus](https://dioxuslabs.com/) (v0.5.6) with the native `rsx!` declarative macro, designed visually in **Ruxel Studio**.

---

## Architecture Overview

- **`app.rux`**: The visual AST specification describing dashboard cards, revenue KPIs, navigation elements, styling, and event handlers.
- **`src/ui_generated.rs`**: Automatically generated Dioxus component code (`#[component] pub fn AppUi(...) -> Element`) containing formatted, zero-comment `rsx! { ... }` trees.
- **`src/controller.rs`**: Developer-managed handler implementation (`UiHandler` + `Clone`) handling user actions such as refreshing metrics and triggering reports.
- **`src/main.rs`**: Application entry point hosting the desktop renderer via `LaunchBuilder::desktop()`.

---

## Opening in Ruxel Studio

1. Open this folder in VS Code with the **Ruxel Studio** extension active.
2. Open `app.rux`. The editor displays the Executive Analytics Dashboard with responsive layout containers, metric cards, and action buttons.
3. Use the Hierarchy tree in the left pane to select nested containers and cards.

---

## Testing Bidirectional Sync

### 1. Visual-to-Code Sync
1. In the Ruxel Visual Editor, click the metric card titled `"Total Revenue"`.
2. In the Inspector pane, edit the revenue value label to `"$198,400"`.
3. Save the document (`Ctrl+S`).
4. Review `src/ui_generated.rs`: the `rsx!` macro body immediately reflects the new text inside the span element.

### 2. Code-to-Visual (Dioxus RSX Reverse Parsing)
1. Open `src/ui_generated.rs`.
2. Locate the button with `"Refresh Data"` inside the `rsx!` block.
3. Change `"Refresh Data"` to `"Sync Cloud Telemetry"` and save the file.
4. The Ruxel daemon parses the modified RSX macro token stream and patches `app.rux` in place.
5. The Visual Editor canvas reflects the new label in real time.

---

## Running the Application Standalone

```bash
cargo run
```
