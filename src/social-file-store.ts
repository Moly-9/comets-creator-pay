/** Browser-only demo screenshot bytes. Profile JSON contains references, never image content. */
const DATABASE = "comets-creator-social-files-v1";
const STORE = "screenshots";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("IndexedDB unavailable"));
    return;
  }
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Unable to open screenshot storage"));
});

const operate = async (mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest) => {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Screenshot storage failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Screenshot storage aborted"));
    });
  } finally {
    database.close();
  }
};

export const saveSocialScreenshot = (id: string, file: File) => operate("readwrite", (store) => store.put(file, id));
export const removeSocialScreenshot = (id: string) => operate("readwrite", (store) => store.delete(id));
