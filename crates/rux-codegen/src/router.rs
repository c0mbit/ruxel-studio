use rux_ast::project::{ProjectScreen, RuxProject};
use crate::plugin::{GeneratedFile, TargetFramework};
use crate::sanitizer::to_pascal_case;

pub struct RouterGenerator;

impl RouterGenerator {
    pub fn generate_router_file(
        project: &RuxProject,
        framework: TargetFramework,
    ) -> GeneratedFile {
        match framework {
            TargetFramework::Iced | TargetFramework::Egui => {
                Self::generate_rust_router(project, framework)
            }
            TargetFramework::Fyne => Self::generate_go_router(project),
            TargetFramework::Flet => Self::generate_python_router(project),
            TargetFramework::Slint => Self::generate_slint_router(project),
            TargetFramework::Dioxus => Self::generate_dioxus_router(project),
        }
    }

    fn generate_rust_router(
        project: &RuxProject,
        framework: TargetFramework,
    ) -> GeneratedFile {
        let mut content = String::new();

        let screens: Vec<&ProjectScreen> = if project.screens.is_empty() {
            vec![]
        } else {
            project.screens.iter().collect()
        };

        content.push_str("use std::collections::VecDeque;\n\n");

        content.push_str("#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]\n");
        content.push_str("pub enum AppScreen {\n");
        if screens.is_empty() {
            content.push_str("    Default,\n");
        } else {
            for screen in &screens {
                let variant_name = to_pascal_case(&screen.id);
                content.push_str(&format!("    {},\n", variant_name));
            }
        }
        content.push_str("}\n\n");

        let default_variant = if screens.is_empty() {
            "AppScreen::Default".to_string()
        } else {
            let initial = screens
                .iter()
                .find(|s| s.is_initial || s.id == project.default_screen)
                .unwrap_or(&screens[0]);
            format!("AppScreen::{}", to_pascal_case(&initial.id))
        };

        content.push_str("impl Default for AppScreen {\n");
        content.push_str("    fn default() -> Self {\n");
        content.push_str(&format!("        {}\n", default_variant));
        content.push_str("    }\n");
        content.push_str("}\n\n");

        content.push_str("#[derive(Debug, Clone, PartialEq)]\n");
        content.push_str("pub enum NavigationMessage {\n");
        content.push_str("    Navigate(AppScreen),\n");
        content.push_str("    PushScreen(AppScreen),\n");
        content.push_str("    PopScreen,\n");
        content.push_str("}\n\n");

        content.push_str("#[derive(Debug, Clone, PartialEq)]\n");
        content.push_str("pub struct NavigationStack {\n");
        content.push_str("    pub current: AppScreen,\n");
        content.push_str("    history: VecDeque<AppScreen>,\n");
        content.push_str("}\n\n");

        content.push_str("impl NavigationStack {\n");
        content.push_str("    pub fn new(initial: AppScreen) -> Self {\n");
        content.push_str("        Self {\n");
        content.push_str("            current: initial,\n");
        content.push_str("            history: VecDeque::new(),\n");
        content.push_str("        }\n");
        content.push_str("    }\n\n");

        content.push_str("    pub fn navigate(&mut self, target: AppScreen) {\n");
        content.push_str("        self.history.clear();\n");
        content.push_str("        self.current = target;\n");
        content.push_str("    }\n\n");

        content.push_str("    pub fn push(&mut self, target: AppScreen) {\n");
        content.push_str("        self.history.push_back(self.current);\n");
        content.push_str("        self.current = target;\n");
        content.push_str("    }\n\n");

        content.push_str("    pub fn pop(&mut self) -> bool {\n");
        content.push_str("        if let Some(prev) = self.history.pop_back() {\n");
        content.push_str("            self.current = prev;\n");
        content.push_str("            true\n");
        content.push_str("        } else {\n");
        content.push_str("            false\n");
        content.push_str("        }\n");
        content.push_str("    }\n\n");

        content.push_str("    pub fn can_pop(&self) -> bool {\n");
        content.push_str("        !self.history.is_empty()\n");
        content.push_str("    }\n");
        content.push_str("}\n\n");

        content.push_str("impl Default for NavigationStack {\n");
        content.push_str("    fn default() -> Self {\n");
        content.push_str("        Self::new(AppScreen::default())\n");
        content.push_str("    }\n");
        content.push_str("}\n\n");

        match framework {
            TargetFramework::Iced => {
                content.push_str("pub fn route_iced_screen<'a, Message: 'static>(\n");
                content.push_str("    stack: &NavigationStack,\n");
                content.push_str("    default_view: iced::Element<'a, Message>,\n");
                content.push_str(") -> iced::Element<'a, Message> {\n");
                content.push_str("    match stack.current {\n");
                content.push_str("        _ => default_view,\n");
                content.push_str("    }\n");
                content.push_str("}\n");
            }
            TargetFramework::Egui => {
                content.push_str("pub fn route_egui_screen<F>(\n");
                content.push_str("    stack: &NavigationStack,\n");
                content.push_str("    ui: &mut egui::Ui,\n");
                content.push_str("    mut render_default: F,\n");
                content.push_str(") where F: FnMut(&mut egui::Ui) {\n");
                content.push_str("    match stack.current {\n");
                content.push_str("        _ => render_default(ui),\n");
                content.push_str("    }\n");
                content.push_str("}\n");
            }
            _ => {}
        }

        GeneratedFile {
            filename: "router.rs".to_string(),
            content,
            file_type: "rust".to_string(),
        }
    }

