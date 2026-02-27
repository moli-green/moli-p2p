use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}, ConnectInfo},
    response::IntoResponse,
    routing::get,
    Router,
    http::StatusCode,
};
use std::{net::{SocketAddr, IpAddr}, sync::{Arc, RwLock as StdRwLock, atomic::{AtomicUsize, Ordering}}, collections::HashMap};
use tokio::sync::{broadcast, RwLock as TokioRwLock};
use tower_http::services::ServeDir;
use uuid::Uuid;
use hmac::{Hmac, Mac};
use sha1::Sha1;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::time::{SystemTime, UNIX_EPOCH};

// Constants
const ROOM_CAPACITY: usize = 100; // Production Limit
const MAX_GLOBAL_CONNECTIONS: usize = 1000; // Circuit Breaker
const TURN_TTL: u64 = 3600; // 1 Hour
const MAX_CONNS_PER_IP: usize = 10;
const MAX_MSG_SIZE: usize = 16 * 1024; // 16KB

struct BroadcastMsg {
    sender_id: String,
    payload: String,
}

struct Room {
    id: String,
    tx: broadcast::Sender<Arc<BroadcastMsg>>,
    count: Arc<AtomicUsize>,
}

#[derive(Clone)]
struct AppState {
    rooms: Arc<TokioRwLock<HashMap<String, Room>>>,
    conn_count: Arc<AtomicUsize>,
    ip_counts: Arc<StdRwLock<HashMap<IpAddr, usize>>>,
}

