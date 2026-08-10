const FILE_DB_NAME = "potatoflow-files";
const FILE_STORE_NAME = "source-files";

function openFileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) {
        request.result.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSourceFileBlob(id: string, file: File) {
  const database = await openFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readSourceFileBlob(id: string) {
  const database = await openFileDatabase();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readonly");
    const request = transaction.objectStore(FILE_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
}

export async function removeSourceFileBlob(id: string) {
  const database = await openFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function uploadSourceFileToCloud(id: string, file: File) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "文件暂时无法上传到云端。");
  }
}

export async function readSourceFileFromCloud(id: string) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  return response.ok ? response.blob() : undefined;
}

export async function removeSourceFileFromCloud(id: string) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error("云端文件暂时无法删除。");
  }
}
