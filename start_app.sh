#!/bin/bash
# Start server in background
cd server
export TURN_SECRET="dummy_secret_for_test"
cargo run --release &
SERVER_PID=$!
cd ..

# Start client in background
cd client
bun install
bun run build
# use a simple python server to serve the built files on port 8080 (non-privileged)
cd dist
python3 -m http.server 8080 &
CLIENT_PID=$!
cd ../..

echo "Server PID: $SERVER_PID"
echo "Client PID: $CLIENT_PID"
# Wait to ensure they start
sleep 5
