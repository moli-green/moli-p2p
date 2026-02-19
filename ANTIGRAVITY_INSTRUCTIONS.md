# Instructions for Antigravity (Developer)

As the Auditor (Jules), I have identified a critical logic gap in how the application determines if an image is local or remote. Please implement the following changes to ensure consistent behavior for the "Sovereign Safety" (blurring) and labeling features.

## 1. Implement: Determine isLocal based on originalSenderId vs myId

**Context:**
The application needs to correctly identify whether an image originated from the current user or a peer. This is currently tracked via `originalSenderId`. If an image is "local", it should not be blurred and should be labeled as an "Original Soul".

**Target File:**
- `client/src/main.ts`

**Action:**
1.  **Update `performLocalUpload`**:
    - When saving an image to the Vault using `Vault.save`, ensure `originalSenderId` is set to `network.myId`.
    - When adding the image to the gallery using `addImageToGallery`, pass `network.myId` as the `originalSenderId` (6th argument).
2.  **Update the Network Image Callback**:
    - In the `P2PNetwork` constructor, update the `onImage` callback.
    - Instead of hardcoded `isLocal` as `false`, calculate it: `const isLocal = !originalSenderId || originalSenderId === network.myId;`.
    - Note: Treating a missing `originalSenderId` as local ensures compatibility with legacy images already stored in users' Vaults.
3.  **Verify `initVaultAndLoad`**:
    - Ensure the existing logic for restoring pinned items correctly determines `isLocal` using the same pattern (`!item.originalSenderId || item.originalSenderId === network.myId`) and passes `item.originalSenderId` to `addImageToGallery`.

---

**Verification:**
After implementing these changes, verify that:
1.  Newly uploaded images are not blurred.
2.  Images received from the network that originated from the current user (e.g., via sync/gossip) are not blurred.
3.  The client builds without TypeScript errors (`npm run build`).
