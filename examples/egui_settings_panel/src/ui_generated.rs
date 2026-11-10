use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, PartialEq)]
pub struct AppState {
    pub chk_dark_mode: bool,
    pub chk_telemetry: bool,
    pub input_server_url: String,
}
impl Default for AppState {
    fn default() -> Self {
        Self {
            chk_dark_mode: true,
            chk_telemetry: false,
            input_server_url: String::new(),
        }
    }
}
#[derive(Debug, Clone, PartialEq)]
pub enum UiMessage {
    ServerUrlChanged(String),
    SavePreferences,
    ResetDefaults,
}
pub trait UiHandler {
    fn on_reset_defaults(&mut self, state: &mut AppState);
    fn on_save_preferences(&mut self, state: &mut AppState);
    fn on_server_url_change(&mut self, state: &mut AppState, value: String);
    fn dispatch(&mut self, state: &mut AppState, message: UiMessage) {
        match message {
            UiMessage::ResetDefaults => self.on_reset_defaults(state),
            UiMessage::SavePreferences => self.on_save_preferences(state),
            UiMessage::ServerUrlChanged(value) => self.on_server_url_change(state, value),
        }
    }
}
pub struct WidgetIds;
impl WidgetIds {
    pub const SETTINGS_ROOT: &'static str = "settings_root";
    pub const SETTINGS_HEADING: &'static str = "settings_heading";
    pub const CHK_DARK_MODE: &'static str = "chk_dark_mode";
    pub const CHK_TELEMETRY: &'static str = "chk_telemetry";
    pub const INPUT_SERVER_URL: &'static str = "input_server_url";
    pub const ACTIONS_ROW: &'static str = "actions_row";
    pub const SAVE_SETTINGS_BTN: &'static str = "save_settings_btn";
    pub const RESET_DEFAULTS_BTN: &'static str = "reset_defaults_btn";
    pub const ALL: &'static [&'static str] = &[
        "settings_root",
        "settings_heading",
        "chk_dark_mode",
        "chk_telemetry",
        "input_server_url",
        "actions_row",
        "save_settings_btn",
        "reset_defaults_btn",
    ];
}
pub fn render_ui<H: UiHandler>(
    ui: &mut egui::Ui,
    state: &mut AppState,
    handler: &mut H,
) {
    ui.vertical(|ui| {
        let _ = ui.label("Ruxel Preferences");
        ui.checkbox(&mut state.chk_dark_mode, "Enable High-Contrast Dark Mode");
        ui.checkbox(
            &mut state.chk_telemetry,
            "Anonymous crash reporting telemetry (GDPR compliant)",
        );
        if ui.text_edit_singleline(&mut state.input_server_url).changed() {
            handler
                .dispatch(
                    state,
                    UiMessage::ServerUrlChanged(state.input_server_url.clone()),
                );
        }
        ui.horizontal(|ui| {
            if ui.button("Save Preferences").clicked() {
                handler.dispatch(state, UiMessage::SavePreferences);
            }
            if ui.button("Reset to Defaults").clicked() {
                handler.dispatch(state, UiMessage::ResetDefaults);
            }
        });
    });
}
