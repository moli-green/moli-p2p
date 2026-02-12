# Performance Optimization: Efficient DataChannel Backpressure

## Overview
The current file transfer implementation in `client/src/PeerSession.ts` uses an inefficient polling mechanism to handle backpressure. It checks `dc.bufferedAmount` in a `while` loop and uses `setTimeout(sendChunk, 50)` when the buffer is full. This introduces unnecessary latency and jitter.

Please implement an event-driven backpressure mechanism using the `bufferedamountlow` event.

## Action Items

### 1. Optimize `executeSend` in `client/src/PeerSession.ts`
*   **Location:** `client/src/PeerSession.ts` around line 500.
*   **Changes:**
    *   Capture `this.dc` into a local variable (e.g., `const dc = this.dc`).
    *   Set `dc.bufferedAmountLowThreshold` to `64 * 1024` (64KB).
    *   Replace the `setTimeout(sendChunk, 50)` logic with the `onbufferedamountlow` event handler.
    *   Implement a `cleanup` function within the `Promise` to remove event listeners once the transfer is finished or fails.
    *   Add event listeners for `close` and `error` on the DataChannel during the transfer to reject the promise if the connection is lost.

### 2. Implementation Details (Logic)
```typescript
const sendChunk = () => {
    try {
        while (offset < totalSize) {
            if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
                // Wait for onbufferedamountlow to fire
                return;
            }
            if (dc.readyState !== 'open') {
                onAbort();
                return;
            }
            const length = Math.min(CHUNK_SIZE, totalSize - offset);
            const chunk = new Uint8Array(buffer, offset, length);
            dc.send(chunk);
            offset += length;
        }
        // Success cleanup and resolve
    } catch (e) {
        // Error cleanup and reject
    }
};
```

## Verification
*   Ensure that `onbufferedamountlow` is cleared after the transfer to prevent memory leaks.
*   Verify that the `close` and `error` listeners are also removed.
*   Run `npm run build` in the `client` directory to ensure no TypeScript errors.

## Rationale
Using the `bufferedamountlow` event allows the browser to notify the application as soon as the buffer has space, eliminating the 50ms wait time and significantly improving throughput on high-speed connections.
