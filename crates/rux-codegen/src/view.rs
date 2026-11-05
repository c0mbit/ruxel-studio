use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::theme::ColorScheme;
use rux_ast::widget::WidgetNode;

use crate::plugin::{GeneratedFile, TargetFramework};
use crate::sanitizer::{make_ident, to_snake_case};

pub fn generate_widget_ids_tokens(doc: &RuxDocument) -> TokenStream {
    let mut ids: Vec<String> = Vec::new();
    collect_ids(&doc.root, &mut ids);

    let id_constants = ids.iter().map(|id| {
        let const_name = make_ident(&id.to_uppercase());
        quote!(pub const #const_name: &'static str = #id;)
    });

    let id_slices = ids.iter().map(|id| quote!(#id));

    quote! {
        pub struct WidgetIds;

        impl WidgetIds {
            #(#id_constants)*

            pub const ALL: &'static [&'static str] = &[
                #(#id_slices),*
            ];
        }
    }
}

fn collect_ids(node: &WidgetNode, ids: &mut Vec<String>) {
    ids.push(node.id.clone());
    for child in &node.children {
        collect_ids(child, ids);
    }
}

pub fn generate_view_builder_tokens(doc: &RuxDocument) -> TokenStream {
    let root_expr = generate_node_view_expr(&doc.root);

    quote! {
        #[derive(Debug, Clone, PartialEq)]
        pub struct ViewNode {
            pub id: &'static str,
            pub widget_type: &'static str,
            pub text: Option<String>,
            pub background: Option<&'static str>,
            pub border_color: Option<&'static str>,
            pub text_color: Option<&'static str>,
            pub children: Vec<ViewNode>,
        }

        pub fn build_view(state: &AppState) -> ViewNode {
            #root_expr
        }
    }
}

fn generate_node_view_expr(node: &WidgetNode) -> TokenStream {
    let id_literal = &node.id;
    let type_name = format!("{:?}", node.widget_type);
    let type_literal = type_name.as_str();

    let text_expr = if let Some(binding) = &node.bindings.value {
        let field_name = to_snake_case(binding);
        let field_ident = make_ident(&field_name);
        quote!(Some(format!("{}", state.#field_ident)))
    } else if let Some(txt) = &node.properties.text {
        quote!(Some(#txt.to_string()))
    } else {
        quote!(None)
    };

    let background_expr = match &node.properties.background_color {
        Some(bg) => quote!(Some(#bg)),
        None => quote!(None),
    };

    let border_color_expr = match &node.properties.border_color {
        Some(bc) => quote!(Some(#bc)),
        None => quote!(None),
    };

    let text_color_expr = match &node.properties.text_color {
        Some(tc) => quote!(Some(#tc)),
        None => quote!(None),
    };

    let child_exprs = node
        .children
        .iter()
        .map(generate_node_view_expr);

    quote! {
        ViewNode {
            id: #id_literal,
            widget_type: #type_literal,
            text: #text_expr,
            background: #background_expr,
            border_color: #border_color_expr,
            text_color: #text_color_expr,
            children: vec![
                #(#child_exprs),*
            ],
        }
    }
}

pub fn generate_theme_file(doc: &RuxDocument, framework: TargetFramework) -> GeneratedFile {
    let scheme_str = match doc.theme.active_scheme {
        ColorScheme::Light => "light",
        ColorScheme::Dark => "dark",
        ColorScheme::System => "system",
    };

    match framework {
        TargetFramework::Fyne => {
            let mut content = String::new();
            content.push_str("package main\n\n");
            content.push_str("type ColorPalette struct {\n");
            content.push_str("\tPrimary      string\n");
            content.push_str("\tOnPrimary    string\n");
            content.push_str("\tSecondary    string\n");
            content.push_str("\tOnSecondary  string\n");
            content.push_str("\tSurface      string\n");
            content.push_str("\tOnSurface    string\n");
            content.push_str("\tBackground   string\n");
            content.push_str("\tOnBackground string\n");
            content.push_str("\tError        string\n");
            content.push_str("\tOnError      string\n");
            content.push_str("}\n\n");

            content.push_str("type ShapeRadii struct {\n");
            content.push_str("\tNone float32\n");
            content.push_str("\tSm   float32\n");
            content.push_str("\tMd   float32\n");
            content.push_str("\tLg   float32\n");
            content.push_str("\tXl   float32\n");
            content.push_str("\tFull float32\n");
            content.push_str("}\n\n");

            content.push_str("type AppTheme struct {\n");
            content.push_str("\tActiveScheme string\n");
            content.push_str("\tLight        ColorPalette\n");
            content.push_str("\tDark         ColorPalette\n");
            content.push_str("\tShape        ShapeRadii\n");
            content.push_str("}\n\n");

            let light = &doc.theme.color_palettes.light;
            let dark = &doc.theme.color_palettes.dark;
            let shape = &doc.theme.border_radii;

            content.push_str("var Theme = AppTheme{\n");
            content.push_str(&format!("\tActiveScheme: \"{}\",\n", scheme_str));
            content.push_str("\tLight: ColorPalette{\n");
            content.push_str(&format!("\t\tPrimary: \"{}\",\n", light.primary));
            content.push_str(&format!("\t\tOnPrimary: \"{}\",\n", light.on_primary));
            content.push_str(&format!("\t\tSecondary: \"{}\",\n", light.secondary));
            content.push_str(&format!("\t\tOnSecondary: \"{}\",\n", light.on_secondary));
            content.push_str(&format!("\t\tSurface: \"{}\",\n", light.surface));
            content.push_str(&format!("\t\tOnSurface: \"{}\",\n", light.on_surface));
            content.push_str(&format!("\t\tBackground: \"{}\",\n", light.background));
            content.push_str(&format!("\t\tOnBackground: \"{}\",\n", light.on_background));
            content.push_str(&format!("\t\tError: \"{}\",\n", light.error));
            content.push_str(&format!("\t\tOnError: \"{}\",\n", light.on_error));
            content.push_str("\t},\n");
            content.push_str("\tDark: ColorPalette{\n");
            content.push_str(&format!("\t\tPrimary: \"{}\",\n", dark.primary));
            content.push_str(&format!("\t\tOnPrimary: \"{}\",\n", dark.on_primary));
            content.push_str(&format!("\t\tSecondary: \"{}\",\n", dark.secondary));
            content.push_str(&format!("\t\tOnSecondary: \"{}\",\n", dark.on_secondary));
            content.push_str(&format!("\t\tSurface: \"{}\",\n", dark.surface));
            content.push_str(&format!("\t\tOnSurface: \"{}\",\n", dark.on_surface));
            content.push_str(&format!("\t\tBackground: \"{}\",\n", dark.background));
            content.push_str(&format!("\t\tOnBackground: \"{}\",\n", dark.on_background));
            content.push_str(&format!("\t\tError: \"{}\",\n", dark.error));
            content.push_str(&format!("\t\tOnError: \"{}\",\n", dark.on_error));
            content.push_str("\t},\n");
            content.push_str("\tShape: ShapeRadii{\n");
            content.push_str(&format!("\t\tNone: {:.1},\n", shape.none));
            content.push_str(&format!("\t\tSm: {:.1},\n", shape.sm));
            content.push_str(&format!("\t\tMd: {:.1},\n", shape.md));
            content.push_str(&format!("\t\tLg: {:.1},\n", shape.lg));
            content.push_str(&format!("\t\tXl: {:.1},\n", shape.xl));
            content.push_str(&format!("\t\tFull: {:.1},\n", shape.full));
            content.push_str("\t},\n");
            content.push_str("}\n\n");

            content.push_str("func (t *AppTheme) ActivePalette() ColorPalette {\n");
            content.push_str("\tif t.ActiveScheme == \"dark\" {\n\t\treturn t.Dark\n\t}\n\treturn t.Light\n}\n");

            GeneratedFile {
                filename: "theme.go".to_string(),
                content,
                file_type: "go".to_string(),
            }
        }
        TargetFramework::Flet => {
            let mut content = String::new();
            content.push_str("from __future__ import annotations\n\n");
            content.push_str("from dataclasses import dataclass\n\n");

            content.push_str("@dataclass\nclass ColorPalette:\n");
            content.push_str("    primary: str\n");
            content.push_str("    on_primary: str\n");
            content.push_str("    secondary: str\n");
            content.push_str("    on_secondary: str\n");
            content.push_str("    surface: str\n");
            content.push_str("    on_surface: str\n");
            content.push_str("    background: str\n");
            content.push_str("    on_background: str\n");
            content.push_str("    error: str\n");
            content.push_str("    on_error: str\n\n");

            content.push_str("@dataclass\nclass ShapeRadii:\n");
            content.push_str("    none: float\n");
            content.push_str("    sm: float\n");
            content.push_str("    md: float\n");
            content.push_str("    lg: float\n");
            content.push_str("    xl: float\n");
            content.push_str("    full: float\n\n");

            content.push_str("@dataclass\nclass AppTheme:\n");
            content.push_str("    active_scheme: str\n");
            content.push_str("    light: ColorPalette\n");
            content.push_str("    dark: ColorPalette\n");
            content.push_str("    shape: ShapeRadii\n\n");

            let light = &doc.theme.color_palettes.light;
            let dark = &doc.theme.color_palettes.dark;
            let shape = &doc.theme.border_radii;

            content.push_str("THEME = AppTheme(\n");
            content.push_str(&format!("    active_scheme=\"{}\",\n", scheme_str));
            content.push_str("    light=ColorPalette(\n");
            content.push_str(&format!("        primary=\"{}\",\n", light.primary));
            content.push_str(&format!("        on_primary=\"{}\",\n", light.on_primary));
            content.push_str(&format!("        secondary=\"{}\",\n", light.secondary));
            content.push_str(&format!("        on_secondary=\"{}\",\n", light.on_secondary));
            content.push_str(&format!("        surface=\"{}\",\n", light.surface));
            content.push_str(&format!("        on_surface=\"{}\",\n", light.on_surface));
            content.push_str(&format!("        background=\"{}\",\n", light.background));
            content.push_str(&format!("        on_background=\"{}\",\n", light.on_background));
            content.push_str(&format!("        error=\"{}\",\n", light.error));
            content.push_str(&format!("        on_error=\"{}\",\n", light.on_error));
            content.push_str("    ),\n");
            content.push_str("    dark=ColorPalette(\n");
            content.push_str(&format!("        primary=\"{}\",\n", dark.primary));
            content.push_str(&format!("        on_primary=\"{}\",\n", dark.on_primary));
            content.push_str(&format!("        secondary=\"{}\",\n", dark.secondary));
            content.push_str(&format!("        on_secondary=\"{}\",\n", dark.on_secondary));
            content.push_str(&format!("        surface=\"{}\",\n", dark.surface));
            content.push_str(&format!("        on_surface=\"{}\",\n", dark.on_surface));
            content.push_str(&format!("        background=\"{}\",\n", dark.background));
            content.push_str(&format!("        on_background=\"{}\",\n", dark.on_background));
            content.push_str(&format!("        error=\"{}\",\n", dark.error));
            content.push_str(&format!("        on_error=\"{}\",\n", dark.on_error));
            content.push_str("    ),\n");
            content.push_str("    shape=ShapeRadii(\n");
            content.push_str(&format!("        none={:.1},\n", shape.none));
            content.push_str(&format!("        sm={:.1},\n", shape.sm));
            content.push_str(&format!("        md={:.1},\n", shape.md));
            content.push_str(&format!("        lg={:.1},\n", shape.lg));
            content.push_str(&format!("        xl={:.1},\n", shape.xl));
            content.push_str(&format!("        full={:.1},\n", shape.full));
            content.push_str("    ),\n");
            content.push_str(")\n");

            GeneratedFile {
                filename: "theme.py".to_string(),
                content,
                file_type: "python".to_string(),
            }
        }
        _ => {
            let mut content = String::new();
            content.push_str("use serde::{Deserialize, Serialize};\n\n");

            content.push_str("#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]\n");
            content.push_str("pub struct ColorPalette {\n");
            content.push_str("    pub primary: &'static str,\n");
            content.push_str("    pub on_primary: &'static str,\n");
            content.push_str("    pub secondary: &'static str,\n");
            content.push_str("    pub on_secondary: &'static str,\n");
            content.push_str("    pub surface: &'static str,\n");
            content.push_str("    pub on_surface: &'static str,\n");
            content.push_str("    pub background: &'static str,\n");
            content.push_str("    pub on_background: &'static str,\n");
            content.push_str("    pub error: &'static str,\n");
            content.push_str("    pub on_error: &'static str,\n");
            content.push_str("}\n\n");

            content.push_str("#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]\n");
            content.push_str("pub struct ShapeRadii {\n");
            content.push_str("    pub none: f32,\n");
            content.push_str("    pub sm: f32,\n");
            content.push_str("    pub md: f32,\n");
            content.push_str("    pub lg: f32,\n");
            content.push_str("    pub xl: f32,\n");
            content.push_str("    pub full: f32,\n");
            content.push_str("}\n\n");

            content.push_str("#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]\n");
            content.push_str("pub struct ShadowElevation {\n");
            content.push_str("    pub name: &'static str,\n");
            content.push_str("    pub offset_x: f32,\n");
            content.push_str("    pub offset_y: f32,\n");
            content.push_str("    pub blur_radius: f32,\n");
            content.push_str("    pub spread_radius: f32,\n");
            content.push_str("    pub color: &'static str,\n");
            content.push_str("}\n\n");

            content.push_str("#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]\n");
            content.push_str("pub struct AppTheme {\n");
            content.push_str("    pub active_scheme: &'static str,\n");
            content.push_str("    pub light: ColorPalette,\n");
            content.push_str("    pub dark: ColorPalette,\n");
            content.push_str("    pub shape: ShapeRadii,\n");
            content.push_str("    pub shadows: &'static [ShadowElevation],\n");
            content.push_str("}\n\n");

            let light = &doc.theme.color_palettes.light;
            let dark = &doc.theme.color_palettes.dark;
            let shape = &doc.theme.border_radii;

            content.push_str("pub const THEME: AppTheme = AppTheme {\n");
            content.push_str(&format!("    active_scheme: \"{}\",\n", scheme_str));
            content.push_str("    light: ColorPalette {\n");
            content.push_str(&format!("        primary: \"{}\",\n", light.primary));
            content.push_str(&format!("        on_primary: \"{}\",\n", light.on_primary));
            content.push_str(&format!("        secondary: \"{}\",\n", light.secondary));
            content.push_str(&format!("        on_secondary: \"{}\",\n", light.on_secondary));
            content.push_str(&format!("        surface: \"{}\",\n", light.surface));
            content.push_str(&format!("        on_surface: \"{}\",\n", light.on_surface));
            content.push_str(&format!("        background: \"{}\",\n", light.background));
            content.push_str(&format!("        on_background: \"{}\",\n", light.on_background));
            content.push_str(&format!("        error: \"{}\",\n", light.error));
            content.push_str(&format!("        on_error: \"{}\",\n", light.on_error));
            content.push_str("    },\n");
            content.push_str("    dark: ColorPalette {\n");
            content.push_str(&format!("        primary: \"{}\",\n", dark.primary));
            content.push_str(&format!("        on_primary: \"{}\",\n", dark.on_primary));
            content.push_str(&format!("        secondary: \"{}\",\n", dark.secondary));
            content.push_str(&format!("        on_secondary: \"{}\",\n", dark.on_secondary));
            content.push_str(&format!("        surface: \"{}\",\n", dark.surface));
            content.push_str(&format!("        on_surface: \"{}\",\n", dark.on_surface));
            content.push_str(&format!("        background: \"{}\",\n", dark.background));
            content.push_str(&format!("        on_background: \"{}\",\n", dark.on_background));
            content.push_str(&format!("        error: \"{}\",\n", dark.error));
            content.push_str(&format!("        on_error: \"{}\",\n", dark.on_error));
            content.push_str("    },\n");
            content.push_str("    shape: ShapeRadii {\n");
            content.push_str(&format!("        none: {:.1},\n", shape.none));
            content.push_str(&format!("        sm: {:.1},\n", shape.sm));
            content.push_str(&format!("        md: {:.1},\n", shape.md));
            content.push_str(&format!("        lg: {:.1},\n", shape.lg));
            content.push_str(&format!("        xl: {:.1},\n", shape.xl));
            content.push_str(&format!("        full: {:.1},\n", shape.full));
            content.push_str("    },\n");
            content.push_str("    shadows: &[],\n");
            content.push_str("};\n\n");

            content.push_str("impl AppTheme {\n");
            content.push_str("    pub fn active_palette(&self) -> &'static ColorPalette {\n");
            content.push_str("        if self.active_scheme == \"dark\" {\n");
            content.push_str("            &THEME.dark\n");
            content.push_str("        } else {\n");
            content.push_str("            &THEME.light\n");
            content.push_str("        }\n");
            content.push_str("    }\n");
            content.push_str("}\n");

            GeneratedFile {
                filename: "theme.rs".to_string(),
                content,
                file_type: "rust".to_string(),
            }
        }
    }
}

pub fn generate_localization_files(doc: &RuxDocument) -> Vec<GeneratedFile> {
    let mut files = Vec::new();
    let mut extracted_keys = std::collections::BTreeMap::new();
    collect_text_keys(&doc.root, &mut extracted_keys);

    if let Some(i18n) = &doc.i18n {
        for (locale, mapping) in &i18n.locales {
            let mut ftl_content = String::new();
            for (k, v) in mapping {
                ftl_content.push_str(&format!("{} = {}\n", k, v));
            }
            files.push(GeneratedFile {
                filename: format!("locales/{}.ftl", locale),
                content: ftl_content,
                file_type: "ftl".to_string(),
            });

            if let Ok(json_str) = serde_json::to_string_pretty(mapping) {
                files.push(GeneratedFile {
                    filename: format!("locales/{}.json", locale),
                    content: json_str,
                    file_type: "json".to_string(),
                });
            }
        }
    }

    if files.is_empty() && !extracted_keys.is_empty() {
        let mut default_ftl = String::new();
        for (k, v) in &extracted_keys {
            default_ftl.push_str(&format!("{} = {}\n", k, v));
        }
        files.push(GeneratedFile {
            filename: "locales/en-US.ftl".to_string(),
            content: default_ftl,
            file_type: "ftl".to_string(),
        });
        if let Ok(json_str) = serde_json::to_string_pretty(&extracted_keys) {
            files.push(GeneratedFile {
                filename: "locales/en-US.json".to_string(),
                content: json_str,
                file_type: "json".to_string(),
            });
        }
    }

    files
}

fn collect_text_keys(node: &WidgetNode, keys: &mut std::collections::BTreeMap<String, String>) {
    if let Some(key) = &node.properties.text_key {
        let val = node.properties.text.as_deref().unwrap_or(key.as_str());
        keys.insert(key.clone(), val.to_string());
    }
    for child in &node.children {
        collect_text_keys(child, keys);
    }
}
