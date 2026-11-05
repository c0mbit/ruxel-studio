# Ruxel Studio

Universal Visual UI Builder & Scene Builder for Rust and Go desktop applications.

## Overview

Ruxel Studio is a high-performance visual design tool built directly into Visual Studio Code. It provides Scene Builder parity for modern native desktop ecosystems, supporting live two-way code synchronization, multi-framework code generation, and enterprise UI tooling.

## Key Features

- **Scene Builder Canvas**: Drag-and-drop hierarchy tree, canvas positioning, snapping alignment, and visual guides.
- **Universal AST**: Lossless document model supporting `.rux` declarative layouts.
- **Multi-Framework Generators**: Export production-ready code for Iced, egui, Slint, Dioxus, Go Fyne, and Python Flet.
- **Bidirectional Round-Trip Sync**: Automatic AST-to-code updates and code-to-AST reverse patching without losing custom controller logic.
- **Integrated Wasm Preview**: Live WebAssembly interactive preview of rendered UI components directly inside VS Code.
- **Cross-Platform Native Daemons**: Bundled zero-configuration Rust daemons for Windows, macOS (Intel & Apple Silicon), and Linux.
- **Open Source**: 100% free and open-source under MIT and Apache-2.0 licenses with zero paywalls.

## Getting Started

1. Open any `.rux` file in your workspace to launch the Ruxel Studio visual editor.
2. Design your UI layout using the visual canvas and component inspector.
3. Export generated code using the Command Palette: `Ruxel: Generate & Export Rust Code`.
4. Connect controllers and view models seamlessly.

## Extension Settings

- `ruxel.daemonPath`: Optional custom path to an external `rux-daemon` binary.
- `ruxel.syncServerPath`: Optional custom path to an external `rux-sync-server` binary.

## License

Dual-licensed under MIT and Apache-2.0.
