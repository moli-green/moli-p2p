#!/bin/bash
# Script to run all E2E tests
set -e

# Install Python dependencies
pip install -r tests/requirements.txt > /dev/null 2>&1
playwright install --with-deps chromium > /dev/null 2>&1

# Build server
echo "Building server..."
cd server
cargo build --release > /dev/null 2>&1
export TURN_SECRET="dummy_secret_for_test"
echo "Starting server..."
# kill any existing server
kill -9 $(lsof -t -i:9090) 2>/dev/null || true
./target/release/server > /dev/null 2>&1 &
SERVER_PID=$!
cd ..

# Build and start client in background
echo "Building client..."
cd client
rm -rf dist
bun install > /dev/null 2>&1
bun run build > /dev/null 2>&1
echo "Starting client HTTP server..."
cd dist
# kill any existing web server
kill -9 $(lsof -t -i:8080) 2>/dev/null || true
python3 -m http.server 8080 > /dev/null 2>&1 &
CLIENT_PID=$!
cd ../..

echo "Waiting for services to start..."
sleep 5

echo "Running tests..."
# Run the tests
set +e
pytest tests/e2e/test_basic.py tests/e2e/test_p2p_transfer.py tests/e2e/test_p2p_mesh.py -v -s
TEST_EXIT_CODE=$?

# Cleanup
echo "Cleaning up..."
kill -9 $SERVER_PID 2>/dev/null || true
kill -9 $CLIENT_PID 2>/dev/null || true

exit $TEST_EXIT_CODE
