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

echo ">>> Starting Moli P2P App Deployment (Phase 3: Final)..."

# 1. Move Source Code
echo ">>> Deploying Source Code..."
if [ -d "$SOURCE_DIR" ]; then
    echo ">>> Moving source from $SOURCE_DIR..."
    sudo rm -rf "$APP_DIR"
    sudo mkdir -p /var/www
    sudo mv "$SOURCE_DIR" "$APP_DIR"
    sudo chown -R $USER:$USER "$APP_DIR"
elif [ -d "$APP_DIR" ]; then
    echo ">>> App directory $APP_DIR already exists. Proceeding with existing code."
    # Ensure ownership is correct
    sudo chown -R $USER:$USER "$APP_DIR"
else
    echo "ERROR: Source directory $SOURCE_DIR not found and App directory $APP_DIR does not exist!"
    exit 1
fi

# 2. Gateway Build
echo ">>> Building Gateway..."
cd "$APP_DIR/gateway"
npm install
npm install -D @types/better-sqlite3
npm run build

# Start Gateway
if pm2 list | grep -q "moli-gateway"; then
    pm2 delete moli-gateway
fi
pm2 start dist/server.js --name "moli-gateway"
pm2 save

# 3. Client Build
echo ">>> Building Client..."
cd "$APP_DIR/client"
npm install

# Inject TURN Config
echo ">>> Injecting Production Config..."
sed -i "s|// To use a TURN server.*|// Injecting PROD Config|" src/main.ts
# Multi-line handling in sed is tricky, going for simple replace of the placeholder block
# We know the placeholder structure.
# Replacing the commented out block start/end
sed -i "s|/\*|const iceServers = [{ urls: 'turn:$DOMAIN:3478', username: '$TURN_USER', credential: '$TURN_PASS' }, { urls: 'stun:stun.l.google.com:19302' }]; await network.init({ iceServers }); //|" src/main.ts
sed -i "s|\*/|// End Injection|" src/main.ts
sed -i "s|await network.init();|// await network.init();|" src/main.ts

npm run build

# 4. Nginx Setup (Ensure config is correct)
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

    location /api/ {
        proxy_pass http://localhost:3030/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/moli /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 5. SSL
echo ">>> Checking SSL..."
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
   sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL || echo "Certbot failed, please run manually."
fi

echo ">>> DEPLOYMENT SUCCESSFUL!"
