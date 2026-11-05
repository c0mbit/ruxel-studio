use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Clone, Debug)]
pub struct RoomEvent {
    pub sender_id: String,
    pub payload: Vec<u8>,
}

pub struct Room {
    pub id: String,
    pub tx: broadcast::Sender<RoomEvent>,
    pub doc_updates: Vec<Vec<u8>>,
}

impl Room {
    pub fn new(id: String) -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self {
            id,
            tx,
            doc_updates: Vec::new(),
        }
    }

    pub fn append_update(&mut self, update: Vec<u8>) {
        self.doc_updates.push(update);
    }
}

#[derive(Clone)]
pub struct RoomManager {
    rooms: Arc<RwLock<HashMap<String, Arc<RwLock<Room>>>>>,
}

impl Default for RoomManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_or_create_room(&self, room_id: &str) -> (Arc<RwLock<Room>>, broadcast::Receiver<RoomEvent>) {
        let mut rooms = self.rooms.write().await;
        if let Some(room) = rooms.get(room_id) {
            let rx = room.read().await.tx.subscribe();
            return (Arc::clone(room), rx);
        }

        let room = Arc::new(RwLock::new(Room::new(room_id.to_string())));
        let rx = room.read().await.tx.subscribe();
        rooms.insert(room_id.to_string(), Arc::clone(&room));
        (room, rx)
    }

    pub async fn broadcast(&self, room_id: &str, sender_id: &str, payload: Vec<u8>) -> usize {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(room_id) {
            let r = room.read().await;
            let event = RoomEvent {
                sender_id: sender_id.to_string(),
                payload,
            };
            r.tx.send(event).unwrap_or(0)
        } else {
            0
        }
    }

    pub async fn record_update(&self, room_id: &str, update: Vec<u8>) {
        let (room, _) = self.get_or_create_room(room_id).await;
        let mut r = room.write().await;
        r.append_update(update);
    }

    pub async fn get_updates(&self, room_id: &str) -> Vec<Vec<u8>> {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(room_id) {
            let r = room.read().await;
            r.doc_updates.clone()
        } else {
            Vec::new()
        }
    }

    pub async fn active_rooms(&self) -> usize {
        self.rooms.read().await.len()
    }
}
