# Instructions for Antigravity

## Task: Fix Client-Side Resource Starvation (DoS) Vulnerability

### Context
A security audit revealed a **Resource Starvation** vulnerability in the client. If a file transfer fails (due to hash mismatch, size overflow, or malicious stalling), the `downloadSlot` reserved in `main.ts` is never released.
Since `MAX_CONCURRENT_DOWNLOADS` is small (default 3), a few failed transfers can permanently block all future downloads, effectively causing a Denial of Service.

### Objective
Ensure that download slots are **always released**, even when a transfer fails or times out.

### Required Changes

#### 1. Modify `client/src/types.ts` (Optional but recommended)
Define the error event structure if you use shared types, or just define it inline in `PeerSession.ts`.

#### 2. Modify `client/src/PeerSession.ts`

**A. Add 'transfer-error' to Session Events**
Update the `onSessionEvent` callback signature to include a new event type: `'transfer-error'`.

**B. Implement Error Reporting**
In `handleDataMessage`, wherever an error causes an early return (and thus prevents `onImage` from being called), you must now trigger the error event.

*   **Hash Mismatch**:
    ```typescript
    if (computedHash !== this.currentMeta.hash) {
        console.error(...);
        this.onSessionEvent?.('transfer-error', this, { transferId: this.currentMeta.transferId }); // <--- ADD THIS
        this.currentMeta = null;
        // ...
        return;
    }
    ```
*   **Size Overflow / Invalid Metadata**:
    Trigger the error event similarly.

**C. Implement Receive Timeout**
Add a timeout mechanism to detect stalled transfers.
*   When receiving `type: 'meta'`, start a timeout (e.g., 30 seconds).
*   Reset the timeout every time a data chunk is received.
*   If the timeout triggers, clear the state and fire `'transfer-error'`.

#### 3. Modify `client/src/P2PNetwork.ts`

**A. Handle the New Event**
Update `handleSessionEvent` to handle `'transfer-error'`.

**B. Expose Callback**
Add a new public method `setTransferErrorCallback` (similar to `setOfferFileCallback`) so `main.ts` can listen for these errors.

```typescript
// Example
private onTransferError?: (session: PeerSession, transferId: string) => void;

public setTransferErrorCallback(cb: (session: PeerSession, transferId: string) => void) {
    this.onTransferError = cb;
}

// In handleSessionEvent:
if (type === 'transfer-error') {
    this.onTransferError?.(session, data.transferId);
}
```

#### 4. Modify `client/src/main.ts`

**A. Listen for Errors**
Register the callback using `network.setTransferErrorCallback`.

**B. Release Slot**
Inside the callback, verify if the `transferId` matches an active download in `downloadQueue` (or just unconditionally call release).
**Crucially, call `releaseDownloadSlot()`**.

```typescript
network.setTransferErrorCallback((session, transferId) => {
    console.warn(`[Main] Transfer failed: ${transferId}. Releasing slot.`);
    releaseDownloadSlot();
});
```

### Verification
After implementing these changes, simulated transfer failures (e.g., by modifying the sender to send wrong hashes) should NOT stop subsequent downloads.
