use super::ui_generated::{AppState, UiHandler};

pub struct Controller;

impl Controller {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Controller {
    fn default() -> Self {
        Self::new()
    }
}

impl UiHandler for Controller {
    fn on_reset_defaults(&mut self, state: &mut AppState) {
        *state = AppState::default();
        println!("Settings reset to default values");
    }

    fn on_save_preferences(&mut self, state: &mut AppState) {
        println!(
            "Preferences saved: dark_mode={}, telemetry={}, server={}",
            state.chk_dark_mode, state.chk_telemetry, state.input_server_url
        );
    }

    fn on_server_url_change(&mut self, state: &mut AppState, value: String) {
        state.input_server_url = value;
    }
}
