#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# --- Configuration ---
DOMAIN="moli-green.is"
EMAIL="moli@moli-green.is"
TURN_USER="moli"
TURN_PASS="honor_p2p_secret"
REALM="moli-green.is"
REPO_URL="https://github.com/moli-green/moli-p2p.git"
APP_DIR="/var/www/moli-p2p"

echo ">>> Starting Moli P2P App Deployment (Phase 2)..."

# 1. Install Dependencies (Ensure they are present)
echo ">>> Installing Dependencies..."
# Ensure curl is present to get node setup
sudo apt install -y curl

# Install Node.js 20.x (LTS) explicitly to ensure we have recent npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential

sudo apt install -y coturn nginx certbot python3-certbot-nginx git

# 2. TURN Server (coturn) Setup
echo ">>> Configuring Coturn..."
PUBLIC_IP=$(curl -s ifconfig.me)
# Setup user for coturn
# Note: turnadmin might be needed for database, but config file user= is simple for static
sudo tee /etc/turnserver.conf > /dev/null <<EOF
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
user=$TURN_USER:$TURN_PASS
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
# Install Rust if not present
if ! command -v cargo &> /dev/null; then
    echo ">>> Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# Build Server (Release)
echo ">>> Building Server..."
cd "$APP_DIR/server"
cargo build --release

# Setup Systemd Service for Rust Server
sudo tee /etc/systemd/system/moli-server.service > /dev/null <<EOF
[Unit]
Description=Moli P2P Rust Server
After=network.target

[Service]
User=$USER
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


# 4. Client Build
echo ">>> Building Client..."
cd "$APP_DIR/client"
npm install
# In Production, we want to inject the TURN config.
# We'll do a dirty injection into main.ts before build if needed, 
# BUT `main.ts` in `src` is what we edit.
# Let's inject the real config now.
sed -i "s|// To use a TURN server.*|// Injecting PROD Config|" src/main.ts
sed -i "s|/\*|const iceServers = [{ urls: 'turn:$DOMAIN:3478', username: '$TURN_USER', credential: '$TURN_PASS' }, { urls: 'stun:stun.l.google.com:19302' }]; await network.init({ iceServers }); //|" src/main.ts
sed -i "s|\*/|// End Injection|" src/main.ts
# Disable default init
sed -i "s|await network.init();|// await network.init();|" src/main.ts

npm run build

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
echo ">>> Attempting SSL Setup..."
# If not already secure, try to get cert
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL || echo "Certbot failed, please run manually."
fi

echo ">>> Phase 2 Deployment Complete!"
