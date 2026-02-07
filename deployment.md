# Deployment Guide (Sovereign Edition v1.7.9+)

Moli P2P is designed to be "Sovereign," meaning you own the infrastructure. This guide covers how to deploy a Production Relay Node + Client.

## Architecture

- **Signaling Server**: Rust (Axum/Tokio). Handles WebRTC signaling and STUN/TURNauth.
- **Client**: Static HTML/JS (Vite Build). Served via Nginx.
- **TURN Server**: Coturn. Required for NAT Traversal (connecting peers behind firewalls).

---

## Method 1: Docker (Recommended for Quick Start)

Ideal for testing or personal usage on a standard Linux server.

1.  **Clone & Enter**:
    ```bash
    git clone https://github.com/moli-green/moli-p2p.git
    cd moli-p2p
    ```

2.  **Configure**:
    Create a `.env` file or modify `docker-compose.yml` to set your `TURN_SECRET`.
    ```bash
    TURN_SECRET=your_secure_random_string_here
    ```

3.  **Launch**:
    ```bash
    docker compose up -d --build
    ```

4.  **Access**:
    -   Frontend: `http://localhost` (or server IP)
    -   Signaling: `http://localhost:9090` (Internal proxy)

---

## Method 2: Production Script (VPS/Bare Metal)

This is the method used for `moli-green.is`. It sets up Nginx, Certbot (SSL), Coturn, and the Rust Server with **Strict Security**.

### Prerequisites
- A fresh Ubuntu/Debian VPS.
- A domain name pointing to the VPS IP.
- SSH access.

### 1. Configuration Check

The deployment scripts rely on a local configuration file that is **gitignored** to protect your secrets.

1.  Copy the template:
    ```bash
    cp deploy.config.template deploy.config
    ```

2.  Edit `deploy.config` with your actual values:
    ```bash
    # Connection
    DEPLOY_USER="your_vps_user"
    DEPLOY_HOST="your_domain.com"
    TARGET_DIR="/var/www/moli-p2p"
    
    # App Settings
    DOMAIN="your_domain.com"
    EMAIL="admin@your_domain.com"
    
    # Secrets (Managed automatically by script, but can be overridden)
    # TURN_SECRET is auto-generated on the server if missing.
    ```

### 2. Deploy

Run the deployment script from your local machine:

```bash
./deploy_to_production.sh
```

**What this script does:**
1.  **Sync**: Uses `rsync` to upload the codebase and `deploy.config` to the VPS.
2.  **Remote Build**: Triggers `deploy_p3_fixed.sh` on the server.
    -   Installs Rust, Node.js, Coturn, Nginx.
    -   Generates a secure `TURN_SECRET` using `openssl` (if not present).
    -   Configures Coturn with `static-auth-secret` (Ephemeral Auth).
    -   Compiles the Rust Server (`release` mode).
    -   Builds the Client (`vite build`).
    -   Configures Systemd services (`moli-p2p`, `coturn`).
    -   Obtains SSL certificates via Certbot.

### 3. Verification

After deployment, check the logs on the server:

```bash
# Server Logs
ssh user@domain "journalctl -u moli-p2p -f"

# TURN Logs
ssh user@domain "tail -f /var/log/turnserver.log"
```

---

## Security Notes

-   **Ephemeral Auth**: The system uses strict WebRTC authentication. The server and Coturn share a secret key. If they mismatch, no connections will succeed.
-   **Sakoku Policy**: The server enforces a "Circuit Breaker" (1000 connections) and strictly limits message rates.
-   **Firewall**: Ensure these ports are open:
    -   `80/tcp`, `443/tcp` (Web)
    -   `3478/udp/tcp`, `5349/udp/tcp` (TURN)
    -   `49152-65535/udp` (WebRTC Media)
