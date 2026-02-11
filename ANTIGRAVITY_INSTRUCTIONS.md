# Security Hardening & Stability Instructions

## Overview
These instructions address critical security vulnerabilities and stability issues identified during the audit of `server/src/main.rs`. Please implement these changes to ensure robust operation.

## 1. JSON Payload Validation (Critical Security)
**Issue:** The server currently parses any valid JSON but only injects the `senderId` if the root is an Object. This allows malicious actors to send JSON Arrays or Primitives (e.g., `["hack", {"senderId": "fake"}]`) which bypass the identity enforcement mechanism. Although the current client might ignore these, it leaves a gap for exploitation or confusion.

**Action:**
*   Modify `handle_socket` in `server/src/main.rs`.
*   After parsing `serde_json::Value`, explicitly check if it is an Object using `.is_object()`.
*   If it is **NOT** an object, `continue` the loop immediately (drop the message). Do not broadcast it.

## 2. Rate Limiting Adjustment (Stability)
**Issue:** The current rate limit of `10` messages per second is too aggressive for WebRTC. When a peer connects, it generates many ICE candidates in a short burst. The current logic disconnects legitimate users during this handshake phase.

**Action:**
*   In `server/src/main.rs`, refine the rate limit logic in `handle_socket`:
    *   **Soft Limit (10 msg/s):** If the rate exceeds 10 but is under 50, **drop** the message and log a warning, but **do not disconnect**. This handles benign bursts.
    *   **Hard Limit (50 msg/s):** If the rate exceeds 50, **disconnect** the client immediately (break loop). This protects against DoS.

## 3. Origin Validation (Optional / Best Practice)
**Issue:** The WebSocket endpoint accepts connections from any origin. This allows malicious sites to connect to the user's local server instance if they know the port.

**Action:**
*   In `ws_handler`, check for the `Origin` header.
*   If the `ALLOWED_ORIGIN` environment variable is set (e.g., `https://moli-green.is`), verify that the request's Origin matches it.
*   If it does not match, return `403 Forbidden`.
*   If the variable is not set, allow all (default behavior for development).

## 4. HTTPS / Nginx Configuration
**Issue:** WebRTC requires a secure context (HTTPS) to function across networks. The current deployment scripts might not enforce this strictly for the WebSocket upgrade path.

**Action:**
*   Ensure that the Nginx configuration (`client/nginx.conf` or the generated config in `setup_vps_initial.sh`) correctly handles SSL termination and forwards the `X-Forwarded-Proto` header.
*   (No code change needed in Rust for this if Nginx handles SSL, but ensure the documentation or deployment script reflects the need for `certbot` or SSL certificates).

## Summary
Prioritize **Task 1** (JSON Validation) and **Task 2** (Rate Limiting Fix) as they are critical for security and reliability.
