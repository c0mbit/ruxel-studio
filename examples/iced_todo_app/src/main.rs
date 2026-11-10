mod controller;
mod ui_generated;

use controller::Controller;
use ui_generated::{AppState, UiHandler, UiMessage};

struct TodoApp {
    state: AppState,
    controller: Controller,
}

impl Default for TodoApp {
    fn default() -> Self {
        Self {
            state: AppState::default(),
            controller: Controller::new(),
        }
    }
}

impl TodoApp {
    fn update(&mut self, message: UiMessage) {
        self.controller.dispatch(&mut self.state, message);
    }

    fn view(&self) -> iced::Element<'_, UiMessage> {
        ui_generated::view(&self.state)
    }
}

fn main() -> iced::Result {
    iced::application("Ruxel Studio — Iced To-Do List", TodoApp::update, TodoApp::view)
        .run()
}
