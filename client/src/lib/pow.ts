import { bufferToHex, TEXT_ENCODER } from '../utils';

export async function generatePoW(peerId: string, timestamp: number, difficulty: number = 4): Promise<{ nonce: string; duration: number }> {
    const start = Date.now();
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;

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

        // Yield to browser UI thread every 500 iterations to prevent freezing
        if (nonce % 500 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}
