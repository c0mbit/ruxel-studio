use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::error::AutopatchError;

#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status_code: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

impl HttpResponse {
    pub fn ok(body: impl Into<String>) -> Self {
        Self {
            status_code: 200,
            body: body.into(),
            headers: HashMap::new(),
        }
    }

    pub fn new(status_code: u16, body: impl Into<String>) -> Self {
        Self {
            status_code,
            body: body.into(),
            headers: HashMap::new(),
        }
    }
}

pub trait HttpTransport: Send + Sync {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, AutopatchError>;
    fn post(&self, url: &str, headers: &[(&str, &str)], body: &str) -> Result<HttpResponse, AutopatchError>;
}

pub struct UreqHttpTransport;

impl UreqHttpTransport {
    pub fn new() -> Self {
        Self
    }
}

impl Default for UreqHttpTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl HttpTransport for UreqHttpTransport {
    fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<HttpResponse, AutopatchError> {
        let mut request = ureq::get(url);
        for (k, v) in headers {
            request = request.set(k, v);
        }

        match request.call() {
            Ok(response) => {
                let status_code = response.status();
                let mut resp_headers = HashMap::new();
                for name in response.headers_names() {
                    if let Some(val) = response.header(&name) {
                        resp_headers.insert(name, val.to_string());
                    }
                }
                let body = response
                    .into_string()
                    .map_err(|e| AutopatchError::Http(e.to_string()))?;
                Ok(HttpResponse {
                    status_code,
                    body,
                    headers: resp_headers,
                })
            }
            Err(ureq::Error::Status(code, response)) => {
                let body = response
                    .into_string()
                    .unwrap_or_else(|_| String::new());
                Ok(HttpResponse {
                    status_code: code,
                    body,
                    headers: HashMap::new(),
                })
            }
            Err(ureq::Error::Transport(transport_err)) => {
                Err(AutopatchError::Http(transport_err.to_string()))
            }
        }
    }

    fn post(&self, url: &str, headers: &[(&str, &str)], body: &str) -> Result<HttpResponse, AutopatchError> {
        let mut request = ureq::post(url);
        for (k, v) in headers {
            request = request.set(k, v);
        }

        match request.send_string(body) {
            Ok(response) => {
                let status_code = response.status();
                let mut resp_headers = HashMap::new();
                for name in response.headers_names() {
                    if let Some(val) = response.header(&name) {
                        resp_headers.insert(name, val.to_string());
                    }
                }
                let body = response
                    .into_string()
                    .map_err(|e| AutopatchError::Http(e.to_string()))?;
                Ok(HttpResponse {
                    status_code,
                    body,
                    headers: resp_headers,
                })
            }
            Err(ureq::Error::Status(code, response)) => {
                let body = response
                    .into_string()
                    .unwrap_or_else(|_| String::new());
                Ok(HttpResponse {
                    status_code: code,
                    body,
                    headers: HashMap::new(),
                })
            }
            Err(ureq::Error::Transport(transport_err)) => {
                Err(AutopatchError::Http(transport_err.to_string()))
            }
        }
    }
}

type MockHandler = Box<dyn Fn(&str, &str, &str) -> Result<HttpResponse, AutopatchError> + Send + Sync>;

#[derive(Default)]
pub struct MockHttpTransport {
    handlers: Arc<Mutex<Vec<MockHandler>>>,
    exact_responses: Arc<Mutex<HashMap<String, HttpResponse>>>,
}

impl MockHttpTransport {
    pub fn new() -> Self {
        Self {
            handlers: Arc::new(Mutex::new(Vec::new())),
            exact_responses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_response(&self, url: impl Into<String>, response: HttpResponse) {
        let mut map = self.exact_responses.lock().unwrap();
        map.insert(url.into(), response);
    }

    pub fn add_handler<F>(&self, handler: F)
    where
        F: Fn(&str, &str, &str) -> Result<HttpResponse, AutopatchError> + Send + Sync + 'static,
    {
        let mut list = self.handlers.lock().unwrap();
        list.push(Box::new(handler));
    }
}

impl HttpTransport for MockHttpTransport {
    fn get(&self, url: &str, _headers: &[(&str, &str)]) -> Result<HttpResponse, AutopatchError> {
        let map = self.exact_responses.lock().unwrap();
        if let Some(resp) = map.get(url) {
            return Ok(resp.clone());
        }

        let handlers = self.handlers.lock().unwrap();
        for handler in handlers.iter() {
            if let Ok(resp) = handler("GET", url, "") {
                return Ok(resp);
            }
        }

        Err(AutopatchError::Http(format!("No mock response for GET {}", url)))
    }

    fn post(&self, url: &str, _headers: &[(&str, &str)], body: &str) -> Result<HttpResponse, AutopatchError> {
        let map = self.exact_responses.lock().unwrap();
        if let Some(resp) = map.get(url) {
            return Ok(resp.clone());
        }

        let handlers = self.handlers.lock().unwrap();
        for handler in handlers.iter() {
            if let Ok(resp) = handler("POST", url, body) {
                return Ok(resp);
            }
        }

        Err(AutopatchError::Http(format!("No mock response for POST {}", url)))
    }
}

