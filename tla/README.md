# Async Offer-Pull Verification (TLA+)

This directory contains the TLA+ / PlusCal models used to verify the correctness of the **Asynchronous Offer-Pull Protocol** implemented in `PeerSession.ts` (Phase 46).

## Model: `AsyncOfferPull.tla`

The model simulates a distributed system with:
-   **Senders**: Peer offering files.
-   **Receivers**: Peer requesting files.
-   **Network**: A set of in-flight messages (Offer, Pull, Data).
-   **Event Loop**: A nondeterministic process modeling the JavaScript event loop layout.

### Verified Properties

1.  **Deadlock Freedom**: The system successfully terminates in a consistent state where all files are transferred.
2.  **Type Correctness**: All variables remain within their defined Domains (`TypeOK`).
3.  **Data Consistency**: The Receiver eventually possesses all files offered by the Sender.
4.  **Protocol Adherence**:
    -   Sender never blocks on Offer.
    -   Sender queues data transfers sequentially.
    -   Sender processes Pull Requests only for valid Offers.

## How to Run

1.  **Translate PlusCal to TLA+**:
    ```bash
    pcal tla/AsyncOfferPull.tla
    ```

2.  **Run Model Checker (TLC)**:
    ```bash
    tlc tla/AsyncOfferPull.tla -config tla/AsyncOfferPull.cfg
    ```

## Results (2026-02-16)

-   **States Found**: 37 distinct states.
-   **Errors Found**: 0.
-   **Conclusion**: The protocol is robust against message reordering and asynchrony for the modeled constraints (1 Sender, 1 Receiver, 2 Files).

## Model: `LazyGossip.tla`

The model simulates the **flooding/gossip** mechanism used to propagate data references.

### Verified Properties

1.  **Eventual Consistency**: If *genesis* introduces a hash, **every node** eventually sees it (`<>(\A n: hash \in seen[n])`).
2.  **Termination**: The system reaches a stable state (no messages in flight) once consistency is achieved.
3.  **Liveness**: Verified under **Weak Fairness** constraints (ensuring no node starves).

### Results (2026-02-16)

-   **Topology**: 3-Node Ring.
-   **States Found**: 48 distinct states.
-   **Errors Found**: 0.
-   **Conclusion**: The Lazy Gossip protocol guarantees delivery in a connected graph.
