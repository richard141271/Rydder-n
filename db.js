const DB_NAME = "rydderen-db";
const DB_VERSION = 2;
const DEFAULT_PROJECT_ID = "default-project";
const STORE_ITEMS = "items";
const STORE_PROJECTS = "projects";
const STORE_COSTS = "projectCosts";
const STORE_SETTINGS = "settings";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeItem(item) {
  return {
    value: null,
    comment: "",
    condition: "",
    note: "",
    imageHash: "",
    projectId: DEFAULT_PROJECT_ID,
    ...item,
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const itemsStore = db.objectStoreNames.contains(STORE_ITEMS)
        ? request.transaction.objectStore(STORE_ITEMS)
        : db.createObjectStore(STORE_ITEMS, { keyPath: "id" });

      if (!itemsStore.indexNames.contains("action")) {
        itemsStore.createIndex("action", "action", { unique: false });
      }
      if (!itemsStore.indexNames.contains("createdAt")) {
        itemsStore.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!itemsStore.indexNames.contains("projectId")) {
        itemsStore.createIndex("projectId", "projectId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_COSTS)) {
        const store = db.createObjectStore(STORE_COSTS, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }

      itemsStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          return;
        }

        cursor.update(normalizeItem(cursor.value));
        cursor.continue();
      };
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(storeNames, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const result = work(transaction);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export function getDefaultProjectId() {
  return DEFAULT_PROJECT_ID;
}

function deleteByIndexValue(store, indexName, value) {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const request = index.openCursor(IDBKeyRange.only(value));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(true);
        return;
      }

      cursor.delete();
      cursor.continue();
    };

    request.onerror = () => reject(request.error);
  });
}

export function saveItem(item) {
  return runTransaction([STORE_ITEMS], "readwrite", (transaction) =>
    transaction.objectStore(STORE_ITEMS).put(normalizeItem(item)),
  );
}

export function getAllItems() {
  return runTransaction([STORE_ITEMS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_ITEMS).getAll()),
  ).then((items) => [...(items || [])].map(normalizeItem).sort((a, b) => b.createdAt - a.createdAt));
}

export function getItem(itemId) {
  return runTransaction([STORE_ITEMS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_ITEMS).get(itemId)),
  ).then((item) => (item ? normalizeItem(item) : null));
}

export function saveProject(project) {
  return runTransaction([STORE_PROJECTS], "readwrite", (transaction) =>
    transaction.objectStore(STORE_PROJECTS).put(project),
  );
}

export function deleteProject(projectId) {
  return runTransaction([STORE_PROJECTS], "readwrite", (transaction) =>
    transaction.objectStore(STORE_PROJECTS).delete(projectId),
  );
}

export function deleteProjectAndData(projectId) {
  return runTransaction([STORE_ITEMS, STORE_COSTS, STORE_PROJECTS], "readwrite", (transaction) => {
    const itemsStore = transaction.objectStore(STORE_ITEMS);
    const costsStore = transaction.objectStore(STORE_COSTS);
    const projectsStore = transaction.objectStore(STORE_PROJECTS);

    projectsStore.delete(projectId);

    return Promise.all([
      deleteByIndexValue(itemsStore, "projectId", projectId),
      deleteByIndexValue(costsStore, "projectId", projectId),
    ]).then(() => true);
  });
}

export function getProjects() {
  return runTransaction([STORE_PROJECTS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_PROJECTS).getAll()),
  ).then((projects) => [...(projects || [])].sort((a, b) => a.name.localeCompare(b.name, "nb")));
}

export function saveProjectCost(cost) {
  return runTransaction([STORE_COSTS], "readwrite", (transaction) =>
    transaction.objectStore(STORE_COSTS).put(cost),
  );
}

export function getProjectCosts() {
  return runTransaction([STORE_COSTS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_COSTS).getAll()),
  ).then((costs) => [...(costs || [])].sort((a, b) => b.createdAt - a.createdAt));
}

export function saveSetting(key, value) {
  return runTransaction([STORE_SETTINGS], "readwrite", (transaction) =>
    transaction.objectStore(STORE_SETTINGS).put({ key, value }),
  );
}

export function getSetting(key) {
  return runTransaction([STORE_SETTINGS], "readonly", (transaction) =>
    requestToPromise(transaction.objectStore(STORE_SETTINGS).get(key)),
  ).then((setting) => setting?.value ?? null);
}

export function clearAllData() {
  return runTransaction(
    [STORE_ITEMS, STORE_PROJECTS, STORE_COSTS, STORE_SETTINGS],
    "readwrite",
    (transaction) => {
      transaction.objectStore(STORE_ITEMS).clear();
      transaction.objectStore(STORE_PROJECTS).clear();
      transaction.objectStore(STORE_COSTS).clear();
      transaction.objectStore(STORE_SETTINGS).clear();
      return true;
    },
  );
}
