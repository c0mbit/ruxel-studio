use std::collections::HashSet;
use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::widget::{WidgetNode, WidgetType};

use crate::sanitizer::{make_ident, to_snake_case};

#[derive(Debug, Clone, PartialEq)]
pub enum StateType {
    String,
    Bool,
    F64,
    OptionString,
    VecString,
}

#[derive(Debug, Clone, PartialEq)]
pub enum StateDefaultValue {
    String(String),
    Bool(bool),
    F64(f64),
    OptionString(Option<String>),
    VecString(Vec<String>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct InferredField {
    pub name: String,
    pub field_type: StateType,
    pub default_value: StateDefaultValue,
}

impl InferredField {
    pub fn default_expr_tokens(&self) -> TokenStream {
        match &self.default_value {
            StateDefaultValue::String(val) => {
                if val.is_empty() {
                    quote!(String::new())
                } else {
                    quote!(#val.to_string())
                }
            }
            StateDefaultValue::Bool(val) => quote!(#val),
            StateDefaultValue::F64(val) => quote!(#val),
            StateDefaultValue::OptionString(val) => match val {
                Some(inner) => quote!(Some(#inner.to_string())),
                None => quote!(None),
            },
            StateDefaultValue::VecString(items) => {
                if items.is_empty() {
                    quote!(Vec::new())
                } else {
                    let elements = items.iter().map(|it| quote!(#it.to_string()));
                    quote!(vec![#(#elements),*])
                }
            }
        }
    }
}

pub struct StateInferenceEngine;

impl StateInferenceEngine {
    pub fn infer_document(doc: &RuxDocument) -> Vec<InferredField> {
        let mut fields: Vec<InferredField> = Vec::new();
        let mut seen_names: HashSet<String> = HashSet::new();
        Self::traverse_node(&doc.root, &mut fields, &mut seen_names);
        fields
    }

    fn traverse_node(
        node: &WidgetNode,
        fields: &mut Vec<InferredField>,
        seen_names: &mut HashSet<String>,
    ) {
        Self::collect_explicit_bindings(node, fields, seen_names);
        Self::collect_implicit_control_state(node, fields, seen_names);

        for child in &node.children {
            Self::traverse_node(child, fields, seen_names);
        }
    }

    fn collect_explicit_bindings(
        node: &WidgetNode,
        fields: &mut Vec<InferredField>,
        seen_names: &mut HashSet<String>,
    ) {
        if let Some(val_binding) = &node.bindings.value {
            let field_name = to_snake_case(val_binding);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                let (field_type, default_value) = match node.widget_type {
                    WidgetType::Checkbox | WidgetType::RadioButton => (
                        StateType::Bool,
                        StateDefaultValue::Bool(node.properties.checked.unwrap_or(false)),
                    ),
                    WidgetType::Slider | WidgetType::ProgressBar => {
                        let num = node
                            .properties
                            .current_value
                            .or(node.properties.min_value)
                            .unwrap_or(0.0);
                        (StateType::F64, StateDefaultValue::F64(num))
                    }
                    WidgetType::ComboBox => (
                        StateType::OptionString,
                        StateDefaultValue::OptionString(None),
                    ),
                    WidgetType::TableView | WidgetType::TreeView => (
                        StateType::VecString,
                        StateDefaultValue::VecString(node.properties.options.clone()),
                    ),
                    _ => {
                        let text = node.properties.text.clone().unwrap_or_default();
                        (StateType::String, StateDefaultValue::String(text))
                    }
                };
                fields.push(InferredField {
                    name: field_name,
                    field_type,
                    default_value,
                });
            }
        }

        if let Some(items_binding) = &node.bindings.items {
            let field_name = to_snake_case(items_binding);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                fields.push(InferredField {
                    name: field_name,
                    field_type: StateType::VecString,
                    default_value: StateDefaultValue::VecString(node.properties.options.clone()),
                });
            }
        }

        if let Some(selected_binding) = &node.bindings.selected {
            let field_name = to_snake_case(selected_binding);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                fields.push(InferredField {
                    name: field_name,
                    field_type: StateType::OptionString,
                    default_value: StateDefaultValue::OptionString(None),
                });
            }
        }

        if let Some(disabled_binding) = &node.bindings.disabled {
            let field_name = to_snake_case(disabled_binding);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                fields.push(InferredField {
                    name: field_name,
                    field_type: StateType::Bool,
                    default_value: StateDefaultValue::Bool(
                        node.properties.disabled.unwrap_or(false),
                    ),
                });
            }
        }

        if let Some(visible_binding) = &node.bindings.visible {
            let field_name = to_snake_case(visible_binding);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                fields.push(InferredField {
                    name: field_name,
                    field_type: StateType::Bool,
                    default_value: StateDefaultValue::Bool(
                        node.properties.visible.unwrap_or(true),
                    ),
                });
            }
        }

        for (custom_key, custom_val) in &node.bindings.custom_bindings {
            let field_name = to_snake_case(custom_val);
            if !seen_names.contains(&field_name) {
                seen_names.insert(field_name.clone());
                let key_lower = custom_key.to_lowercase();
                let (field_type, default_value) = if key_lower.contains("visible")
                    || key_lower.contains("enabled")
                    || key_lower.contains("active")
                    || key_lower.contains("checked")
                {
                    (StateType::Bool, StateDefaultValue::Bool(false))
                } else if key_lower.contains("count")
                    || key_lower.contains("amount")
                    || key_lower.contains("index")
                {
                    (StateType::F64, StateDefaultValue::F64(0.0))
                } else {
                    (
                        StateType::String,
                        StateDefaultValue::String(String::new()),
                    )
                };
                fields.push(InferredField {
                    name: field_name,
                    field_type,
                    default_value,
                });
            }
        }
    }

    fn collect_implicit_control_state(
        node: &WidgetNode,
        fields: &mut Vec<InferredField>,
        seen_names: &mut HashSet<String>,
    ) {
        if node.bindings.value.is_some() {
            return;
        }

        match node.widget_type {
            WidgetType::TextInput => {
                let name = to_snake_case(&node.id);
                if !seen_names.contains(&name) {
                    seen_names.insert(name.clone());
                    let text = node.properties.text.clone().unwrap_or_default();
                    fields.push(InferredField {
                        name,
                        field_type: StateType::String,
                        default_value: StateDefaultValue::String(text),
                    });
                }
            }
            WidgetType::Checkbox | WidgetType::RadioButton => {
                let name = to_snake_case(&node.id);
                if !seen_names.contains(&name) {
                    seen_names.insert(name.clone());
                    fields.push(InferredField {
                        name,
                        field_type: StateType::Bool,
                        default_value: StateDefaultValue::Bool(
                            node.properties.checked.unwrap_or(false),
                        ),
                    });
                }
            }
            WidgetType::Slider | WidgetType::ProgressBar => {
                let name = to_snake_case(&node.id);
                if !seen_names.contains(&name) {
                    seen_names.insert(name.clone());
                    let num = node
                        .properties
                        .current_value
                        .or(node.properties.min_value)
                        .unwrap_or(0.0);
                    fields.push(InferredField {
                        name,
                        field_type: StateType::F64,
                        default_value: StateDefaultValue::F64(num),
                    });
                }
            }
            WidgetType::ComboBox => {
                let name = to_snake_case(&node.id);
                if !seen_names.contains(&name) {
                    seen_names.insert(name.clone());
                    fields.push(InferredField {
                        name,
                        field_type: StateType::OptionString,
                        default_value: StateDefaultValue::OptionString(None),
                    });
                }
            }
            WidgetType::TableView | WidgetType::TreeView => {
                if node.bindings.items.is_none() {
                    let name = to_snake_case(&node.id);
                    if !seen_names.contains(&name) {
                        seen_names.insert(name.clone());
                        fields.push(InferredField {
                            name,
                            field_type: StateType::VecString,
                            default_value: StateDefaultValue::VecString(
                                node.properties.options.clone(),
                            ),
                        });
                    }
                }
            }
            _ => {}
        }
    }
}

pub fn generate_app_state_tokens(fields: &[InferredField]) -> TokenStream {
    if fields.is_empty() {
        return quote! {
            #[derive(Debug, Clone, PartialEq, Default)]
            pub struct AppState {}
        };
    }

    let field_defs = fields.iter().map(|f| {
        let ident = make_ident(&f.name);
        let ty = match f.field_type {
            StateType::String => quote!(String),
            StateType::Bool => quote!(bool),
            StateType::F64 => quote!(f64),
            StateType::OptionString => quote!(Option<String>),
            StateType::VecString => quote!(Vec<String>),
        };
        quote!(pub #ident: #ty)
    });

    let field_inits = fields.iter().map(|f| {
        let ident = make_ident(&f.name);
        let init_expr = f.default_expr_tokens();
        quote!(#ident: #init_expr)
    });

    quote! {
        #[derive(Debug, Clone, PartialEq)]
        pub struct AppState {
            #(#field_defs,)*
        }

        impl Default for AppState {
            fn default() -> Self {
                Self {
                    #(#field_inits,)*
                }
            }
        }
    }
}

