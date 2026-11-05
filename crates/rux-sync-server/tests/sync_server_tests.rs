use std::sync::Arc;
use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use futures_util::{SinkExt, StreamExt};
use http_body_util::BodyExt;
use tokio_tungstenite::connect_async;
use tower::util::ServiceExt;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use rux_sync_server::{
    create_app, create_awareness_message, create_sync_step1_message, create_sync_step2_message,
    create_sync_update_message, parse_message_type, parse_sync_message, read_var_uint,
    read_var_uint_bytes, write_var_uint, write_var_uint_bytes, AppState, CreatePresetPayload,
    PresetStorage, RoomManager, HealthResponse, TeamPresetRecord, MESSAGE_AWARENESS, MESSAGE_SYNC,
    SYNC_STEP_1, SYNC_STEP_2, SYNC_UPDATE,
};

#[test]
fn test_var_uint_roundtrip() {
    let test_values = [0, 1, 127, 128, 255, 300, 16384, 2097151, u64::MAX / 2];
    for &val in &test_values {
        let mut buf = Vec::new();
        write_var_uint(&mut buf, val);
        let (decoded, consumed) = read_var_uint(&buf).expect("Failed to decode varuint");
        assert_eq!(decoded, val);
        assert_eq!(consumed, buf.len());
    }
}

#[test]
fn test_var_uint_bytes_roundtrip() {
    let payload = b"Hello Ruxel Distributed CRDT!";
    let mut buf = Vec::new();
    write_var_uint_bytes(&mut buf, payload);
    let (decoded, consumed) = read_var_uint_bytes(&buf).expect("Failed to decode varuint bytes");
    assert_eq!(decoded, payload);
    assert_eq!(consumed, buf.len());
}

#[test]
fn test_protocol_framing_sync_and_awareness() {
    let delta = vec![1, 2, 3, 4, 5, 42, 99];
    let sync_msg = create_sync_update_message(&delta);
    let (msg_type, rest) = parse_message_type(&sync_msg).expect("Failed to parse msg type");
    assert_eq!(msg_type, MESSAGE_SYNC);

    let (sync_type, payload) = parse_sync_message(rest).expect("Failed to parse sync type");
    assert_eq!(sync_type, SYNC_UPDATE);
    let (data, _) = read_var_uint_bytes(payload).expect("Failed to read payload bytes");
    assert_eq!(data, &delta);

    let step1 = create_sync_step1_message(&delta);
    let (msg_type, rest) = parse_message_type(&step1).unwrap();
    assert_eq!(msg_type, MESSAGE_SYNC);
    let (sync_type, payload) = parse_sync_message(rest).unwrap();
    assert_eq!(sync_type, SYNC_STEP_1);
    let (data, _) = read_var_uint_bytes(payload).unwrap();
    assert_eq!(data, &delta);

    let step2 = create_sync_step2_message(&delta);
    let (msg_type, rest) = parse_message_type(&step2).unwrap();
    assert_eq!(msg_type, MESSAGE_SYNC);
    let (sync_type, payload) = parse_sync_message(rest).unwrap();
    assert_eq!(sync_type, SYNC_STEP_2);
    let (data, _) = read_var_uint_bytes(payload).unwrap();
    assert_eq!(data, &delta);

    let awareness_data = vec![10, 20, 30];
    let awareness_msg = create_awareness_message(&awareness_data);
    let (msg_type, rest) = parse_message_type(&awareness_msg).unwrap();
    assert_eq!(msg_type, MESSAGE_AWARENESS);
    let (data, _) = read_var_uint_bytes(rest).unwrap();
    assert_eq!(data, &awareness_data);
}

#[tokio::test]
async fn test_room_isolation_and_broadcast() {
    let manager = RoomManager::new();

    let (_room_a, mut rx_a1) = manager.get_or_create_room("doc-project-alpha").await;
    let (_room_a2, mut rx_a2) = manager.get_or_create_room("doc-project-alpha").await;
    let (_room_b, mut rx_b) = manager.get_or_create_room("doc-project-beta").await;

    assert_eq!(manager.active_rooms().await, 2);

    let sent_count = manager
        .broadcast("doc-project-alpha", "client_alice", vec![101, 102])
        .await;
    assert_eq!(sent_count, 2);

    let event1 = rx_a1.recv().await.expect("rx_a1 received");
    assert_eq!(event1.sender_id, "client_alice");
    assert_eq!(event1.payload, vec![101, 102]);

    let event2 = rx_a2.recv().await.expect("rx_a2 received");
    assert_eq!(event2.sender_id, "client_alice");
    assert_eq!(event2.payload, vec![101, 102]);

    tokio::select! {
        _ = rx_b.recv() => panic!("Room B should not receive Room A messages"),
        _ = tokio::time::sleep(tokio::time::Duration::from_millis(50)) => {}
    }
}

