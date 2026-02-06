use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::{net::SocketAddr, sync::{Arc, atomic::{AtomicUsize, Ordering}}};
use tokio::sync::{broadcast, RwLock};
use tower_http::services::ServeDir;
use uuid::Uuid;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::time::{SystemTime, UNIX_EPOCH};

const TURN_TTL: u64 = 3600; // 1 Hour

#[derive(serde::Serialize)]
struct IceConfig {
    iceServers: Vec<IceServer>,
}

#[derive(serde::Serialize)]
struct IceServer {
    urls: String,
    username: String,
    credential: String,
}

// ... (existing main)

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let app_state = AppState {
        rooms: Arc::new(RwLock::new(Vec::new())),
    };

    let app = Router::new()
        .nest_service("/", ServeDir::new("../client/dist")) // Serve static files
        .route("/ws", get(ws_handler))
        .route("/api/ice-config", get(get_ice_config))
        .with_state(app_state);

    let addr = SocketAddr::from((std::net::Ipv6Addr::UNSPECIFIED, 9090));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_ice_config() -> axum::Json<IceConfig> {
    let secret = std::env::var("TURN_SECRET").unwrap_or_else(|_| "dev_secret_local_only".to_string());
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() + TURN_TTL;
    let username = format!("{}:moli", timestamp);
    
    type HmacSha1 = Hmac<Sha1>;
    let mut mac = HmacSha1::new_from_slice(secret.as_bytes()).expect("HMAC can take key of any size");
    mac.update(username.as_bytes());
    let credential = STANDARD.encode(mac.finalize().into_bytes());

    axum::Json(IceConfig {
        iceServers: vec![
            IceServer {
                urls: "turn:moli-green.is:3478".to_string(),
                username,
                credential,
            },
            IceServer {
                urls: "stun:stun.l.google.com:19302".to_string(), // Fallback
                username: "".to_string(),
                credential: "".to_string(),
            }
        ]
    })
}

// ... (rest of file)

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let my_id = Uuid::new_v4().to_string();

    // 1. Assign Room
    let (tx, count_ref, room_id) = {
        let mut rooms = state.rooms.write().await;
        
        // Find available room
        let mut target_room_index = None;
        for (i, room) in rooms.iter().enumerate() {
            if room.count.load(Ordering::Relaxed) < ROOM_CAPACITY {
                target_room_index = Some(i);
                break;
            }
        }

        if let Some(index) = target_room_index {
            // Join existing
            let room = &rooms[index];
            room.count.fetch_add(1, Ordering::Relaxed);
            // println!("User {} joined Room {} (Count: {})", my_id, room.id, room.count.load(Ordering::Relaxed));
            (room.tx.clone(), room.count.clone(), room.id.clone())
        } else {
            // Create new
            let (tx, _rx) = broadcast::channel::<Arc<BroadcastMsg>>(100);
            let count = Arc::new(AtomicUsize::new(1));
            let new_id = Uuid::new_v4().to_string();
            rooms.push(Room {
                id: new_id.clone(),
                tx: tx.clone(),
                count: count.clone(),
            });
            // println!("User {} created Room {} (Count: 1)", my_id, new_id);
            (tx, count, new_id)
        }
    };

    let mut rx = tx.subscribe();

    // 2. Event Loop
    loop {
        tokio::select! {
            Some(msg) = socket.recv() => {
                if let Ok(Message::Text(text)) = msg {
                    let msg = Arc::new(BroadcastMsg {
                        sender_id: my_id.clone(),
                        payload: text,
                    });
                    // Broadcast ONLY to this room
                    let _ = tx.send(msg);
                } else {
                    break;
                }
            }
            Ok(msg) = rx.recv() => {
                // Filter self
                if msg.sender_id != my_id {
                    if socket.send(Message::Text(msg.payload.clone())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    // 3. Cleanup
    // Decrement count
    let prev = count_ref.fetch_sub(1, Ordering::Relaxed);
    // println!("User {} left Room {}. (Count -> {})", my_id, room_id, prev - 1);

    // Send Leave Msg (To Room Only)
    let leave_msg = Arc::new(BroadcastMsg {
        sender_id: my_id.clone(),
        payload: format!("{{\"type\": \"leave\", \"senderId\": \"{}\"}}", my_id),
    });
    let _ = tx.send(leave_msg);
    
    // Optional: Prune empty rooms? 
    // Complexity: High (Need to lock Global State inside async task). 
    // Decision: Lazy. Let them persist. They are just structs with channels. Overhead is low.
}
