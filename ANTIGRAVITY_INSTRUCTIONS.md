# Security Hardening Instructions

**Role:** You are Antigravity, the Lead Developer.
**Task:** Fix confirmed security vulnerabilities in the Client and Server.

## 🚨 CRITICAL META-INSTRUCTION
**"Think for yourself."**
Do not blindly follow these instructions. Review the proposed changes critically. If you identify logical flaws, race conditions, or better implementation strategies, you have the authority to deviate and improve the solution. Your goal is a secure and robust system, not compliance.

---

## 1. Client-Side: Enforce "Pull" Semantics
**File:** `client/src/PeerSession.ts`

**Vulnerability:**
The current `handleDataMessage` accepts `type: 'meta'` messages even if the client never requested the file. This allows a malicious peer to flood the victim with unrequested large files (DoS).

**Action:**
Strictly enforce the "Pull" handshake state.

1.  **Track Requests:** Add a state variable (e.g., `pendingPullRequests: Set<string>`) to track `transferId`s that this client has explicitly requested via `pullFile`.
2.  **Verify Incoming Meta:** In `handleDataMessage`, when a `'meta'` message arrives:
    *   Check if `msg.transferId` exists in `pendingPullRequests`.
    *   If **NOT found**: Log a security warning (e.g., "Blocking unrequested transfer") and **ignore** the message. Do not set `currentMeta`.
    *   If **found**: Remove the ID from the set and proceed with the transfer.
3.  **Clean Up:** Ensure `pendingPullRequests` does not leak memory (e.g., remove ID on timeout or error if feasible, though the strict check on arrival is the priority).

---

## 2. Server-Side: Global Connection Limit
**File:** `server/src/main.rs`

**Vulnerability:**
The server limits users per *room* but lacks a *global* connection limit. A flood of connections can exhaust file descriptors or RAM on the Raspberry Pi.

**Action:**
Implement a global "Circuit Breaker".

1.  **Global Counter:** Add a global atomic counter (e.g., `conn_count: Arc<AtomicUsize>`) to `AppState`.
2.  **Config:** Define a hard limit (e.g., `const MAX_GLOBAL_CONNECTIONS: usize = 1000;`).
3.  **Enforcement:**
    *   In `ws_handler` (before upgrading) or at the very start of `handle_socket`:
    *   Check if `current_count >= MAX_GLOBAL_CONNECTIONS`.
    *   If exceeded: Return a `503 Service Unavailable` (if in handler) or immediately close the socket (if in upgrade).
    *   Increment the counter on successful connection.
    *   Decrement the counter when the socket handler finishes (ensure this happens even on panic/error).

---

## 3. Server-Side: Secure Secrets
**File:** `server/src/main.rs`

**Vulnerability:**
`TURN_SECRET` defaults to a hardcoded string `"dev_secret_local_only"`. If a user forgets to set this env var in production, the server is insecure.

**Action:**
Fail safe.

1.  **Require Env Var:** Change the logic to **panic** or exit if `TURN_SECRET` is not set.
2.  **Dev Mode Exception (Optional):** If you really need a fallback for local dev, make it explicit (e.g., only if `APP_ENV != production`), but strictly speaking, requiring the secret is safer. **Panic is preferred for this task.**
