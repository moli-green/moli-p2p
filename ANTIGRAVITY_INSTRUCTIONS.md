# Instructions for Antigravity

## Task: Server Security Hardening & Cleanup

Please implement the following changes in `server/src/main.rs` and `server/Dockerfile` to address security vulnerabilities and stability issues.

### 1. Room Cleanup Mechanism (Memory Leak Prevention)
The current implementation allows rooms to persist indefinitely even after all users have left.
*   **Action**: In `handle_socket` (at the end of the function, after `tx.send(leave_msg)`):
    *   Acquire a write lock on `state.rooms`.
    *   Check if the current room's `count` is 0.
    *   If `count` is 0, remove the room from the `rooms` vector.
    *   **Hint**: Use `retain` or find index and `remove`. Be careful not to remove a room that just got a new user (check `count` inside the lock).

### 2. IP Connection Limiting (DoS Protection)
Single IP addresses can currently exhaust the server's global connection limit.
*   **Action**:
    *   Add a new field `ip_counts: Arc<RwLock<std::collections::HashMap<std::net::IpAddr, usize>>>` to `AppState`.
    *   Initialize this map in `main`.
    *   In `ws_handler`:
        *   Extract the client's IP address (use `axum::extract::ConnectInfo<SocketAddr>`).
        *   Check the current connection count for this IP in `state.ip_counts`.
        *   If the count exceeds `10`, return `(StatusCode::TOO_MANY_REQUESTS, "Rate Limit Exceeded").into_response()`.
        *   If allowed, increment the count for this IP.
    *   **Crucial**: Ensure the IP count is decremented when the WebSocket connection closes.
        *   **Implementation Suggestion**: Create a helper struct (e.g., `ConnectionGuard`) that holds the IP and the `state.ip_counts` reference. Implement `Drop` for this struct to automatically decrement the count.
        *   Pass this guard (or move it) into `handle_socket` so it lives as long as the connection.

### 3. Strict Message Size Limit (Resource Exhaustion)
Currently, `socket.recv()` might buffer large messages before our manual check.
*   **Action**:
    *   In `ws_handler`, configure the `WebSocketUpgrade` instance to enforce limits *before* upgrading.
    *   Use `.max_frame_size(16 * 1024)` and `.max_message_size(16 * 1024)`.
    *   This ensures the underlying websocket implementation rejects oversized payloads early.

### 4. Docker Security (Privilege Escalation)
The container runs as root.
*   **Action**: Modify `server/Dockerfile`.
    *   Create a non-root user (e.g., `moli`).
    *   Switch to this user with `USER moli` before the `CMD`.
    *   Ensure the binary is executable by this user (standard `COPY` usually preserves permissions or sets root:root 755, which is fine for execution).

## Implementation Details

*   **Imports**: You may need to import `std::collections::HashMap`, `std::net::IpAddr`, `axum::extract::ConnectInfo`, and `axum::http::StatusCode`.
*   **Logging**: Add `println!` or `tracing::info!` logs when:
    *   A room is removed.
    *   An IP is rate-limited.
*   **Safety**: Ensure locks are held for the shortest possible time to avoid contention.

## Verification
After implementing, verify:
1.  Connect multiple clients.
2.  Disconnect all clients from a room -> Room should disappear from memory (log it).
3.  Connect >10 clients from the same IP -> 11th should be rejected.
4.  Send >16KB message -> Connection should close immediately or error.
