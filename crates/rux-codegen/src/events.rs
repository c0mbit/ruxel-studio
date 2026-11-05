use std::collections::HashSet;
use proc_macro2::TokenStream;
use quote::quote;
use rux_ast::document::RuxDocument;
use rux_ast::widget::{EventHandler, WidgetNode, WidgetType};

use crate::sanitizer::{make_ident, to_handler_name, to_pascal_case};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum EventPayloadType {
    Unit,
    String,
    Bool,
    F64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoundEvent {
    pub message_variant: String,
    pub handler_name: String,
    pub payload_type: EventPayloadType,
    pub widget_id: String,
    pub event_kind: String,
}

pub struct EventCollector;

impl EventCollector {
    pub fn collect_document(doc: &RuxDocument) -> Vec<BoundEvent> {
        let mut events: Vec<BoundEvent> = Vec::new();
        let mut seen_pairs: HashSet<(String, String)> = HashSet::new();
        Self::traverse_node(&doc.root, &mut events, &mut seen_pairs);
        events
    }

    fn traverse_node(
        node: &WidgetNode,
        events: &mut Vec<BoundEvent>,
        seen_pairs: &mut HashSet<(String, String)>,
    ) {
        if let Some(h) = &node.events.on_click {
            Self::add_event(
                node,
                "on_click",
                h,
                EventPayloadType::Unit,
                events,
                seen_pairs,
            );
        }
        if let Some(h) = &node.events.on_change {
            let payload = match node.widget_type {
                WidgetType::Checkbox | WidgetType::RadioButton => EventPayloadType::Bool,
                WidgetType::Slider | WidgetType::ProgressBar => EventPayloadType::F64,
                WidgetType::TextInput
                | WidgetType::ComboBox
                | WidgetType::TableView
                | WidgetType::TreeView => EventPayloadType::String,
                _ => EventPayloadType::String,
            };
            Self::add_event(node, "on_change", h, payload, events, seen_pairs);
        }
        if let Some(h) = &node.events.on_hover {
            Self::add_event(
                node,
                "on_hover",
                h,
                EventPayloadType::Unit,
                events,
                seen_pairs,
            );
        }
        if let Some(h) = &node.events.on_submit {
            Self::add_event(
                node,
                "on_submit",
                h,
                EventPayloadType::String,
                events,
                seen_pairs,
            );
        }
        if let Some(h) = &node.events.on_focus {
            Self::add_event(
                node,
                "on_focus",
                h,
                EventPayloadType::Unit,
                events,
                seen_pairs,
            );
        }
        for (custom_key, h) in &node.events.custom_events {
            let payload = if custom_key.contains("click")
                || custom_key.contains("hover")
                || custom_key.contains("focus")
            {
                EventPayloadType::Unit
            } else if custom_key.contains("toggle") || custom_key.contains("check") {
                EventPayloadType::Bool
            } else if custom_key.contains("num") || custom_key.contains("count") {
                EventPayloadType::F64
            } else {
                EventPayloadType::Unit
            };
            Self::add_event(node, custom_key, h, payload, events, seen_pairs);
        }

        for child in &node.children {
            Self::traverse_node(child, events, seen_pairs);
        }
    }

    fn add_event(
        node: &WidgetNode,
        event_kind: &str,
        handler: &EventHandler,
        payload_type: EventPayloadType,
        events: &mut Vec<BoundEvent>,
        seen_pairs: &mut HashSet<(String, String)>,
    ) {
        let variant = if let Some(msg) = &handler.message {
            if msg.trim().is_empty() {
                to_pascal_case(&handler.handler_name)
            } else {
                to_pascal_case(msg)
            }
        } else {
            to_pascal_case(&handler.handler_name)
        };

        let method = to_handler_name(&handler.handler_name);
        let pair_key = (variant.clone(), method.clone());
        if !seen_pairs.contains(&pair_key) {
            seen_pairs.insert(pair_key);
            events.push(BoundEvent {
                message_variant: variant,
                handler_name: method,
                payload_type,
                widget_id: node.id.clone(),
                event_kind: event_kind.to_string(),
            });
        }
    }
}

pub fn generate_ui_message_tokens(events: &[BoundEvent]) -> TokenStream {
    if events.is_empty() {
        return quote! {
            #[derive(Debug, Clone, PartialEq)]
            pub enum UiMessage {}
        };
    }

    let mut seen_variants: HashSet<String> = HashSet::new();
    let mut variant_defs: Vec<TokenStream> = Vec::new();

    for ev in events {
        if !seen_variants.contains(&ev.message_variant) {
            seen_variants.insert(ev.message_variant.clone());
            let ident = make_ident(&ev.message_variant);
            let def = match ev.payload_type {
                EventPayloadType::Unit => quote!(#ident),
                EventPayloadType::String => quote!(#ident(String)),
                EventPayloadType::Bool => quote!(#ident(bool)),
                EventPayloadType::F64 => quote!(#ident(f64)),
            };
            variant_defs.push(def);
        }
    }

    quote! {
        #[derive(Debug, Clone, PartialEq)]
        pub enum UiMessage {
            #(#variant_defs,)*
        }
    }
}