#[tokio::test]
async fn test_room_doc_history_persistence() {
    let manager = RoomManager::new();
    let room_id = "doc-canvas-main";

    let update_1 = vec![1, 2, 3];
    let update_2 = vec![4, 5, 6];

    manager.record_update(room_id, update_1.clone()).await;
    manager.record_update(room_id, update_2.clone()).await;

    let updates = manager.get_updates(room_id).await;
    assert_eq!(updates.len(), 2);
    assert_eq!(updates[0], update_1);
    assert_eq!(updates[1], update_2);
}

#[test]
fn test_preset_storage_crud() {
    let storage = PresetStorage::new_in_memory().expect("in memory sqlite");
    let initial_presets = storage.list_presets().expect("list presets");
    assert!(!initial_presets.is_empty());

    let payload = CreatePresetPayload {
        name: "Test Form Container".to_string(),
        description: Some("Form layout preset for login".to_string()),
        category: Some("Forms".to_string()),
        author: Some("Architect".to_string()),
        root_node: serde_json::json!({
            "id": "form_root",
            "widget_type": "v_box",
            "children": []
        }),
        tags: Some(vec!["auth".to_string(), "form".to_string()]),
    };

    let created = storage.save_preset(payload).expect("saved preset");
    assert!(!created.id.is_empty());
    assert_eq!(created.name, "Test Form Container");

    let retrieved = storage
        .get_preset(&created.id)
        .expect("get preset")
        .expect("preset found");
    assert_eq!(retrieved.id, created.id);
    assert_eq!(retrieved.name, "Test Form Container");
    assert_eq!(retrieved.tags, vec!["auth", "form"]);

    let deleted = storage.delete_preset(&created.id).expect("deleted preset");
    assert!(deleted);

    let after_delete = storage.get_preset(&created.id).expect("get after delete");
    assert!(after_delete.is_none());
}

#[tokio::test]
async fn test_rest_api_endpoints() {
    let storage = PresetStorage::new_in_memory().expect("sqlite in memory");
    let room_manager = Arc::new(RoomManager::new());
    let state = Arc::new(AppState {
        storage,
        room_manager,
    });

    let app = create_app(state);

    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let health: HealthResponse = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(health.status, "ok");
    assert_eq!(health.service, "rux-sync-server");

    let req = Request::builder()
        .uri("/api/presets")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let presets: Vec<TeamPresetRecord> = serde_json::from_slice(&bytes).unwrap();
    assert!(!presets.is_empty());

    let new_preset = serde_json::json!({
        "name": "Integration Test Card",
        "description": "Created during integration testing",
        "category": "Testing",
        "author": "QA Bot",
        "root_node": {
            "id": "test_root",
            "widget_type": "button",
            "properties": {
                "text": "Click Test"
            }
        },
        "tags": ["test", "ci"]
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/presets")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&new_preset).unwrap()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let created: TeamPresetRecord = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(created.name, "Integration Test Card");

    let req = Request::builder()
        .uri(format!("/api/presets/{}", created.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/presets/{}", created.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_concurrent_websocket_clients_sync() {
    let storage = PresetStorage::new_in_memory().expect("sqlite in memory");
    let room_manager = Arc::new(RoomManager::new());
    let state = Arc::new(AppState {
        storage,
        room_manager,
    });

    let app = create_app(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    let ws_url_a1 = format!("ws://127.0.0.1:{port}/ws?room=collab_room_1&user=Alice");
    let ws_url_a2 = format!("ws://127.0.0.1:{port}/ws?room=collab_room_1&user=Bob");
    let ws_url_b = format!("ws://127.0.0.1:{port}/ws?room=collab_room_2&user=Charlie");

    let (mut client_a1, _) = connect_async(&ws_url_a1).await.unwrap();
    let (mut client_a2, _) = connect_async(&ws_url_a2).await.unwrap();
    let (mut client_b, _) = connect_async(&ws_url_b).await.unwrap();

    let sample_update = create_sync_update_message(&[10, 20, 30, 40]);
    client_a1
        .send(WsMessage::Binary(sample_update.clone().into()))
        .await
        .unwrap();

    let received_by_a2 = client_a2.next().await.unwrap().unwrap();
    match received_by_a2 {
        WsMessage::Binary(data) => {
            assert_eq!(data, sample_update);
        }
        other => panic!("Expected Binary message, got {:?}", other),
    }

    tokio::select! {
        msg = client_b.next() => {
            if let Some(Ok(m)) = msg {
                panic!("Room 2 received unexpected message: {:?}", m);
            }
        }
        _ = tokio::time::sleep(tokio::time::Duration::from_millis(50)) => {}
    }
}
