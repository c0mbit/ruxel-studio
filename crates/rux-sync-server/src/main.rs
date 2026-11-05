use std::sync::Arc;
use rux_sync_server::{create_app, AppState, PresetStorage, RoomManager};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "4040".to_string());
    let addr = format!("0.0.0.0:{port}");

    let db_path = std::env::var("DB_PATH").unwrap_or_else(|_| "rux_cloud_presets.db".to_string());
    let storage = PresetStorage::new_file(&db_path).unwrap_or_else(|_| {
        PresetStorage::new_in_memory().expect("Failed to initialize storage")
    });

    let room_manager = Arc::new(RoomManager::new());
    let state = Arc::new(AppState {
        storage,
        room_manager,
    });

    let app = create_app(state);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!("Ruxel Sync Server listening on http://{addr}");
    axum::serve(listener, app).await?;

    Ok(())
}

