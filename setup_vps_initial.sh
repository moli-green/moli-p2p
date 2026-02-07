#!/bin/bash
set -e

# --- Configuration ---
DOMAIN="moli-green.is"
EMAIL="moli@moli-green.is"
TURN_USER="moli"
# TURN_PASS is removed (using ephemeral auth)
REALM="moli-green.is"
REPO_URL="https://github.com/moli-green/moli-p2p.git"
APP_DIR="/var/www/moli-p2p"

echo ">>> Starting Moli P2P Deployment on $DOMAIN..."

# 1. System Update
echo ">>> Updating System..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y coturn nginx certbot python3-certbot-nginx nodejs npm build-essential git

# 2. TURN Server (coturn) Setup
echo ">>> Configuring Coturn..."
# Get Public IP
PUBLIC_IP=$(curl -s ifconfig.me)

# Generate Secure Secret
SECRET_FILE="/home/moli/moli-p2p/turn_secret"
mkdir -p /home/moli/moli-p2p
if [ ! -f "$SECRET_FILE" ]; then
    openssl rand -hex 32 > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
fi
TURN_SECRET=$(cat "$SECRET_FILE")

sudo tee /etc/turnserver.conf > /dev/null <<EOF
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=$TURN_SECRET
realm=$REALM
total-quota=100
stale-nonce
log-file=/var/log/turnserver.log
external-ip=$PUBLIC_IP
no-cli
EOF

sudo systemctl enable coturn
sudo systemctl restart coturn

# 3. Server (Rust) Setup
echo ">>> Setting up Rust Server..."
# Install Rust
if ! command -v cargo &> /dev/null; then
  echo ">>> Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source $HOME/.cargo/env
fi

# Build Server
cd "$APP_DIR/server"
sudo -E cargo build --release

# Setup Systemd for Rust Server
sudo tee /etc/systemd/system/moli-server.service > /dev/null <<EOF
[Unit]
Description=Moli P2P Rust Server
After=network.target

[Service]
User=root
# Running as root to simplify permission for now, ideally create moli user
WorkingDirectory=$APP_DIR/server
ExecStart=$APP_DIR/server/target/release/server
Restart=always
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now moli-server
sudo systemctl restart moli-server

pm2 save
pm2 startup | grep "sudo" | bash || true # Auto-configure startup if possible

# 4. Client Build (Initial)
echo ">>> Building Client..."
cd "$APP_DIR/client"
sudo npm install
# Inject TURN Credentials into main.ts matches the implementation plan of Phase 2.1 which uses main.ts
# However, modifying files in git repo on server is messy.
# For now we build 'as is' (STUN only) to get Nginx up, then we can SCP the config-injected main.js later?
# Or better: We create the config file locally on the server.
# But main.ts is compiled.
# Let's just build it first.
sudo npm run build

# 5. Nginx Setup
echo ">>> Configuring Nginx..."
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
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

sudo ln -sf /etc/nginx/sites-available/moli /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 6. SSL Check
# We won't run Certbot non-interactively to avoid limits/errors if already done.
echo ">>> Deployment Complete!"
echo ">>> NOTE: Run 'sudo certbot --nginx -d $DOMAIN' manually to enable HTTPS."
echo ">>> TURN Server is running on port 3478."
echo ">>> Gateway is running on port 3030."
