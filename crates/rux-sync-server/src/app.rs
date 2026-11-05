use std::sync::Arc;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::{
    models::{CreatePresetPayload, HealthResponse, TeamPresetRecord},
    room::RoomManager,
    storage::PresetStorage,
    websocket::ws_handler,
};

pub struct AppState {
    pub storage: PresetStorage,
    pub room_manager: Arc<RoomManager>,
}

pub fn create_app(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/ws", get(ws_handler))
        .route("/api/presets", get(list_presets_handler).post(create_preset_handler))
        .route("/api/presets/{id}", get(get_preset_handler).delete(delete_preset_handler))
        .layer(cors)
        .with_state(state)
}

async fn health_handler() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "rux-sync-server".to_string(),
        version: "0.1.0".to_string(),
    })
}

async fn list_presets_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<TeamPresetRecord>>, StatusCode> {
    state
        .storage
        .list_presets()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_preset_handler(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<TeamPresetRecord>, StatusCode> {
    match state.storage.get_preset(&id) {
        Ok(Some(record)) => Ok(Json(record)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn create_preset_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreatePresetPayload>,
) -> Result<(StatusCode, Json<TeamPresetRecord>), StatusCode> {
    match state.storage.save_preset(payload) {
        Ok(created) => Ok((StatusCode::CREATED, Json(created))),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn delete_preset_handler(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> StatusCode {
    match state.storage.delete_preset(&id) {
        Ok(true) => StatusCode::NO_CONTENT,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
