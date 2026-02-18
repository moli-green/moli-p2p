# Instructions for Antigravity (Developer)

As the Auditor (Jules), I have identified several areas for improvement in the codebase. Please implement the following changes to enhance type safety, memory efficiency, stability, and code maintainability.

## 1. Refactor: Client Type Safety (Remove `any`)

**Context:**
Currently, the codebase attaches a `fileHash` property directly to `Blob` objects using `(blob as any).fileHash`. This is not type-safe and relies on runtime patching of built-in objects.

**Target Files:**
- `client/src/P2PNetwork.ts`
- `client/src/PeerSession.ts`

**Action:**
1.  Create a module-level `WeakMap` to associate `Blob` objects with their hash strings.
    ```typescript
    // In a shared utility file or within P2PNetwork/PeerSession scope
    export const blobHashRegistry = new WeakMap<Blob, string>();
    ```
2.  Replace all instances of `(blob as any).fileHash = ...` with `blobHashRegistry.set(blob, ...)`
3.  Replace all instances of `(blob as any).fileHash` read access with `blobHashRegistry.get(blob)`.

## 2. Optimize: Client Memory Usage (Chunked Reading)

**Context:**
In `PeerSession.ts`, the `transferFile` method reads the entire `Blob` into an `ArrayBuffer` at once using `await upload.blob.arrayBuffer()`. For large files (up to 15MB), this creates a significant memory spike.

**Target File:**
- `client/src/PeerSession.ts`

**Action:**
1.  Modify `transferFile` to read chunks incrementally using `blob.slice()`.
    ```typescript
    // Pseudo-code concept
    while (offset < totalSize) {
        const chunkBlob = upload.blob.slice(offset, offset + CHUNK_SIZE);
        const chunkBuffer = await chunkBlob.arrayBuffer();
        // ... send chunkBuffer ...
        offset += CHUNK_SIZE;
    }
    ```
    *Note: Ensure `await` is used correctly inside the loop to prevent blocking the UI thread or flooding the DataChannel.*

## 3. Fix: Client Connection Stability (Promise Hang)

**Context:**
In `P2PNetwork.ts`, the `connect()` method returns a Promise that resolves upon receiving an `identity` message. However, if the WebSocket connection closes *before* the identity message is received (e.g., server rejects connection immediately), the promise remains pending until the 5-second timeout triggers.

**Target File:**
- `client/src/P2PNetwork.ts`

**Action:**
1.  Update the `ws.onclose` handler within `connect()` to strictly reject the promise if `this.myId` has not been set yet.
    ```typescript
    this.ws.onclose = () => {
        if (!this.myId) {
            reject(new Error("Connection Closed Early"));
        }
    };
    ```

## 4. Refactor: Server Code Cleanliness (Function Extraction)

**Context:**
The `handle_socket` function in `server/src/main.rs` is becoming monolithic. It handles the handshake, rate limiting logic, and the main select loop all in one place.

**Target File:**
- `server/src/main.rs`

**Action:**
1.  Extract the inner logic of the WebSocket message handling loop into a separate function, e.g., `process_client_message`.
2.  Extract the broadcast message handling logic into a separate function, e.g., `process_broadcast_message`.
3.  Ensure `handle_socket` remains high-level, coordinating the event loop.

---

**Verification:**
After implementing these changes, verify that:
1.  The client builds without TypeScript errors (`npm run build`).
2.  File transfers still work correctly (test with a small image).
3.  The server compiles and runs without warnings (`cargo check`).