struct ConnectionGuard {
    ip: IpAddr,
    ip_counts: Arc<StdRwLock<HashMap<IpAddr, usize>>>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        if let Ok(mut counts) = self.ip_counts.write() {
             if let Some(count) = counts.get_mut(&self.ip) {
                 *count = count.saturating_sub(1);
                 if *count == 0 {
                     counts.remove(&self.ip);
                 }
             }
        }
    }
}

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

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    
    // Developer Convenience: Load .env if present (dev mode)
    dotenv::dotenv().ok();

    // SECURITY: Fail-safe Secret Enforcement
    if std::env::var("TURN_SECRET").is_err() {
        panic!("CRITICAL: TURN_SECRET environment variable is NOT set. Server cannot start securely.");
    }

    let app_state = AppState {
        rooms: Arc::new(TokioRwLock::new(HashMap::new())),
        conn_count: Arc::new(AtomicUsize::new(0)),
        ip_counts: Arc::new(StdRwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .nest_service("/", ServeDir::new("../client/dist")) // Serve static files
        .route("/ws", get(ws_handler))
        .route("/api/ice-config", get(get_ice_config))
        .with_state(app_state);

    let addr = SocketAddr::from((std::net::Ipv6Addr::UNSPECIFIED, 9090));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}

async fn get_ice_config() -> axum::Json<IceConfig> {
    let secret = std::env::var("TURN_SECRET").expect("TURN_SECRET must be set");
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

async fn ws_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let ip = addr.ip();

    // SECURITY: Origin Validation (Optional)
    if let Ok(allowed_origin) = std::env::var("ALLOWED_ORIGIN") {
        if let Some(origin) = headers.get("origin") {
            if let Ok(origin_str) = origin.to_str() {
                if origin_str != allowed_origin {
                    println!("Origin mismatch: {} != {}", origin_str, allowed_origin);
                    return (StatusCode::FORBIDDEN, "Forbidden Origin").into_response();
                }
            }
        }
    }

    // SECURITY: Global Connection Limit (Circuit Breaker)
    if state.conn_count.load(Ordering::Relaxed) >= MAX_GLOBAL_CONNECTIONS {
        return (StatusCode::SERVICE_UNAVAILABLE, "Server Busy").into_response();
    }

    // SECURITY: IP Rate Limiting
    let guard = {
        match state.ip_counts.write() {
            Ok(mut ip_counts) => {
                let count = ip_counts.entry(ip).or_insert(0);
                if *count >= MAX_CONNS_PER_IP {
                    println!("Rate Limit Reached for IP: {}", ip);
                    return (StatusCode::TOO_MANY_REQUESTS, "Rate Limit Exceeded").into_response();
                }
                *count += 1;
                ConnectionGuard {
                    ip,
                    ip_counts: state.ip_counts.clone(),
                }
            }
            Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Lock Poisoned").into_response(),
        }
    };

    ws.max_frame_size(MAX_MSG_SIZE)
      .max_message_size(MAX_MSG_SIZE)
      .on_upgrade(move |socket| handle_socket(socket, state, guard))
}

async fn handle_socket(mut socket: WebSocket, state: AppState, _guard: ConnectionGuard) {
    let my_id = Uuid::new_v4().to_string();

    // Increment Global Count
    state.conn_count.fetch_add(1, Ordering::Relaxed);

    // 1. Assign Room
    let (tx, count_ref, room_id) = {
        let mut rooms = state.rooms.write().await;
        
        // Find available room
        let mut target_room_id = None;
        for room in rooms.values() {
            if room.count.load(Ordering::Relaxed) < ROOM_CAPACITY {
                target_room_id = Some(room.id.clone());
                break;
            }
        }

        if let Some(id) = target_room_id {
            // Join existing
            let room = rooms.get(&id).unwrap();
            room.count.fetch_add(1, Ordering::Relaxed);
            // println!("User {} joined Room {} (Count: {})", my_id, room.id, room.count.load(Ordering::Relaxed));
            (room.tx.clone(), room.count.clone(), room.id.clone())
        } else {
            // Create new
            let (tx, _rx) = broadcast::channel::<Arc<BroadcastMsg>>(100);
            let count = Arc::new(AtomicUsize::new(1));
            let new_id = Uuid::new_v4().to_string();
            rooms.insert(new_id.clone(), Room {
                id: new_id.clone(),
                tx: tx.clone(),
                count: count.clone(),
            });
            // println!("User {} created Room {} (Count: 1)", my_id, new_id);
            (tx, count, new_id)
        }
    };

    let mut rx = tx.subscribe();

    // 3. Send Identity (Security Hardening: Server Authority)
    let identity_msg = format!("{{\"type\": \"identity\", \"senderId\": \"{}\"}}", my_id);
    if socket.send(Message::Text(identity_msg)).await.is_err() {
        cleanup(&state, &count_ref, &my_id, &room_id, &tx).await;
        return;
    }

    // Rate Limit State
    let mut rate_limit_counter = 0;
    let mut rate_limit_start = std::time::Instant::now();

    // 2. Event Loop
    loop {
        tokio::select! {
            Some(msg) = socket.recv() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        match check_rate_limit(&mut rate_limit_counter, &mut rate_limit_start, &my_id) {
                            RateLimitAction::Disconnect => break,
                            RateLimitAction::Drop => continue,
                            RateLimitAction::Proceed => {}
                        }

                        if let Some(broadcast_msg) = process_client_text(text, &my_id) {
                            // Broadcast ONLY to this room
                            let _ = tx.send(Arc::new(broadcast_msg));
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(_) => break, // WebSocket Error
                    _ => {}
                }
            }
            Ok(msg) = rx.recv() => {
                if should_forward(&msg, &my_id) {
                    if socket.send(Message::Text(msg.payload.clone())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    cleanup(&state, &count_ref, &my_id, &room_id, &tx).await;
}

enum RateLimitAction {
    Proceed,
    Drop,
    Disconnect,
}

fn check_rate_limit(counter: &mut usize, start: &mut std::time::Instant, my_id: &str) -> RateLimitAction {
    const RATE_LIMIT_WARN: usize = 10;
    const RATE_LIMIT_MAX: usize = 50;
    const RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(1);

    if start.elapsed() >= RATE_LIMIT_WINDOW {
        *counter = 0;
        *start = std::time::Instant::now();
    }
    *counter += 1;

    if *counter > RATE_LIMIT_MAX {
        println!("Rate limit exceeded (HARD) for {}: {}/s. Disconnecting.", my_id, counter);
        return RateLimitAction::Disconnect;
    } else if *counter > RATE_LIMIT_WARN {
        println!("Rate limit warning (SOFT) for {}: {}/s. Dropping message.", my_id, counter);
        return RateLimitAction::Drop;
    }

    RateLimitAction::Proceed
}

fn process_client_text(text: String, my_id: &str) -> Option<BroadcastMsg> {
    if text.len() > MAX_MSG_SIZE {
        return None;
    }

    // JSON Payload Validation
    let mut json_msg: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return None,
    };

    if !json_msg.is_object() {
        println!("Invalid JSON Payload (Not an Object) from {}. Dropping.", my_id);
        return None;
    }

    if let Some(obj) = json_msg.as_object_mut() {
        obj.insert("senderId".to_string(), serde_json::Value::String(my_id.to_string()));
    }

    Some(BroadcastMsg {
        sender_id: my_id.to_string(),
        payload: json_msg.to_string(),
    })
}

fn should_forward(msg: &BroadcastMsg, my_id: &str) -> bool {
    msg.sender_id != my_id
}

async fn cleanup(
    state: &AppState,
    count_ref: &Arc<AtomicUsize>,
    my_id: &str,
    room_id: &str,
    tx: &broadcast::Sender<Arc<BroadcastMsg>>
) {
    // 1. Send Leave Msg (To Room Only)
    let leave_msg = Arc::new(BroadcastMsg {
        sender_id: my_id.to_string(),
        payload: format!("{{\"type\": \"leave\", \"senderId\": \"{}\"}}", my_id),
    });
    let _ = tx.send(leave_msg);

    // 2. Decrement Room Count
    let _ = count_ref.fetch_sub(1, Ordering::Relaxed);

    // 3. CLEANUP: Remove Room if Empty (O(1) HashMap Removal)
    {
        let mut rooms = state.rooms.write().await;
        if let std::collections::hash_map::Entry::Occupied(entry) = rooms.entry(room_id.to_string()) {
             if entry.get().count.load(Ordering::Relaxed) == 0 {
                 println!("Room {} is empty. Removing.", room_id);
                 entry.remove();
             }
        }
    }

    // 4. Decrement Global Count
    state.conn_count.fetch_sub(1, Ordering::Relaxed);

    // IP count is handled by ConnectionGuard Drop
}
