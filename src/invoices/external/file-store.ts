/** Browser-only prototype storage. File bytes never enter Invoice JSON. */
const DATABASE = "comets-creator-invoice-files-v1";
const STORE = "files";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === "undefined") {
    reject(new Error("当前浏览器不支持本地文件存储，请使用支持 IndexedDB 的浏览器。"));
    return;
  }
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("无法打开本地文件存储"));
});

const operate = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let value: T;
      request.onsuccess = () => { value = request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error || new Error("文件存储失败"));
      transaction.onabort = () => reject(transaction.error || new Error("文件存储已中止"));
    });
  } finally {
    database.close();
  }
};

export const saveInvoiceFile = (id: string, blob: Blob) => operate("readwrite", (store) => store.put(blob, id));
export const readInvoiceFile = (id: string): Promise<Blob | undefined> => operate("readonly", (store) => store.get(id));
export const removeInvoiceFile = (id: string) => operate("readwrite", (store) => store.delete(id));

export const dataUrlToBlob = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("旧版 Invoice 文件无法读取");
  return response.blob();
};

export const fileStorageMessage = () => "Invoice 文件未能保存在此浏览器，请检查可用存储空间后重试；本次上传未提交。";
