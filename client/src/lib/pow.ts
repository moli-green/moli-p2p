import { bufferToHex, TEXT_ENCODER } from '../utils';

export async function generatePoW(peerId: string, timestamp: number, difficulty: number = 4): Promise<{ nonce: string; duration: number }> {
    const start = Date.now();
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    let lastYield = Date.now();

    console.log(`[PoW] Starting challenge (Difficulty: ${difficulty})...`);

    while (true) {
        const nonceStr = nonce.toString();
        const data = TEXT_ENCODER.encode(peerId + timestamp + nonceStr);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashHex = bufferToHex(hashBuffer);

        if (hashHex.startsWith(prefix)) {
            const duration = Date.now() - start;
            console.log(`[PoW] Solution found in ${duration}ms: ${nonceStr}`);
            return { nonce: nonceStr, duration };
        }

        nonce++;

        // Check time every 100 iterations to avoid excessive Date.now() calls
        if (nonce % 100 === 0) {
            // Yield to browser UI thread if more than 20ms have passed to prevent freezing
            if (Date.now() - lastYield > 20) {
                await new Promise(resolve => setTimeout(resolve, 0));
                lastYield = Date.now();
            }
        }
    }
}
