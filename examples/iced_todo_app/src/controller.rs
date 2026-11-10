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
    fn on_add_task_click(&mut self, state: &mut AppState) {
        if !state.new_task_input.trim().is_empty() {
            println!("Task added: {}", state.new_task_input);
            state.new_task_input.clear();
        }
    }

    fn on_clear_completed_click(&mut self, state: &mut AppState) {
        state.task_item_1 = false;
        state.task_item_2 = false;
        state.task_item_3 = false;
        println!("Cleared completed items");
    }

    fn on_task_input_change(&mut self, state: &mut AppState, value: String) {
        state.new_task_input = value;
    }
}
