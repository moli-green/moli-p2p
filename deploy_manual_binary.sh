#!/bin/bash
set -e

# Configuration
TARGET_HOST="moli@moli-green.is"
TARGET_DIR="/var/www/moli-p2p"
SERVER_BIN="./server/target/x86_64-unknown-linux-gnu/release/server"
CLIENT_DIST="./client/dist"

echo ">>> 🚀 Starting Manual Deployment (Pre-built Binaries)..."

# 1. STOP Service
echo ">>> 🛑 Stopping Service..."
ssh $TARGET_HOST "sudo systemctl stop moli-server"

# 2. Upload Server Binary
echo ">>> 📤 Uploading Server Binary..."
# Ensure destination folder exists
ssh $TARGET_HOST "mkdir -p $TARGET_DIR/server"
scp $SERVER_BIN $TARGET_HOST:$TARGET_DIR/server/server
ssh $TARGET_HOST "chmod +x $TARGET_DIR/server/server"

# 3. Upload Client Assets
echo ">>> 📤 Uploading Client Assets..."
ssh $TARGET_HOST "rm -rf $TARGET_DIR/client/dist"
scp -r $CLIENT_DIST $TARGET_HOST:$TARGET_DIR/client/

# 4. Upload Systemd Service (Just in case)
echo ">>> ⚙️ Updating Service Config..."
scp moli-p2p.service $TARGET_HOST:$TARGET_DIR/
ssh $TARGET_HOST "sudo cp $TARGET_DIR/moli-p2p.service /etc/systemd/system/ && sudo systemctl daemon-reload"

# 5. START Service
echo ">>> ✅ Starting Service..."
ssh $TARGET_HOST "sudo systemctl start moli-server"

echo ">>> 🎉 Deployment Complete!"
