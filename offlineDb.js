const DB_NAME = "rydderen-offline";
const DB_VERSION = 1;
const STORE_SETTINGS = "settings";
const STORE_QUEUE = "queue";
const STORE_CACHE = "cache";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(storeNames, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const resultPromise = work(transaction);
        transaction.oncomplete = () => resolve(resultPromise);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export async function getSetting(key) {
  const resultPromise = await runTransaction([STORE_SETTINGS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_SETTINGS).get(key)),
  );
  const record = await resultPromise;
  return record?.value ?? null;
}

export async function setSetting(key, value) {
  const resultPromise = await runTransaction([STORE_SETTINGS], "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_SETTINGS).put({ key, value })),
  );
  await resultPromise;
}

export async function deleteSetting(key) {
  const resultPromise = await runTransaction([STORE_SETTINGS], "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_SETTINGS).delete(key)),
  );
  await resultPromise;
}

export async function setCache(key, value) {
  const resultPromise = await runTransaction([STORE_CACHE], "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_CACHE).put({ key, value })),
  );
  await resultPromise;
}

export async function getCache(key) {
  const resultPromise = await runTransaction([STORE_CACHE], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_CACHE).get(key)),
  );
  const record = await resultPromise;
  return record?.value ?? null;
}

export async function enqueueMutation(mutation) {
  const queued = { ...mutation, id: mutation.id || crypto.randomUUID() };
  const resultPromise = await runTransaction([STORE_QUEUE], "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_QUEUE).put(queued)),
  );
  await resultPromise;
  return queued.id;
}

export async function getQueuedMutations() {
  const resultPromise = await runTransaction([STORE_QUEUE], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_QUEUE).getAll()),
  );
  const items = (await resultPromise) || [];
  return items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function deleteQueuedMutation(id) {
  const resultPromise = await runTransaction([STORE_QUEUE], "readwrite", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_QUEUE).delete(id)),
  );
  await resultPromise;
}
