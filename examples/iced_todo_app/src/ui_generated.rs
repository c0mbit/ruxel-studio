use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq)]
pub struct AppState {
    pub new_task_input: String,
    pub task_item_1: bool,
    pub task_item_2: bool,
    pub task_item_3: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            new_task_input: String::new(),
            task_item_1: true,
            task_item_2: true,
            task_item_3: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum UiMessage {
    TaskInputChanged(String),
    AddTask,
    ClearCompleted,
}

pub trait UiHandler {
    fn on_add_task_click(&mut self, state: &mut AppState);
    fn on_clear_completed_click(&mut self, state: &mut AppState);
    fn on_task_input_change(&mut self, state: &mut AppState, value: String);
    fn dispatch(&mut self, state: &mut AppState, message: UiMessage) {
        match message {
            UiMessage::AddTask => self.on_add_task_click(state),
            UiMessage::ClearCompleted => self.on_clear_completed_click(state),
            UiMessage::TaskInputChanged(value) => self.on_task_input_change(state, value),
        }
    }
}

pub struct WidgetIds;

impl WidgetIds {
    pub const ROOT_CONTAINER: &'static str = "root_container";
    pub const HEADER_TITLE: &'static str = "header_title";
    pub const INPUT_ROW: &'static str = "input_row";
    pub const NEW_TASK_INPUT: &'static str = "new_task_input";
    pub const ADD_TASK_BTN: &'static str = "add_task_btn";
    pub const TASKS_LIST: &'static str = "tasks_list";
    pub const TASK_ITEM_1: &'static str = "task_item_1";
    pub const TASK_ITEM_2: &'static str = "task_item_2";
    pub const TASK_ITEM_3: &'static str = "task_item_3";
    pub const FOOTER_ROW: &'static str = "footer_row";
    pub const STATUS_LABEL: &'static str = "status_label";
    pub const CLEAR_COMPLETED_BTN: &'static str = "clear_completed_btn";
}

pub fn view<'a>(state: &'a AppState) -> iced::Element<'a, UiMessage> {
    use iced::widget::{button, checkbox, column, row, text, text_input};

    column![
        text("Ruxel Tasks"),
        row![
            text_input("What needs to be accomplished?", &state.new_task_input)
                .on_input(UiMessage::TaskInputChanged),
            button(text("Add Task")).on_press(UiMessage::AddTask)
        ]
        .spacing(8.0),
        column![
            checkbox("Implement lossless AST patching", state.task_item_1),
            checkbox("Build multi-framework visual editor", state.task_item_2),
            checkbox("Deploy Phase 6 CI/CD and Telemetry", state.task_item_3)
        ]
        .spacing(8.0),
        row![
            text("1 task remaining"),
            button(text("Clear Completed")).on_press(UiMessage::ClearCompleted)
        ]
        .spacing(8.0)
    ]
    .spacing(8.0)
    .into()
}
