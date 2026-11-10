use dioxus::prelude::*;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AppState {}
#[derive(Debug, Clone, PartialEq)]
pub enum UiMessage {
    RefreshData,
    ExportReport,
    ConfigureMetrics,
}
pub trait UiHandler {
    fn on_configure_metrics(&mut self, state: &mut AppState);
    fn on_export_report(&mut self, state: &mut AppState);
    fn on_refresh_data(&mut self, state: &mut AppState);
    fn dispatch(&mut self, state: &mut AppState, message: UiMessage) {
        match message {
            UiMessage::ConfigureMetrics => self.on_configure_metrics(state),
            UiMessage::ExportReport => self.on_export_report(state),
            UiMessage::RefreshData => self.on_refresh_data(state),
        }
    }
}
pub struct WidgetIds;
impl WidgetIds {
    pub const DASHBOARD_ROOT: &'static str = "dashboard_root";
    pub const TOP_NAVBAR: &'static str = "top_navbar";
    pub const DASHBOARD_TITLE: &'static str = "dashboard_title";
    pub const REFRESH_BTN: &'static str = "refresh_btn";
    pub const METRICS_GRID: &'static str = "metrics_grid";
    pub const METRIC_CARD_REVENUE: &'static str = "metric_card_revenue";
    pub const LBL_REVENUE_TITLE: &'static str = "lbl_revenue_title";
    pub const LBL_REVENUE_VAL: &'static str = "lbl_revenue_val";
    pub const METRIC_CARD_USERS: &'static str = "metric_card_users";
    pub const LBL_USERS_TITLE: &'static str = "lbl_users_title";
    pub const LBL_USERS_VAL: &'static str = "lbl_users_val";
    pub const METRIC_CARD_CONVERSION: &'static str = "metric_card_conversion";
    pub const LBL_CONVERSION_TITLE: &'static str = "lbl_conversion_title";
    pub const LBL_CONVERSION_VAL: &'static str = "lbl_conversion_val";
    pub const QUICK_ACTIONS_ROW: &'static str = "quick_actions_row";
    pub const EXPORT_REPORT_BTN: &'static str = "export_report_btn";
    pub const SETTINGS_SHORTCUT_BTN: &'static str = "settings_shortcut_btn";
    pub const ALL: &'static [&'static str] = &[
        "dashboard_root",
        "top_navbar",
        "dashboard_title",
        "refresh_btn",
        "metrics_grid",
        "metric_card_revenue",
        "lbl_revenue_title",
        "lbl_revenue_val",
        "metric_card_users",
        "lbl_users_title",
        "lbl_users_val",
        "metric_card_conversion",
        "lbl_conversion_title",
        "lbl_conversion_val",
        "quick_actions_row",
        "export_report_btn",
        "settings_shortcut_btn",
    ];
}
#[component]
pub fn AppUi<H: UiHandler + Clone + PartialEq + 'static>(state: AppState, handler: H) -> Element {
    rsx! {
        div { style : "display: flex; flex-direction: column; gap: 8px;", div { style :
        "display: flex; flex-direction: row; gap: 8px;", span {
        "Executive Analytics Overview" } button { onclick : { let mut state = state
        .clone(); let mut handler = handler.clone(); move | _ | { handler.dispatch(& mut
        state, UiMessage::RefreshData); } }, "Refresh Data" } } div { style :
        "display: flex; flex-direction: row; gap: 8px;", div { style :
        "display: flex; flex-direction: column; gap: 8px;", span { "Total Revenue" } span
        { "$142,850" } } div { style :
        "display: flex; flex-direction: column; gap: 8px;", span { "Active Subscribers" }
        span { "24,591" } } div { style :
        "display: flex; flex-direction: column; gap: 8px;", span { "Conversion Rate" }
        span { "4.82%" } } } div { style :
        "display: flex; flex-direction: row; gap: 8px;", button { onclick : { let mut
        state = state.clone(); let mut handler = handler.clone(); move | _ | { handler
        .dispatch(& mut state, UiMessage::ExportReport); } }, "Export PDF Report" }
        button { onclick : { let mut state = state.clone(); let mut handler = handler
        .clone(); move | _ | { handler.dispatch(& mut state,
        UiMessage::ConfigureMetrics); } }, "Configure Metrics" } } }
    }
}
