# Instructions for Antigravity (Developer)

**Objective**: Fix the image propagation instability caused by synchronous "Offer-Wait" timeouts. Decouple the "Offer" phase from the "Data Transfer" phase to allow receivers to queue downloads without sender timeouts.

**CRITICAL REQUIREMENT**: While offers can be sent asynchronously, data transfer on a single WebRTC DataChannel MUST be strictly sequential to prevent data corruption. Do NOT interleave file transfers.

## Task: Refactor `PeerSession.ts` to Asynchronous Offer-Pull

You need to modify `client/src/PeerSession.ts` to implement a "Fire-and-Forget" offer mechanism with a "Pull-Triggered" data transfer queue.

### Step 1: Add State Management
Add properties to `PeerSession` class to manage pending offers and the transfer queue.

```typescript
// Interface for tracking offered files
interface PendingUpload {
    blob: Blob;
    metadata: {
        name: string;
        size: number;
        mime: string;
        hash: string;
        isPinned: boolean;
        ttl?: number;
        originalSenderId?: string;
    };
    timestamp: number;
}

// In PeerSession class:
private pendingUploads = new Map<string, PendingUpload>(); // Map<TransferID, Upload>
private transferQueue: { transferId: string, upload: PendingUpload }[] = []; // FIFO Queue for Data
private isTransferring = false; // Lock for sequential transfer
```

### Step 2: Refactor `sendImage` (The "Offer" Phase)
Modify `sendImage` to be non-blocking:
1.  Generate a `transferId`.
2.  Store the upload in `this.pendingUploads` with a timestamp.
3.  Send the `offer-file` message immediately.
4.  **REMOVE** the old `sendQueue` logic for offers. Offers are now instant.

```typescript
public sendImage(blob: Blob, hash: string, isPinned: boolean = false, name?: string, ttl?: number, originalSenderId?: string) {
    if (!this.dc || this.dc.readyState !== 'open') return;

    const transferId = Math.random().toString(36).substring(2, 11);
    // ... construct metadata ...

    // 1. Store State
    this.pendingUploads.set(transferId, { blob, metadata: { ... }, timestamp: Date.now() });

    // 2. Send Offer Immediately
    this.dc.send(JSON.stringify({ type: 'offer-file', transferId, ... }));

    // Lazy Cleanup
    this.cleanupPendingUploads();
}
```

### Step 3: Implement `processTransferQueue` (Sequential Sender)
Create a method to process the `transferQueue` one item at a time. This prevents interleaving chunks from multiple files on the single DataChannel.

```typescript
private async processTransferQueue() {
    if (this.isTransferring || this.transferQueue.length === 0) return;
    if (!this.dc || this.dc.readyState !== 'open') return;

    this.isTransferring = true;
    const item = this.transferQueue.shift()!;

    try {
        await this.transferFile(item.transferId, item.upload);
    } catch (e) {
        console.error(`[${this.myId}] Transfer failed`, e);
    } finally {
        this.isTransferring = false;
        // Process next item
        this.processTransferQueue();
    }
}
```

### Step 4: Implement `transferFile` (Data Logic)
Refactor the data sending logic from `executeSend` into `transferFile`.
*   Send `meta`.
*   Loop chunks with `bufferedAmount` flow control.
*   **Safety Check**: Ensure the loop respects `close` events or errors to avoid infinite hangs if the connection drops.

### Step 5: Update `handleDataMessage` (The "Pull" Trigger)
Modify the `pull-request` handler in `handleDataMessage`:
1.  Retrieve the `transferId` from `pendingUploads`.
2.  If found:
    *   Remove from `pendingUploads`.
    *   **PUSH** to `this.transferQueue`.
    *   Call `this.processTransferQueue()`.
3.  Do NOT call `transferFile` directly here (to avoid concurrency bugs).

### Step 6: Cleanup Mechanism
Implement `cleanupPendingUploads` to remove stale entries (> 5 mins) from `pendingUploads`. Call this lazily in `sendImage`. Also ensure `close()` clears all queues and maps.

## Checklist for Verification
1.  **Sequential Data**: Verify that `transferFile` is only called via `processTransferQueue` and never concurrently.
2.  **Async Offers**: Verify `sendImage` returns immediately.
3.  **Flow Control**: Verify `transferFile` uses `bufferedamountlow` correctly.
4.  **No Leaks**: Verify `pendingUploads` are cleaned up on success (pull) or timeout (lazy GC).

Proceed with implementation.
