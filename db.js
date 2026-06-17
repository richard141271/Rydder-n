const DB_NAME = "rydderen-db";
const DB_VERSION = 1;
const STORE_NAME = "items";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("action", "action", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = work(store);

        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function saveItem(item) {
  return runTransaction("readwrite", (store) => store.put(item));
}

export function getAllItems() {
  return runTransaction("readonly", (store) => store.getAll()).then((items) =>
    [...(items || [])].sort((a, b) => b.createdAt - a.createdAt),
  );
}

export function clearItems() {
  return runTransaction("readwrite", (store) => store.clear());
}