    fn generate_go_router(project: &RuxProject) -> GeneratedFile {
        let mut content = String::new();
        content.push_str("package main\n\n");
        content.push_str("import \"fyne.io/fyne/v2\"\n\n");

        content.push_str("type AppScreen string\n\n");
        content.push_str("const (\n");
        if project.screens.is_empty() {
            content.push_str("\tScreenDefault AppScreen = \"default\"\n");
        } else {
            for screen in &project.screens {
                let const_name = format!("Screen{}", to_pascal_case(&screen.id));
                content.push_str(&format!("\t{} AppScreen = \"{}\"\n", const_name, screen.id));
            }
        }
        content.push_str(")\n\n");

        content.push_str("type Router struct {\n");
        content.push_str("\tCurrent AppScreen\n");
        content.push_str("\tHistory []AppScreen\n");
        content.push_str("\tWindow  fyne.Window\n");
        content.push_str("}\n\n");

        content.push_str("func NewRouter(w fyne.Window, initial AppScreen) *Router {\n");
        content.push_str("\treturn &Router{\n");
        content.push_str("\t\tCurrent: initial,\n");
        content.push_str("\t\tHistory: make([]AppScreen, 0),\n");
        content.push_str("\t\tWindow:  w,\n");
        content.push_str("\t}\n");
        content.push_str("}\n\n");

        content.push_str("func (r *Router) Navigate(screen AppScreen) {\n");
        content.push_str("\tr.History = make([]AppScreen, 0)\n");
        content.push_str("\tr.Current = screen\n");
        content.push_str("}\n\n");

        content.push_str("func (r *Router) Push(screen AppScreen) {\n");
        content.push_str("\tr.History = append(r.History, r.Current)\n");
        content.push_str("\tr.Current = screen\n");
        content.push_str("}\n\n");

        content.push_str("func (r *Router) Pop() bool {\n");
        content.push_str("\tif len(r.History) == 0 {\n");
        content.push_str("\t\treturn false\n");
        content.push_str("\t}\n");
        content.push_str("\tprev := r.History[len(r.History)-1]\n");
        content.push_str("\tr.History = r.History[:len(r.History)-1]\n");
        content.push_str("\tr.Current = prev\n");
        content.push_str("\treturn true\n");
        content.push_str("}\n");

        GeneratedFile {
            filename: "router.go".to_string(),
            content,
            file_type: "go".to_string(),
        }
    }

    fn generate_python_router(_project: &RuxProject) -> GeneratedFile {
        let mut content = String::new();
        content.push_str("from typing import List, Callable, Optional\nimport flet as ft\n\n");

        content.push_str("class AppRouter:\n");
        content.push_str("    def __init__(self, page: ft.Page, initial_screen: str = \"default\"):\n");
        content.push_str("        self.page = page\n");
        content.push_str("        self.current_screen = initial_screen\n");
        content.push_str("        self.history: List[str] = []\n\n");

        content.push_str("    def navigate(self, screen: str):\n");
        content.push_str("        self.history.clear()\n");
        content.push_str("        self.current_screen = screen\n");
        content.push_str("        self.page.go(f\"/{screen}\")\n\n");

        content.push_str("    def push(self, screen: str):\n");
        content.push_str("        self.history.append(self.current_screen)\n");
        content.push_str("        self.current_screen = screen\n");
        content.push_str("        self.page.go(f\"/{screen}\")\n\n");

        content.push_str("    def pop(self) -> bool:\n");
        content.push_str("        if not self.history:\n");
        content.push_str("            return False\n");
        content.push_str("        prev = self.history.pop()\n");
        content.push_str("        self.current_screen = prev\n");
        content.push_str("        self.page.go(f\"/{prev}\")\n");
        content.push_str("        return True\n");

        GeneratedFile {
            filename: "router.py".to_string(),
            content,
            file_type: "python".to_string(),
        }
    }

    fn generate_slint_router(_project: &RuxProject) -> GeneratedFile {
        let content = "export component AppRouter inherits Window {\n    in-out property <int> active-screen: 0;\n}\n".to_string();
        GeneratedFile {
            filename: "router.slint".to_string(),
            content,
            file_type: "slint".to_string(),
        }
    }

    fn generate_dioxus_router(_project: &RuxProject) -> GeneratedFile {
        let content = "use dioxus::prelude::*;\n\n#[derive(Clone, Routable, Debug, PartialEq)]\npub enum Route {\n    #[route(\"/\")]\n    Home {},\n}\n".to_string();
        GeneratedFile {
            filename: "router.rs".to_string(),
            content,
            file_type: "rust".to_string(),
        }
    }
}
