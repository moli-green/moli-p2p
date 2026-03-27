export enum TrustStatus {
    DIRECT_TRUST = 'DIRECT_TRUST',
    RECOMMENDED = 'RECOMMENDED'
}

export interface TrustItem {
    publicKeyBase64: string;
    status: TrustStatus;
    timestamp: number;
}

export class TrustStore {
    private static DB_NAME = 'moli_trust_db';
    private static STORE_NAME = 'trust_status';
    private static db: IDBDatabase | null = null;

    // In-memory cache for fast synchronous lookups in the UI
    private static cache: Map<string, TrustStatus> = new Map();

    static async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'publicKeyBase64' });
                }
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;

                // Load all items into memory cache upon initialization
                const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const getAllRequest = store.getAll();

                getAllRequest.onsuccess = () => {
                    const items: TrustItem[] = getAllRequest.result;
                    for (const item of items) {
                        this.cache.set(item.publicKeyBase64, item.status);
                    }
                    console.log(`[TrustStore] Initialized. Loaded ${this.cache.size} items into cache.`);
                    resolve();
                };

                getAllRequest.onerror = () => {
                    console.error('[TrustStore] Failed to load initial cache', getAllRequest.error);
                    // Still resolve, as DB is open
                    resolve();
                };
            };
        });
    }

    static async setTrustStatus(publicKeyBase64: string, status: TrustStatus): Promise<void> {
        if (!this.db) await this.init();

        // If it's already DIRECT_TRUST, don't overwrite with RECOMMENDED
        if (status === TrustStatus.RECOMMENDED && this.cache.get(publicKeyBase64) === TrustStatus.DIRECT_TRUST) {
            return;
        }

        const item: TrustItem = {
            publicKeyBase64,
            status,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put(item);

            request.onsuccess = () => {
                this.cache.set(publicKeyBase64, status);
                console.log(`[TrustStore] Set status ${status} for ${publicKeyBase64.slice(0, 8)}...`);
                resolve();
            };

            request.onerror = () => {
                console.error('[TrustStore] Save failed', request.error);
                reject(request.error);
            };
        });
    }

    static async removeTrustStatus(publicKeyBase64: string): Promise<void> {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.delete(publicKeyBase64);

            request.onsuccess = () => {
                this.cache.delete(publicKeyBase64);
                console.log(`[TrustStore] Removed status for ${publicKeyBase64.slice(0, 8)}...`);
                resolve();
            };

            request.onerror = () => {
                console.error('[TrustStore] Delete failed', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Synchronous lookup using the memory cache.
     * Use this in UI rendering loops.
     */
    static getTrustStatusSync(publicKeyBase64: string): TrustStatus | undefined {
        return this.cache.get(publicKeyBase64);
    }

    /**
     * Get all public keys that have a specific trust status.
     * Useful for sending the list over DataChannel.
     */
    static getKeysByStatusSync(status: TrustStatus): string[] {
        const keys: string[] = [];
        for (const [key, val] of this.cache.entries()) {
            if (val === status) {
                keys.push(key);
            }
        }
        return keys;
    }
}