#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

# --- Configuration ---
DOMAIN="moli-green.is"
EMAIL="moli@moli-green.is"
TURN_USER="moli"
TURN_PASS="honor_p2p_secret"
REALM="moli-green.is"
SOURCE_DIR="/home/moli/moli-p2p-source"
APP_DIR="/var/www/moli-p2p"

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
    
    # Reload Service
    sudo systemctl restart moli-p2p
else
    echo "ERROR: Server directory not found at $APP_DIR/server"
    exit 1
fi

# 2. Client Build
echo ">>> Building Client..."
if [ -d "$APP_DIR/client" ]; then
    cd "$APP_DIR/client"
    npm install

    # Inject TURN Config (Robust Method)
    echo ">>> Injecting Production Config..."
    TARGET="src/main.ts"
    
    # We assume 'main.ts' is clean (restored via rsync before this script runs)
    
    # replace "await network.init();" with "// await network.init();"
    # But only the last one? Or specific line.
    # The default one is preceded by "// Default (Google STUN only)"
    
    # Replace "const initPromise = network.init();" with the production init
    INJECT="const iceServers = [{ urls: 'turn:$DOMAIN:3478', username: '$TURN_USER', credential: '$TURN_PASS' }, { urls: 'stun:stun.l.google.com:19302' }]; const initPromise = network.init({ iceServers });"
    
    sed -i "s|const initPromise = network.init();|$INJECT|" "$TARGET"

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
