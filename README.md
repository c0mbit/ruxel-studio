# Ruxel Studio

<div align="center">

**A visual UI editor extension for Rust & Go desktop frameworks.**

[![VS Code Marketplace Version](https://badgen.net/vs-marketplace/v/c0mbit.ruxel-studio?icon=visualstudio)](https://marketplace.visualstudio.com/items?itemName=c0mbit.ruxel-studio)
[![CI/CD Build & Publish](https://github.com/c0mbit/ruxel-studio/actions/workflows/release-publish.yml/badge.svg)](https://github.com/c0mbit/ruxel-studio/actions/workflows/release-publish.yml)
[![License: MIT / Apache-2.0](https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue.svg)](LICENSE.md)

</div>

Ruxel Studio is a native VS Code extension that provides a visual drag-and-drop canvas for building desktop GUIs in Rust and Go. It aims to eliminate the need for manual coordinate tweaking and constant recompilation when designing layouts.

**Current Status:** Alpha (v0.1.3). The core engine works, but expect bugs and missing edge cases.

## Features

* **Bidirectional Sync:** Modifying the visual canvas updates your code, and editing your code updates the canvas. It uses `syn` and `quote` to parse and preserve your custom logic and event handlers without overwriting them.
* **Native Wasm Preview:** Renders your actual framework code in a VS Code webview by compiling it to `wasm32-unknown-unknown` in the background (zero HTML/CSS mockups).
* **Figma Import:** Basic support for converting Figma Auto Layouts directly into native flexbox containers.

## Supported Frameworks

* **Iced, egui, Slint:** Basic layouts and core widgets supported.
* **Dioxus, Fyne (Go), Flet (Python):** Experimental / Work in progress.

## Installation

1. Open VS Code and go to Extensions (`Ctrl+Shift+X`).
2. Search for `Ruxel Studio` and click Install.
3. Alternatively, download the `.vsix` file from the [Releases](https://github.com/c0mbit/ruxel-studio/releases) page and install it manually.

## Local Development

To build the project locally, you need Node.js (v18+) and Rust (stable) with the `wasm32-unknown-unknown` target installed.

```bash
git clone https://github.com/c0mbit/ruxel-studio.git
cd ruxel-studio
npm install
cargo build --release
npm run build