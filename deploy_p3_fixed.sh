#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# --- Configuration ---
# Load from external config (deployed via rsync)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deploy.config" ]; then
    source "$SCRIPT_DIR/deploy.config"
else
    echo "ERROR: deploy.config not found in $SCRIPT_DIR"
    exit 1
fi

# Variables from config: DOMAIN, EMAIL, TURN_USER, TURN_PASS, REALM, SOURCE_DIR, APP_DIR

echo ">>> Starting Moli P2P App Deployment (Phase 3: Fixed)..."

# 1. Server Build (Rust)
echo ">>> Building Server..."
if [ -d "$APP_DIR/server" ]; then
    cd "$APP_DIR/server"
    # Ensure Rust is installed
    if ! command -v cargo &> /dev/null; then
        echo ">>> Installing Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    else
        source "$HOME/.cargo/env" || true
    fi
    
    cargo build --release
    
    # INSTALL BINARY to Service Location
    echo ">>> Stopping service to release binary lock..."
    sudo systemctl stop moli-p2p
    
    echo ">>> Installing binary to /home/moli/moli-p2p/server_bin/..."
    mkdir -p /home/moli/moli-p2p/server_bin
    cp target/release/server /home/moli/moli-p2p/server_bin/server
    
    # Start Service
    sudo systemctl start moli-p2p
else
    echo "ERROR: Server directory not found at $APP_DIR/server"
    exit 1
fi

# 2. Client Build
echo ">>> Building Client..."
if [ -d "$APP_DIR/client" ]; then
    cd "$APP_DIR/client"
    npm install

    # --- SECURE TURN CONFIGURATION ---
    echo ">>> Configuring Secure TURN (Ephemeral Auth)..."
    
    # Generate Secret if not exists (or just rotate it for this transition)
    # For simplicity and security, we will generate a stable random secret for this host if missing
    SECRET_FILE="/home/moli/moli-p2p/turn_secret"
    if [ ! -f "$SECRET_FILE" ]; then
        openssl rand -hex 32 > "$SECRET_FILE"
        chmod 600 "$SECRET_FILE"
    fi
    TURN_SECRET=$(cat "$SECRET_FILE")
    
    # Update Coturn Config
    # Check if 'use-auth-secret' is enabled, if not, re-write config
    if ! grep -q "use-auth-secret" /etc/turnserver.conf; then
        echo ">>> Updating /etc/turnserver.conf to use Shared Secret..."
        PUBLIC_IP=$(curl -s ifconfig.me)
        sudo tee /etc/turnserver.conf > /dev/null <<EOF
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=moli-green.is
total-quota=100
stale-nonce
log-file=/var/log/turnserver.log
external-ip=$PUBLIC_IP
no-cli
EOF
        sudo systemctl restart coturn
        echo ">>> Coturn Restarted."
    fi

    # Update Service Environment (Pass Secret to Rust Server)
    # We use a drop-in override or just edit the service file if we are lazy (we own it)
    # Let's replace the Environment line in systemd service
    # Assuming standard location /etc/systemd/system/moli-p2p.service
    
    # Check if TURN_SECRET is already in service
    if ! grep -q "TURN_SECRET" /etc/systemd/system/moli-p2p.service; then
        echo ">>> Adding TURN_SECRET to moli-p2p.service..."
        # Replace Environment=RUST_LOG=info with Environment="RUST_LOG=info TURN_SECRET=$TURN_SECRET"
        # Or just append
        sudo sed -i "s|Environment=RUST_LOG=info|Environment=RUST_LOG=info\nEnvironment=TURN_SECRET=$TURN_SECRET|" /etc/systemd/system/moli-p2p.service
        sudo systemctl daemon-reload
    fi
     
    # Remove Client Injection (No longer needed, Client fetches from API)
    # echo ">>> Injecting Production Config..." -> SKIPPED

    npm run build
else
    echo "ERROR: Client directory not found"
    exit 1
fi

# 3. Nginx Setup
echo ">>> Ensuring Nginx Config..."
sudo tee /etc/nginx/sites-available/moli > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        root $APP_DIR/client/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ws {
        proxy_pass http://localhost:9090/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    location /api/ice-config {
        proxy_pass http://localhost:9090/api/ice-config;
        proxy_set_header Host \$host;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/moli /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 4. SSL
echo ">>> Checking SSL..."
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL || echo "Certbot failed, please run manually."
fi

echo ">>> DEPLOYMENT SUCCESSFUL!"
