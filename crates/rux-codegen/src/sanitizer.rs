use proc_macro2::Span;
use syn::Ident;

pub fn strip_state_prefix(input: &str) -> &str {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix("app_state.") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("state.") {
        rest
    } else {
        trimmed
    }
}

pub fn to_snake_case(input: &str) -> String {
    let raw = strip_state_prefix(input);
    let mut result = String::with_capacity(raw.len() + 4);
    let mut prev_is_underscore = false;
    let mut prev_is_upper = false;

    for (i, ch) in raw.chars().enumerate() {
        if ch.is_alphanumeric() {
            if ch.is_uppercase() {
                if i > 0 && !prev_is_underscore && !prev_is_upper {
                    result.push('_');
                }
                result.extend(ch.to_lowercase());
                prev_is_upper = true;
            } else {
                result.push(ch);
                prev_is_upper = false;
            }
            prev_is_underscore = false;
        } else {
            if !prev_is_underscore && !result.is_empty() {
                result.push('_');
                prev_is_underscore = true;
            }
            prev_is_upper = false;
        }
    }

    let trimmed = result.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "field_value".to_string()
    } else if is_rust_keyword(&trimmed) {
        format!("r#{}", trimmed)
    } else if trimmed.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        format!("field_{}", trimmed)
    } else {
        trimmed
    }
}

pub fn to_pascal_case(input: &str) -> String {
    let raw = strip_state_prefix(input);
    let mut result = String::with_capacity(raw.len());
    let mut capitalize_next = true;

    for ch in raw.chars() {
        if ch.is_alphanumeric() {
            if capitalize_next {
                result.extend(ch.to_uppercase());
                capitalize_next = false;
            } else {
                result.push(ch);
            }
        } else {
            capitalize_next = true;
        }
    }

    if result.is_empty() {
        "CustomMessage".to_string()
    } else if result.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        format!("Msg{}", result)
    } else {
        result
    }
}

pub fn to_handler_name(input: &str) -> String {
    let snake = to_snake_case(input);
    let clean = snake.trim_start_matches("r#");
    if clean.starts_with("on_") {
        clean.to_string()
    } else {
        format!("on_{}", clean)
    }
}

pub fn make_ident(name: &str) -> Ident {
    if let Some(raw) = name.strip_prefix("r#") {
        syn::parse_str::<Ident>(&format!("r#{}", raw)).unwrap_or_else(|_| Ident::new("field", Span::call_site()))
    } else if is_rust_keyword(name) {
        syn::parse_str::<Ident>(&format!("r#{}", name)).unwrap_or_else(|_| Ident::new("field", Span::call_site()))
    } else {
        Ident::new(name, Span::call_site())
    }
}

fn is_rust_keyword(word: &str) -> bool {
    matches!(
        word,
        "as" | "break"
            | "const"
            | "continue"
            | "crate"
            | "else"
            | "enum"
            | "extern"
            | "false"
            | "fn"
            | "for"
            | "if"
            | "impl"
            | "in"
            | "let"
            | "loop"
            | "match"
            | "mod"
            | "move"
            | "mut"
            | "pub"
            | "ref"
            | "return"
            | "self"
            | "Self"
            | "static"
            | "struct"
            | "super"
            | "trait"
            | "true"
            | "type"
            | "unsafe"
            | "use"
            | "where"
            | "while"
            | "async"
            | "await"
            | "dyn"
            | "abstract"
            | "become"
            | "box"
            | "do"
            | "final"
            | "macro"
            | "override"
            | "priv"
            | "typeof"
            | "unsized"
            | "virtual"
            | "yield"
            | "try"
    )
}

