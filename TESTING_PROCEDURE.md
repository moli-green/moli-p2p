# Moli P2P Verification & Testing Procedure

To maintain the stability, security, and conceptual integrity of the Moli P2P architecture, all future feature additions or major architectural changes must follow this comprehensive verification lifecycle.

This procedure ensures that logic errors are caught early, state explosions are prevented, and standard integration tests are reliably executed.

---

## 1. Specification & Design Review
Before writing code or models, the intended change must be aligned with the core project philosophy.

- **Check `spec.md`**: Does the new feature adhere to the "Ephemeral by Design" and "Sovereign Safety" principles?
- **Identify Risks**: Will this change impact network signaling concurrency, connection limits, or the WebRTC DataChannel chunking logic?
- **Update Documentation**: Draft the proposed changes in `spec.md` (or an RFC/Issue) before proceeding.

## 2. Formal Verification (TLA+ / PlusCal)
If the feature alters the **P2P synchronization protocol**, **signaling logic**, or **connection topologies**, you must formally verify the logic to prevent distributed deadlocks or eventual consistency failures.

- **Directory**: `/tla`
- **Model Check**: Run the TLC model checker on the relevant specification (e.g., `MoliP2P.tla`, `AsyncOfferPull.tla`, `LazyGossip.tla`).
- **CRITICAL - Prevent Hangs/State Explosion**:
  - Never run the model checker on unbounded variables.
  - Always strictly bind variables in the corresponding `.cfg` file (e.g., `Peers = {"p1", "p2", "p3"}`, `MaxMessages = 20`).
  - Do **not** instruct AI agents to run TLC on the remote server to prevent lockups. Run it locally via the VS Code TLA+ Extension.

## 3. Automated End-to-End (E2E) Testing
Once the logic is formally proven and the application code is written, verify the system's runtime behavior.

- **Script**: `run_tests.sh` (located in the repository root).
- **Process**:
  1. The script automatically compiles the Rust signaling server.
  2. It builds the Vite/TypeScript client (`bun run build`).
  3. It spins up the server and serves the client UI.
  4. It executes the Python Pytest suite using Playwright to simulate multiple concurrent browser instances interacting with the mesh.
- **Requirement**: All tests in the suite must pass. If adding a new feature, add a corresponding Playwright test in the `/tests` directory.

## 4. Manual Verification & WebRTC Profiling
Automated tests cannot fully emulate real-world network turbulence (NAT traversal, STUN/TURN, Mobile Networks).

- **Local Network Test**: Connect to the local dev server using at least two different physical devices (e.g., a laptop and a smartphone on WiFi).
- **Public/Mobile Test**: Test connectivity with one device on a mobile network (4G/5G) to verify STUN (or TURN) fallback.
- **Large File Handling**: Manually upload an image near the physical limit (e.g., ~14MB) and monitor the browser console to ensure the WebRTC DataChannel chunking backpressure (`dc.bufferedAmount`) is functioning correctly without crashing the tab.

## 5. Final Documentation & Deployment Readiness
- **Update `spec.md`**: Finalize the specification document to reflect the exact implementation details, version bump, and release notes.
- **Update `README.md` / `USER_MANUAL.md`**: Ensure end-user documentation reflects any new UI elements or behavioral changes (e.g., "Sovereign Guard" blur filters).
- **Review `deploy_*.sh`**: Ensure deployment scripts are updated if the build process or required environment variables (like `TURN_SECRET`) have changed.
