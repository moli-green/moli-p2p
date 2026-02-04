use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::{net::SocketAddr, sync::Arc};
use tokio::sync::broadcast;
use tower_http::services::ServeDir;
use uuid::Uuid;

struct BroadcastMsg {
    sender_id: String,
    payload: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let (tx, _rx) = broadcast::channel::<Arc<BroadcastMsg>>(100);
    let app_state = Arc::new(tx);

    let app = Router::new()
        .nest_service("/", ServeDir::new("../client/dist"))
        .route("/ws", get(ws_handler))
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 9090));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(tx): State<Arc<broadcast::Sender<Arc<BroadcastMsg>>>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, tx))
}

async fn handle_socket(mut socket: WebSocket, tx: Arc<broadcast::Sender<Arc<BroadcastMsg>>>) {
    let my_id = Uuid::new_v4().to_string();
    let mut rx = tx.subscribe();

    loop {
        tokio::select! {
            Some(msg) = socket.recv() => {
                if let Ok(Message::Text(text)) = msg {
                    let msg = Arc::new(BroadcastMsg {
                        sender_id: my_id.clone(),
                        payload: text,
                    });
                    // Broadcast to everyone (including self)
                    let _ = tx.send(msg);
                } else {
                    break;
                }
            }
            Ok(msg) = rx.recv() => {
                // Filter out messages from self
                if msg.sender_id != my_id {
                    if socket.send(Message::Text(msg.payload.clone())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }


    // Disconnected
    let leave_msg = Arc::new(BroadcastMsg {
        sender_id: my_id.clone(),
        payload: format!("{{\"type\": \"leave\", \"senderId\": \"{}\"}}", my_id),
    });
    let _ = tx.send(leave_msg);
}
