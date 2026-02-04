export interface VaultItem {
    hash: string;
    blob: Blob;
    name: string;
    size: number;
    mime: string;
    tributeTag?: string;
    receipt?: any;
    timestamp: number;
}

export class Vault {
    private static DB_NAME = 'moli_vault_v1';
    private static STORE_NAME = 'pinned_images';
    private static db: IDBDatabase | null = null;

    static async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'hash' });
                }
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                console.log('[Vault] Local Vault initialized.');
                resolve();
            };
        });
    }

    static async save(item: VaultItem): Promise<void> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.put(item); // keyPath is 'hash' inside item

            request.onsuccess = () => {
                console.log(`[Vault] Saved item: ${item.hash.slice(0, 8)}... (${item.name})`);
                resolve();
            };
            request.onerror = () => {
                console.error('[Vault] Save failed', request.error);
                reject(request.error);
            };
        });
    }

    static async remove(hash: string): Promise<void> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.delete(hash);

            request.onsuccess = () => {
                console.log(`[Vault] Removed item: ${hash.slice(0, 8)}...`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    static async loadAll(): Promise<VaultItem[]> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result as VaultItem[];
                console.log(`[Vault] Loaded ${items.length} items from persistence.`);
                resolve(items);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Helper: Update ONLY the receipt if the item exists (Avoid rewriting heavy blob)
    static async updateReceipt(hash: string, receipt: any): Promise<void> {
        if (!this.db) await this.init();
        // Since we need to update one field, we usually fetch -> update -> put.
        // Or structured update. Since it's keyPath object store, we fetch-modify-put.
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.STORE_NAME, 'readwrite');
            const store = tx.objectStore(this.STORE_NAME);

            const getReq = store.get(hash);
            getReq.onsuccess = () => {
                const data = getReq.result as VaultItem;
                if (!data) {
                    console.warn(`[Vault] Cannot update receipt, item not found: ${hash.slice(0, 8)}`);
                    resolve(); // Not an error, maybe user unpinned it.
                    return;
                }
                data.receipt = receipt;
                const putReq = store.put(data);
                putReq.onsuccess = () => {
                    console.log(`[Vault] Updated receipt for: ${hash.slice(0, 8)}`);
                    resolve();
                };
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }
    static close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[Vault] Database connection closed.');
        }
    }
}
