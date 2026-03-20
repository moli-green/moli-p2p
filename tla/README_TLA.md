# Moli P2P - Global Architecture Verification (TLA+)

This directory contains `MoliP2P.tla`, a high-level formal specification of the entire Moli P2P architecture, encompassing:

- **Signaling Server Restrictions**: (IP limits, DoS protection).
- **WebRTC Mesh Establishment**: Peer discovery and connection mapping.
- **Sovereign Safety & Deduplication**: Image hashing, propagation, and dropping duplicates.
- **Network Resilience**: Peers joining and gracefully leaving.

## Why did previous AI sessions hang?

In previous iterations, the AI attempted to run a model checker on an unbounded specification.
A typical issue in distributed systems modeling is the **State Space Explosion**.
If the model allows peers to continuously send messages without a limit, or if variables (like message counters, or infinite sets of generated IDs) grow without bound, the TLC model checker will attempt to explore an infinite number of states. This causes the CPU to lock at 100% and eventually exhausts system memory (hanging the machine).

## The Solution

The models in this directory (`MoliP2P.tla` and `MoliP2P.cfg`) are meticulously designed to guarantee a **finite state space**:

1. **Finite Sets**: `Peers` is strictly bounded to 3 (`{p1, p2, p3}`), and `Images` to 2 (`{i1, i2}`).
2. **Hard Constraints**: The `MaxMessages` constant explicitly limits the total number of in-flight network messages that can be generated across the entire execution history.
3. **Deduplication Logic**: Peers will only relay a message if the image is NOT already in their `peer_store`, naturally halting gossip storms.

## Safe Local Execution Guide

**Do NOT ask the AI to run this for you in the remote environment.** Run this safely on your local machine.

### Prerequisites

1. Install [VS Code](https://code.visualstudio.com/).
2. Install the **TLA+ Extension** (by `alygin`).
3. Download the TLA+ Tools (`tla2tools.jar`) if the extension does not download them automatically.

### Step-by-Step Instructions

1. **Open the Model**:
   Open the `tla/` directory in VS Code and open `MoliP2P.tla`.

2. **Parse the Spec**:
   Right-click anywhere in `MoliP2P.tla` and select **"TLA+: Parse module"**. Ensure there are no syntax errors.

3. **Check the Model (TLC)**:
   Right-click in the file and select **"TLA+: Check model with TLC"**.
   *Note: Ensure the TLA+ extension is configured to use the `MoliP2P.cfg` file implicitly (or explicitly via a `.launch` file if you have custom settings).*

4. **Expected Output**:
   The TLC process should finish within a few seconds to a minute.
   It will output the exact number of distinct states generated and verified.
   If it finds a violation of an Invariant (e.g., `Safety_ServerLimit`) or Liveness property (`Liveness_EventualConsistency`), it will output an **Error Trace** detailing the exact sequence of events leading to the failure.

### Dealing with State Explosion (If you modify the model)

If you decide to expand this model (e.g., adding 5 peers or 10 images) and TLC starts running for more than 5 minutes:
1. **Stop TLC immediately**.
2. Open `MoliP2P.cfg` and reduce the constants back down.
3. Add a hard state-depth constraint in the CFG file (e.g., `CONSTRAINT StateDepth < 15`).
4. Ensure you haven't introduced an action that allows infinite variable increments without a condition (e.g., `counter' = counter + 1` without `/\ counter < MAX`).
