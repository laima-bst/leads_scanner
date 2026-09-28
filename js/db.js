// IndexedDB storage for leads (and, later, card photos) on this phone.

const DB_NAME = 'lead-scanner';
const DB_VERSION = 1;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('leads')) db.createObjectStore('leads', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'leadId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// Runs fn(stores) in one transaction and resolves with the last request's result
// once the transaction has committed.
async function run(storeNames, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = [].concat(storeNames).map((n) => t.objectStore(n));
    const req = fn(...stores);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

export const allLeads = () => run('leads', 'readonly', (s) => s.getAll());
export const getLead = (id) => run('leads', 'readonly', (s) => s.get(id));
export const putLead = (lead) => run('leads', 'readwrite', (s) => s.put(lead));

export const putLeads = (leads) =>
  run('leads', 'readwrite', (s) => { leads.forEach((l) => s.put(l)); });

export const deleteLeads = (ids) =>
  run(['leads', 'photos'], 'readwrite', (leads, photos) => {
    ids.forEach((id) => { leads.delete(id); photos.delete(id); });
  });

// Asks the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch { /* not supported */ }
  return false;
}

export async function isPersisted() {
  try {
    return !!(navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted()));
  } catch {
    return false;
  }
}
