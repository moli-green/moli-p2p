const WebSocket = require('ws');

const SERVER_URL = 'ws://localhost:9090/ws';
const TEST_ORIGIN = 'http://localhost:3000'; // Should be allowed if ALLOWED_ORIGIN not set, or matching

async function testJsonInjection() {
    console.log('[Test] JSON Injection / Payload Validation');
    const ws = new WebSocket(SERVER_URL);

    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('  Connected.');

            // 1. Valid Object
            ws.send(JSON.stringify({ type: 'test', content: 'valid' }));
            console.log('  Sent Valid Object. (Should be accepted)');

            // 2. Array Injection
            ws.send(JSON.stringify(['hack', { senderId: 'fake' }]));
            console.log('  Sent JSON Array. (Should be dropped silently)');

            // 3. Primitive Injection
            ws.send(JSON.stringify("just a string"));
            console.log('  Sent Primitive. (Should be dropped silently)');

            // Wait a bit to see if we get disconnected (we shouldn't)
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    console.log('  ✅ Connection remains open (Correct behavior: Silently dropped).');
                    ws.close();
                    resolve(true);
                } else {
                    console.error('  ❌ Connection closed unexpectedly.');
                    resolve(false);
                }
            }, 1000);
        });

        ws.on('error', (e) => {
            console.error('  ❌ Connection Error:', e.message);
            resolve(false);
        });
    });
}

async function testRateLimit() {
    console.log('\n[Test] Rate Limiting (Soft/Hard)');
    const ws = new WebSocket(SERVER_URL);

    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('  Connected. Sending burst...');
            let sent = 0;
            const burst = setInterval(() => {
                ws.send(JSON.stringify({ type: 'ping' }));
                sent++;

                if (sent === 15) {
                    console.log('  Sent 15 messages (Should trigger Soft Limit default warning in server logs, but keep connection)');
                }

                if (sent >= 60) {
                    clearInterval(burst);
                    console.log('  Sent 60 messages (Should trigger Hard Limit disconnect)');
                }
            }, 10); // Very fast burst

            ws.on('close', () => {
                console.log(`  Connection closed after ${sent} messages.`);
                if (sent >= 50) {
                    console.log('  ✅ Disconnected correctly at Hard Limit (>50).');
                    resolve(true);
                } else if (sent > 10) {
                    console.error('  ❌ Premature disconnect (Soft limit is acting as hard limit?)');
                    resolve(false);
                } else {
                    console.warn('  ⚠️ Disconnected too early?');
                    resolve(false);
                }
            });
        });
    });
}

(async () => {
    console.log('=== Server Security Verification ===');
    const injectionPass = await testJsonInjection();
    const rateLimitPass = await testRateLimit();

    if (injectionPass && rateLimitPass) {
        console.log('\n✅ ALL TESTS PASSED');
        process.exit(0);
    } else {
        console.error('\n❌ TESTS FAILED');
        process.exit(1);
    }
})();
