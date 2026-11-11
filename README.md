# Ruxel Studio

[![Version](https://img.shields.io/badge/version-v0.5.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=c0mbit.ruxel-studio)
[![VS Code Marketplace](https://badgen.net/vs-marketplace/v/c0mbit.ruxel-studio?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=c0mbit.ruxel-studio)
[![CI/CD Status](https://github.com/c0mbit/ruxel-studio/actions/workflows/release.yml/badge.svg)](https://github.com/c0mbit/ruxel-studio/actions/workflows/release.yml)
[![License: MIT / Apache-2.0](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)](LICENSE.md)

A native VS Code visual drag-and-drop UI editor for Rust desktop frameworks with real-time bidirectional code sync.

## Features

- **Universal Framework Support:** Native AST patching for Iced, egui, Slint, and Dioxus.
- **CRDT Multiplayer:** Real-time collaboration via Yjs/Yrs with isolated Undo/Redo.
- **Responsive Design Preview:** Viewport scaling for layout testing.
- **Secure Asset Sandbox:** Direct local image rendering inside the VS Code Webview.
- **Typed Inspector:** Enum dropdowns, color pickers, and visual error boundaries.
- **Incremental AST Caching:** High-performance 0ms latency bidirectional sync via `rux-daemon`.

## Installation

Search **Ruxel Studio** in the VS Code Marketplace and click **Install**. Background binaries for Windows, macOS, and Linux are provisioned automatically.
