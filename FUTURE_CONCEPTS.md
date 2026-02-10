# Future Concepts for Moli P2P (v2.0 Candidate)

> *Ideas from the community to enhance the "Social Defense" layer.*

## 1. Peeking (The "Keyhole" Defense)
**Problem**: Users hesitate to click "Reveal" on blurred images because it might be a trap (shock image, spam).
**Solution**: 
-   Implement a **Hover Interaction**.
-   When hovering over a blurred card, **10%** of the image area is randomly unmasked (without blur).
-   This allows the user to gauge the "texture" or "quality" of the image without fully exposing themselves to the content.
-   *Technical Note*: Can be done via CSS `mask-image` or a secondary low-res Canvas layer.

## 2. Local Trust (The "Star" System)
**Problem**: New users/bots are indistinguishable from long-time lurkers.
**Solution**:
-   Leverage the existing `createdAt` timestamp in the Identity Protocol.
-   **Visual Indicator**: Display a small "Star" or "Shield" icon for peers who meet local criteria:
    -   Have been connected for > 1 hour.
    -   Have shared an image that *I* (the local user) have Pinned.
-   **Philosophy**: Trust is local. I trust you because *I* saw you persist, not because a central server verified you.

## 3. Client-Side Mute Filters
**Problem**: Persistent spam with specific keywords or patterns.
**Solution**: 
-   A local "Muted Words" list in Settings.
-   Incoming metadata containing these words is silently dropped (or auto-burned locally).
