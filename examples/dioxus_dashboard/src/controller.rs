use super::ui_generated::{AppState, UiHandler};

#[derive(Clone, Default, PartialEq)]
pub struct Controller;

impl Controller {
    pub fn new() -> Self {
        Self
    }
}

impl UiHandler for Controller {
    fn on_configure_metrics(&mut self, state: &mut AppState) {
        let _ = state;
        println!("Configure metrics requested");
    }

    fn on_export_report(&mut self, state: &mut AppState) {
        let _ = state;
        println!("Exporting PDF report...");
    }

    fn on_refresh_data(&mut self, state: &mut AppState) {
        let _ = state;
        println!("Data refresh initiated");
    }
}
