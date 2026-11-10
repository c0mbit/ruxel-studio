mod controller;
mod ui_generated;

use controller::Controller;
use eframe::egui;
use ui_generated::{render_ui, AppState};

struct SettingsApp {
    state: AppState,
    controller: Controller,
}

impl Default for SettingsApp {
    fn default() -> Self {
        Self {
            state: AppState::default(),
            controller: Controller::new(),
        }
    }
}

impl eframe::App for SettingsApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show(ctx, |ui| {
            render_ui(ui, &mut self.state, &mut self.controller);
        });
    }
}

fn main() -> eframe::Result<()> {
    let native_options = eframe::NativeOptions::default();
    eframe::run_native(
        "Ruxel Studio — egui Configuration Panel",
        native_options,
        Box::new(|_cc| Ok(Box::new(SettingsApp::default()))),
    )
}
