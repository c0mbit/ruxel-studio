use std::collections::{BTreeMap, HashSet};
use quote::quote;
use syn::{parse_quote, File, ImplItem, ImplItemFn, Item, ItemImpl, ItemStruct};

use crate::error::CodegenError;
use crate::events::{BoundEvent, EventPayloadType};
use crate::sanitizer::make_ident;

pub fn generate_initial_controller(events: &[BoundEvent]) -> String {
    let mut unique_handlers: BTreeMap<String, EventPayloadType> = BTreeMap::new();
    for ev in events {
        unique_handlers
            .entry(ev.handler_name.clone())
            .or_insert(ev.payload_type.clone());
    }

    let method_defs = unique_handlers.iter().map(|(name, payload)| {
        let ident = make_ident(name);
        match payload {
            EventPayloadType::Unit => {
                quote! {
                    fn #ident(&mut self, state: &mut AppState) {
                        let _ = state;
                    }
                }
            }
            EventPayloadType::String => {
                quote! {
                    fn #ident(&mut self, state: &mut AppState, value: String) {
                        let _ = (state, value);
                    }
                }
            }
            EventPayloadType::Bool => {
                quote! {
                    fn #ident(&mut self, state: &mut AppState, value: bool) {
                        let _ = (state, value);
                    }
                }
            }
            EventPayloadType::F64 => {
                quote! {
                    fn #ident(&mut self, state: &mut AppState, value: f64) {
                        let _ = (state, value);
                    }
                }
            }
        }
    });

    let tokens = quote! {
        use super::ui_generated::{AppState, UiHandler, UiMessage};

        pub struct Controller;

        impl Controller {
            pub fn new() -> Self {
                Self
            }
        }

        impl UiHandler for Controller {
            #(#method_defs)*
        }
    };

    let syntax_file: File = syn::parse2(tokens).unwrap();
    prettyplease::unparse(&syntax_file)
}

pub fn merge_controller(
    existing_source: &str,
    events: &[BoundEvent],
) -> Result<String, CodegenError> {
    let mut file: File = syn::parse_file(existing_source)
        .map_err(|e| CodegenError::SynParseError(format!("{}", e)))?;

    let mut unique_handlers: BTreeMap<String, EventPayloadType> = BTreeMap::new();
    for ev in events {
        unique_handlers
            .entry(ev.handler_name.clone())
            .or_insert(ev.payload_type.clone());
    }

    let mut has_ui_handler_import = false;
    for item in &file.items {
        if let Item::Use(item_use) = item {
            let use_str = quote!(#item_use).to_string();
            if use_str.contains("UiHandler") {
                has_ui_handler_import = true;
                break;
            }
        }
    }

    if !has_ui_handler_import {
        let import_item: Item = parse_quote! {
            use super::ui_generated::{AppState, UiHandler, UiMessage};
        };
        file.items.insert(0, import_item);
    }

    let mut has_controller_struct = false;
    for item in &file.items {
        if let Item::Struct(ItemStruct { ident, .. }) = item {
            if ident == "Controller" {
                has_controller_struct = true;
                break;
            }
        }
    }

    if !has_controller_struct {
        let struct_item: Item = parse_quote! {
            pub struct Controller;
        };
        file.items.push(struct_item);
    }

    let mut target_impl: Option<&mut ItemImpl> = None;
    for item in &mut file.items {
        if let Item::Impl(item_impl) = item {
            if let Some((ref trait_path, _)) = item_impl.trait_ {
                if let Some(last_seg) = trait_path.segments.last() {
                    if last_seg.ident == "UiHandler" {
                        if let syn::Type::Path(ref type_path) = *item_impl.self_ty {
                            if let Some(type_seg) = type_path.path.segments.last() {
                                if type_seg.ident == "Controller" {
                                    target_impl = Some(item_impl);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(item_impl) = target_impl {
        let mut existing_methods: HashSet<String> = HashSet::new();
        for impl_item in &item_impl.items {
            if let ImplItem::Fn(ImplItemFn { sig, .. }) = impl_item {
                existing_methods.insert(sig.ident.to_string());
            }
        }

        for (name, payload) in &unique_handlers {
            if !existing_methods.contains(name) {
                let method_ident = make_ident(name);
                let new_fn: ImplItemFn = match payload {
                    EventPayloadType::Unit => parse_quote! {
                        fn #method_ident(&mut self, state: &mut AppState) {
                            let _ = state;
                        }
                    },
                    EventPayloadType::String => parse_quote! {
                        fn #method_ident(&mut self, state: &mut AppState, value: String) {
                            let _ = (state, value);
                        }
                    },
                    EventPayloadType::Bool => parse_quote! {
                        fn #method_ident(&mut self, state: &mut AppState, value: bool) {
                            let _ = (state, value);
                        }
                    },
                    EventPayloadType::F64 => parse_quote! {
                        fn #method_ident(&mut self, state: &mut AppState, value: f64) {
                            let _ = (state, value);
                        }
                    },
                };
                item_impl.items.push(ImplItem::Fn(new_fn));
            }
        }
    } else {
        let mut new_methods: Vec<ImplItem> = Vec::new();
        for (name, payload) in &unique_handlers {
            let method_ident = make_ident(name);
            let new_fn: ImplItemFn = match payload {
                EventPayloadType::Unit => parse_quote! {
                    fn #method_ident(&mut self, state: &mut AppState) {
                        let _ = state;
                    }
                },
                EventPayloadType::String => parse_quote! {
                    fn #method_ident(&mut self, state: &mut AppState, value: String) {
                        let _ = (state, value);
                    }
                },
                EventPayloadType::Bool => parse_quote! {
                    fn #method_ident(&mut self, state: &mut AppState, value: bool) {
                        let _ = (state, value);
                    }
                },
                EventPayloadType::F64 => parse_quote! {
                    fn #method_ident(&mut self, state: &mut AppState, value: f64) {
                        let _ = (state, value);
                    }
                },
            };
            new_methods.push(ImplItem::Fn(new_fn));
        }

        let new_impl: ItemImpl = parse_quote! {
            impl UiHandler for Controller {
                #(#new_methods)*
            }
        };
        file.items.push(Item::Impl(new_impl));
    }

    Ok(prettyplease::unparse(&file))
}
