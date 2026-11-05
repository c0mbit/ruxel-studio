use std::sync::Arc;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;

use crate::{
    app::AppState,
    models::RoomQuery,
    protocol::{parse_message_type, parse_sync_message, read_var_uint_bytes, MESSAGE_SYNC, SYNC_UPDATE},
};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<RoomQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let room_id = query.room.unwrap_or_else(|| "default-room".to_string());
    let client_id = format!("client_{}", Uuid::new_v4().simple());
    ws.on_upgrade(move |socket| handle_socket(socket, state, room_id, client_id))
}

async fn handle_socket(
    socket: WebSocket,
    state: Arc<AppState>,
    room_id: String,
    client_id: String,
) {
    let (_room, mut rx) = state.room_manager.get_or_create_room(&room_id).await;
    let (mut ws_tx, mut ws_rx) = socket.split();

    let existing_updates = state.room_manager.get_updates(&room_id).await;
    for update in existing_updates {
        if ws_tx.send(Message::Binary(update.into())).await.is_err() {
            return;
        }
    }

    let outgoing_client_id = client_id.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if event.sender_id != outgoing_client_id {
                if ws_tx.send(Message::Binary(event.payload.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    let incoming_state = Arc::clone(&state);
    let incoming_room_id = room_id.clone();
    let incoming_client_id = client_id.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Binary(bytes) => {
                    let raw = bytes.to_vec();
                    if let Some((msg_type, rest)) = parse_message_type(&raw) {
                        if msg_type == MESSAGE_SYNC {
                            if let Some((sync_type, payload)) = parse_sync_message(rest) {
                                if sync_type == SYNC_UPDATE {
                                    if let Some((update_data, _)) = read_var_uint_bytes(payload) {
                                        incoming_state
                                            .room_manager
                                            .record_update(&incoming_room_id, raw.clone())
                                            .await;
                                        let _ = update_data;
                                    }
                                }
                            }
                        }
                    }
                    incoming_state
                        .room_manager
                        .broadcast(&incoming_room_id, &incoming_client_id, raw)
                        .await;
                }
                Message::Ping(p) => {
                    let _ = p;
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}

