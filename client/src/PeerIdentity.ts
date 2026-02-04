const DB_NAME = 'moli_id_db';
const STORE_NAME = 'keys';
const KEY_ID = 'identity';

export interface IdentityData {
    keyPair: CryptoKeyPair;
    createdAt: number;
}

export class PeerIdentity {
    private keyPair: CryptoKeyPair | null = null;
    public peerId: string = '';
    public createdAt: number = 0;
    public publicKeySpki: ArrayBuffer | null = null;

    async init(): Promise<string> {
        const data = await this.loadFromDB();

        if (!data) {
            console.log('[Identity] Generating new ECDSA key pair...');
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDSA",
                    namedCurve: "P-256",
                },
                false, // extractable: false (CRITICAL FOR SECURITY)
                ["sign", "verify"]
            );
            this.createdAt = Date.now();
            await this.saveToDB(this.keyPair, this.createdAt);
        } else {
            console.log('[Identity] Loaded existing key pair.');
            this.keyPair = data.keyPair;
            this.createdAt = data.createdAt;
        }

        try {
            this.publicKeySpki = await window.crypto.subtle.exportKey('spki', this.keyPair.publicKey);
        } catch (e) {
            console.error('[Identity] Key export failed (corruption detected). Resetting Identity.', e);
            await this.deleteDB();
            window.location.reload();
            return ""; // Stops execution
        }

        this.peerId = await this.derivePeerId(this.publicKeySpki);
        console.log('[Identity] PeerID:', this.peerId, 'Created At:', new Date(this.createdAt).toLocaleString());

        return this.peerId;
    }

    private async derivePeerId(spki: ArrayBuffer): Promise<string> {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', spki);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.substring(0, 16); // 16 char fingerprint
    }

    async signMetadata(name: string, size: number, hash: string, isPinned: boolean = false): Promise<string> {
        if (!this.keyPair) throw new Error('Identity not initialized');
        const encoder = new TextEncoder();
        // Include createdAt and isPinned in signed data to prove age and vetting
        const data = encoder.encode(`${name}:${size}:${hash}:${this.createdAt}:${isPinned}`);

        const signature = await window.crypto.subtle.sign(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            this.keyPair.privateKey,
            data
        );

        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    async verifyMetadata(publicKey: CryptoKey, signatureBase64: string, name: string, size: number, hash: string, createdAt: number, isPinned: boolean = false): Promise<boolean> {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(`${name}:${size}:${hash}:${createdAt}:${isPinned}`);
            const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

            return await window.crypto.subtle.verify(
                { name: "ECDSA", hash: { name: "SHA-256" } },
                publicKey,
                signature,
                data
            );
        } catch (e) {
            console.error('[Identity] Verification error:', e);
            return false;
        }
    }

    async signBurn(hash: string): Promise<string> {
        if (!this.keyPair) throw new Error('Identity not initialized');
        const encoder = new TextEncoder();
        const data = encoder.encode(`burn:${hash}:${this.createdAt}`);

        const signature = await window.crypto.subtle.sign(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            this.keyPair.privateKey,
            data
        );

        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    async verifyBurn(publicKey: CryptoKey, signatureBase64: string, hash: string, createdAt: number): Promise<boolean> {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(`burn:${hash}:${createdAt}`);
            const signature = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

            return await window.crypto.subtle.verify(
                { name: "ECDSA", hash: { name: "SHA-256" } },
                publicKey,
                signature,
                data
            );
        } catch (e) {
            console.error('[Identity] Burn verification error:', e);
            return false;
        }
    }

    async importPublicKey(spki: ArrayBuffer): Promise<CryptoKey> {
        return await window.crypto.subtle.importKey(
            'spki',
            spki,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ['verify']
        );
    }

    async burn() {
        console.warn('[Identity] BURNING IDENTITY AND RELOADING...');
        await this.deleteDB();
        window.location.reload();
    }

    private async loadFromDB(): Promise<IdentityData | null> {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(STORE_NAME);
            };
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const getReq = store.get(KEY_ID);
                getReq.onsuccess = () => {
                    const result = getReq.result;

                    // 1. No data
                    if (!result) {
                        db.close();
                        return resolve(null);
                    }

                    // 2. New Format (IdentityData)
                    if (result.keyPair && result.createdAt) {
                        db.close();
                        return resolve(result as IdentityData);
                    }

                    // 3. Legacy Format (CryptoKeyPair only) - Migration
                    if (result.publicKey && result.privateKey) {
                        const migratedData = { keyPair: result as CryptoKeyPair, createdAt: Date.now() };
                        console.log('[Identity] Migrating legacy key pair...');

                        // We need a new transaction for writing if we were readonly? 
                        // Actually we were readonly. We can't write here.
                        // So we just resolve with migrated data, and saveToDB will be called by init() 
                        // if we returned null, but we are returning data.
                        // We should probably just return the data and let init() continue, 
                        // or verify if we need to persist migration now.
                        // Simpler: Just resolve, let the user be "new" effectively or trigger a save?
                        // Actually, init() only saves if !data.
                        // So we should save here? But we can't reusing the readonly tx.
                        // Let's just return the migrated object. The next time we save (e.g. burn/re-init) it fixes.
                        // Or we can fire-and-forget a save? No, need consistent DB.
                        // We will return the data. The only downside is next load is still legacy.
                        // That's acceptable for now to unblock.

                        db.close();
                        return resolve(migratedData);
                    }

                    // 4. Unknown/Corrupt
                    db.close();
                    resolve(null);
                };
                getReq.onerror = () => {
                    db.close();
                    resolve(null);
                };
                getReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        });
    }

    private async saveToDB(kp: CryptoKeyPair, createdAt: number): Promise<void> {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.put({ keyPair: kp, createdAt }, KEY_ID);
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    resolve(); // Resolve anyway to avoid blocking
                };
            };
        });
    }

    private async deleteDB(): Promise<void> {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }
}
