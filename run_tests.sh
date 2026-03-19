#!/bin/bash
# Script to run all E2E tests

# Install Python dependencies
pip install -r tests/requirements.txt > /dev/null 2>&1
playwright install --with-deps chromium > /dev/null 2>&1

# Build server
echo "Building server..."
cd server
cargo build --release > /dev/null 2>&1
export TURN_SECRET="dummy_secret_for_test"
echo "Starting server..."
./target/release/server > /dev/null 2>&1 &
SERVER_PID=$!
cd ..

# Build and start client in background
echo "Building client..."
cd client
bun install > /dev/null 2>&1
bun run build > /dev/null 2>&1
echo "Starting client HTTP server..."
cd dist
python3 -m http.server 8080 > /dev/null 2>&1 &
CLIENT_PID=$!
cd ../..

echo "Waiting for services to start..."
sleep 5

echo "Running tests..."
# Run the tests
pytest tests/e2e/test_basic.py tests/e2e/test_p2p_transfer.py -v

# Cleanup
echo "Cleaning up..."
kill -9 $SERVER_PID 2>/dev/null || true
kill -9 $CLIENT_PID 2>/dev/null || true
