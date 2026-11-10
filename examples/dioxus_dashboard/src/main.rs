mod controller;
mod ui_generated;

use controller::Controller;
use dioxus::prelude::*;
use ui_generated::{AppState, AppUi};

fn main() {
    LaunchBuilder::desktop().launch(App);
}

#[component]
fn App() -> Element {
    let state = use_signal(AppState::default);
    let handler = use_signal(Controller::new);

    rsx! {
        AppUi {
            state: state(),
            handler: handler(),
        }
    }
}
