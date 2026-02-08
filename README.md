# Moli P2P: Sovereign Ephemeral Gallery

> "Presence is Storage." - Use it or lose it. An autonomous, distributed image gallery that lives only as long as you watch it.

![Moli P2P Demo](./moli-p2p-hero.webp)
*Live P2P Mesh Demo (v1.7.9 Sovereign Edition)*: **[https://moli-green.is](https://moli-green.is)**
*User Manual (The Handbook)*: **[USER_MANUAL.md](./USER_MANUAL.md)**

## v1.7.9 Sovereign Update (Deep Security Hardening)
- **Deep Security**:
    - **Pull Semantics**: Client strictly enforces "Pull" logic. Unrequested transfers are blocked at the WebRTC gate, preventing "Drive-by Download" attacks.
    - **Global Circuit Breaker**: Server enforces a hard limit on concurrent connections (1000) to protect against resource exhaustion.
    - **Strict Secret Enforcement**: Server refuses to boot without a secure `TURN_SECRET`, eliminating accidental insecure deployments.
- **Client Resilience**: Fixed critical "Resource Starvation" DoS vulnerability. Implemented smart timeouts for stalled transfers and strict error feedback loops.
- **Server Hardening**:
    - **Identity Authority**: Server assigns and enforces cryptographic identities, preventing spoofing.
    - **DoS Protection**: Token Bucket rate limiting (10 msg/sec) and strict message size limits (16KB).
    - **Secure Credentials**: Ephemeral TURN credentials signed with HMAC-SHA1 to prevent replay attacks.
- **Sovereign Reset**: New "Danger Modal" for secure identity destruction.
- **Sakoku Policy**: "Burn" actions are strictly local ("My Computer, My Castle"), preventing moderation spam.

## Philosophy

Moli P2P is a rejection of central storage costs and "platform risk."
- **Serverless-ish**: The server is a "dumb pipe" (Signal Relay). It stores nothing.
- **Ephemeral**: Images exist only in the browser memory of active peers. If everyone closes the tab, the gallery vanishes.
- **Sovereign**: No external AI APIs. No Google. No centralized moderation. Your computer is your castle.

## Running Your Own Node (Docker)

You can run a full Moli P2P node (Server + Client) on your own infrastructure (VPS, Raspberry Pi, Laptop) in seconds.

### Prerequisites
- Docker & Docker Compose

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/moli-green/moli-p2p.git
cd moli-p2p

# 2. Start the mesh
docker compose up -d
```

That's it.
- **Client**: `http://localhost` (or your server's IP)
- **Signaling**: `http://localhost:9090` (Internal)

> **Note**: This minimal Docker setup ensures the *application* runs, but for connectivity over the internet (NAT Traversal) or mobile 4G, you need a **TURN Server**. See [deployment.md](./deployment.md) for full production setup including Coturn.

## License

**AGPLv3** (GNU Affero General Public License v3.0)

This license ensures that if you run a modified version of this service accessible over a network, you must release the source code. This protects the project from being enclosed by proprietary cloud services.

See [LICENSE](./LICENSE) for details.

## Documentation

- [Deployment Guide](./deployment.md): Detailed production setup (VPS, SSL, TURN).
- [Specification](./spec.md): Technical architecture and protocol details.
