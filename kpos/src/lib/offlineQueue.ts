// IndexedDB-backed offline sale queue for KPOS POS
// Queues failed sale payloads and retries them when the network comes back.

const DB_NAME = 'kpos-offline';
const DB_VERSION = 1;
const STORE = 'pending_sales';

export interface PendingSale {
    id?: number;
    payload: Record<string, unknown>;
    enqueuedAt: string;
    retries: number;
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function enqueueSale(payload: Record<string, unknown>): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const item: PendingSale = { payload, enqueuedAt: new Date().toISOString(), retries: 0 };
        const req = tx.objectStore(STORE).add(item);
        req.onsuccess = () => resolve(req.result as number);
        req.onerror = () => reject(req.error);
    });
}

export async function getPendingSales(): Promise<PendingSale[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result as PendingSale[]);
        req.onerror = () => reject(req.error);
    });
}

export async function removePendingSale(id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

export async function incrementRetry(id: number): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const item = getReq.result as PendingSale;
            if (!item) { resolve(); return; }
            item.retries += 1;
            const putReq = store.put(item);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

export async function pendingSaleCount(): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
