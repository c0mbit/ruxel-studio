use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TargetFramework {
    Iced,
    Egui,
    Slint,
    Dioxus,
    Fyne,
    Flet,
}

impl Default for TargetFramework {
    fn default() -> Self {
        Self::Iced
    }
}

fn default_schema_version() -> String {
    "1.0.0".to_string()
}

fn default_app_name() -> String {
    "RuxelApp".to_string()
}

fn default_app_version() -> String {
    "0.1.0".to_string()
}

fn default_target_frameworks() -> Vec<TargetFramework> {
    vec![TargetFramework::Iced]
}

fn deserialize_authors<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct AuthorsVisitor;

    impl<'de> serde::de::Visitor<'de> for AuthorsVisitor {
        type Value = Vec<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string author or a list of author strings")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(vec![value.to_string()])
        }

        fn visit_seq<S>(self, mut visitor: S) -> Result<Self::Value, S::Error>
        where
            S: serde::de::SeqAccess<'de>,
        {
            let mut vec = Vec::new();
            while let Some(element) = visitor.next_element()? {
                vec.push(element);
            }
            Ok(vec)
        }
    }

    deserializer.deserialize_any(AuthorsVisitor)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectMetadata {
    #[serde(default = "default_schema_version")]
    pub schema_version: String,
    #[serde(default = "default_app_name", alias = "name")]
    pub app_name: String,
    #[serde(default = "default_app_version", alias = "version")]
    pub app_version: String,
    #[serde(default = "default_target_frameworks", skip_serializing_if = "Vec::is_empty")]
    pub target_frameworks: Vec<TargetFramework>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, alias = "author", deserialize_with = "deserialize_authors", skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl Default for ProjectMetadata {
    fn default() -> Self {
        Self {
            schema_version: default_schema_version(),
            app_name: default_app_name(),
            app_version: default_app_version(),
            target_frameworks: default_target_frameworks(),
            description: None,
            authors: Vec::new(),
            license: Some("MIT".to_string()),
            created_at: None,
            updated_at: None,
        }
    }
}
