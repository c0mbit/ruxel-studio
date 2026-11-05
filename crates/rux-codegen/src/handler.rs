use std::collections::{BTreeMap, HashSet};
use proc_macro2::TokenStream;
use quote::quote;

use crate::events::{BoundEvent, EventPayloadType};
use crate::sanitizer::make_ident;

pub fn generate_ui_handler_tokens(events: &[BoundEvent]) -> TokenStream {
    if events.is_empty() {
        return quote! {
            pub trait UiHandler {
                fn dispatch(&mut self, _state: &mut AppState, _message: UiMessage) {}
            }
        };
    }

    let mut unique_handlers: BTreeMap<String, EventPayloadType> = BTreeMap::new();
    let mut variant_to_handler: BTreeMap<String, (String, EventPayloadType)> = BTreeMap::new();

    for ev in events {
        unique_handlers
            .entry(ev.handler_name.clone())
            .or_insert(ev.payload_type.clone());
        variant_to_handler
            .entry(ev.message_variant.clone())
            .or_insert((ev.handler_name.clone(), ev.payload_type.clone()));
    }

    let method_decls = unique_handlers.iter().map(|(name, payload_type)| {
        let ident = make_ident(name);
        match payload_type {
            EventPayloadType::Unit => {
                quote!(fn #ident(&mut self, state: &mut AppState);)
            }
            EventPayloadType::String => {
                quote!(fn #ident(&mut self, state: &mut AppState, value: String);)
            }
            EventPayloadType::Bool => {
                quote!(fn #ident(&mut self, state: &mut AppState, value: bool);)
            }
            EventPayloadType::F64 => {
                quote!(fn #ident(&mut self, state: &mut AppState, value: f64);)
            }
        }
    });

    let mut seen_variants: HashSet<String> = HashSet::new();
    let mut match_arms: Vec<TokenStream> = Vec::new();

    for (variant, (handler_name, payload_type)) in &variant_to_handler {
        if !seen_variants.contains(variant) {
            seen_variants.insert(variant.clone());
            let variant_ident = make_ident(variant);
            let handler_ident = make_ident(handler_name);

            let arm = match payload_type {
                EventPayloadType::Unit => {
                    quote!(UiMessage::#variant_ident => self.#handler_ident(state),)
                }
                _ => {
                    quote!(UiMessage::#variant_ident(value) => self.#handler_ident(state, value),)
                }
            };
            match_arms.push(arm);
        }
    }

    quote! {
        pub trait UiHandler {
            #(#method_decls)*

            fn dispatch(&mut self, state: &mut AppState, message: UiMessage) {
                match message {
                    #(#match_arms)*
                }
            }
        }
    }
}

