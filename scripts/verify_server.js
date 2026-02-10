const WebSocket = require('ws');
const fs = require('fs');

const URL = 'ws://localhost:9090/ws';

async function testIpLimit() {
    console.log('--- Testing IP Limit (Max 10) ---');
    const clients = [];
    const limit = 12;

    try {
        for (let i = 0; i < limit; i++) {
            await new Promise(r => setTimeout(r, 50)); // stagger slightly
            const ws = new WebSocket(URL);

            await new Promise((resolve, reject) => {
                ws.on('open', () => {
                    // console.log(`Client ${i+1} Connected`);
                    clients.push(ws);
                    resolve();
                });
                ws.on('error', (err) => {
                    if (i >= 10) {
                        console.log(`✅ Client ${i + 1} Rejected as expected: ${err.message}`);
                        resolve(); // Success for rejection
                    } else {
                        console.error(`❌ Client ${i + 1} Failed unexpectedly: ${err.message}`);
                        reject(err);
                    }
                });
                ws.on('close', (code, reason) => {
                    if (i >= 10) {
                        // console.log(`✅ Client ${i+1} Closed as expected: ${code} ${reason}`);
                    }
                });
            });
        }
    } catch (e) {
        console.error("Test Failed", e);
    }

    console.log(`Connected ${clients.length} clients.`);
    if (clients.length === 10) {
        console.log('✅ IP Limit Verified: Only 10 clients connected.');
    } else {
        console.error(`❌ IP Limit Failed: ${clients.length} clients connected (Expected 10).`);
    }

    // Cleanup
    clients.forEach(c => c.close());
    await new Promise(r => setTimeout(r, 1000)); // Wait for cleanup
}

async function testMsgSize() {
    console.log('\n--- Testing Message Size Limit (Max 16KB) ---');
    return new Promise((resolve) => {
        const ws = new WebSocket(URL);
        let passed = false;

        ws.on('open', () => {
            console.log('Client Connected. Sending 17KB payload...');
            const bigPayload = 'X'.repeat(17 * 1024);
            try {
                ws.send(bigPayload);
            } catch (e) {
                console.log('Send failed immediately (good)');
            }
        });

        ws.on('close', (code) => {
            console.log(`Connection Closed: ${code}`);
            if (code === 1009 || code === 1006) { // 1009: Message Too Big, 1006: Abnormal (sometimes Axum drops connection abruptly)
                console.log('✅ Message Size Verified: Connection closed.');
                passed = true;
            } else {
                console.error('❌ Unexpected Close Code');
            }
            resolve();
        });

        ws.on('error', (e) => {
            console.log(`Connection Error: ${e.message}`); // Often "socket hang up"
            passed = true;
            resolve();
        });

        // Timeout
        setTimeout(() => {
            if (!passed && ws.readyState === WebSocket.OPEN) {
                console.error('❌ Timeout: Connection remained open.');
                ws.close();
                resolve();
            }
        }, 2000);
    });
}

async function main() {
    await testIpLimit();
    await testMsgSize();
    console.log('\n--- Tests Complete ---');
    console.log('Note: Check Server Logs for "Room empty. Removing." and "Rate limit exceeded".');
    process.exit(0);
}

main();
