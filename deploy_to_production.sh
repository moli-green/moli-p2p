#!/bin/bash
set -e

# Configuration
source ./deploy.config

TARGET_HOST="$DEPLOY_USER@$DEPLOY_HOST"
# TARGET_DIR is loaded from deploy.config

echo ">>> 🚀 Starting Deployment to $TARGET_HOST..."

# 1. Sync Files
echo ">>> 📂 Syncing files..."
# We explicitly exclude node_modules and .git to save time and bandwidth
# We also exclude client/dist because it will be built on the server
rsync -avz \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'client/dist' \
    --exclude 'server/target' \
    --exclude 'gateway' \
    ./ $TARGET_HOST:$TARGET_DIR/

# 2. Execute Remote Build
echo ">>> 🏗️  Triggering Remote Build..."
ssh $TARGET_HOST "rm -f $TARGET_DIR/gateway/test_api.ts"
ssh $TARGET_HOST "chmod +x $TARGET_DIR/deploy_p3_fixed.sh && $TARGET_DIR/deploy_p3_fixed.sh"

echo ">>> ✅ Deployment Process Finished!"
