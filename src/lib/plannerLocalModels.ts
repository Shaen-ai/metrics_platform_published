const DB_NAME = "mebel-planner-module-models";
const DB_VERSION = 1;
const STORE = "glb";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function putPlannerModuleGlb(moduleId: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(STORE).put(data, moduleId);
  });
}

export async function getPlannerModuleGlb(moduleId: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE).get(moduleId);
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
  });
}

export async function deletePlannerModuleGlb(moduleId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.objectStore(STORE).delete(moduleId);
  });
}
