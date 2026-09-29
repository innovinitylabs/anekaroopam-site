import type {
  PersistedBlob,
  PersistedBlobKind,
  PersistedWorkspaceRecord,
} from "./types";

export const PATTARAI_DB_NAME = "anekaroopam-pattarai" as const;
export const PATTARAI_DB_VERSION = 1 as const;
export const WORKSPACE_STORE = "workspace" as const;
export const BLOB_STORE = "blobs" as const;
export const CURRENT_RECORD_KEY = "current" as const;

/**
 * Minimal storage contract for the single Pattarai workspace.
 * Records are read back as `unknown` so callers must validate shape.
 */
export interface WorkspacePersistenceBackend {
  getRecord(): Promise<unknown>;
  putRecord(record: PersistedWorkspaceRecord): Promise<void>;
  getBlob(kind: PersistedBlobKind): Promise<unknown>;
  putBlob(entry: PersistedBlob): Promise<void>;
  deleteBlob(kind: PersistedBlobKind): Promise<void>;
  clearAll(): Promise<void>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Aborted", "AbortError"));
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(PATTARAI_DB_NAME, PATTARAI_DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_STORE)) {
        db.createObjectStore(WORKSPACE_STORE);
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new DOMException("IndexedDB open blocked", "InvalidStateError"));
  });
}

/**
 * IndexedDB-backed persistence. Returns null when IndexedDB is not available
 * (SSR, some private modes). Open failures surface on first use.
 */
export function createIndexedDbBackend(
  factory: IDBFactory | undefined = typeof indexedDB === "undefined"
    ? undefined
    : indexedDB,
): WorkspacePersistenceBackend | null {
  if (!factory) return null;

  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = openDatabase(factory).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  };

  async function read(store: string, key: string): Promise<unknown> {
    const database = await db();
    const tx = database.transaction(store, "readonly");
    const result = await requestToPromise(tx.objectStore(store).get(key));
    return result ?? null;
  }

  async function write(
    store: string,
    op: (s: IDBObjectStore) => void,
  ): Promise<void> {
    const database = await db();
    const tx = database.transaction(store, "readwrite");
    op(tx.objectStore(store));
    await transactionDone(tx);
  }

  return {
    getRecord: () => read(WORKSPACE_STORE, CURRENT_RECORD_KEY),
    putRecord: (record) =>
      write(WORKSPACE_STORE, (s) => s.put(record, CURRENT_RECORD_KEY)),
    getBlob: (kind) => read(BLOB_STORE, kind),
    putBlob: (entry) => write(BLOB_STORE, (s) => s.put(entry, entry.kind)),
    deleteBlob: (kind) => write(BLOB_STORE, (s) => s.delete(kind)),
    clearAll: async () => {
      const database = await db();
      const tx = database.transaction([WORKSPACE_STORE, BLOB_STORE], "readwrite");
      tx.objectStore(WORKSPACE_STORE).clear();
      tx.objectStore(BLOB_STORE).clear();
      await transactionDone(tx);
    },
  };
}

/** In-memory backend with the same contract (tests, and unavailable-IDB fallback). */
export function createMemoryBackend(): WorkspacePersistenceBackend & {
  readonly records: Map<string, unknown>;
  readonly blobs: Map<PersistedBlobKind, unknown>;
} {
  const records = new Map<string, unknown>();
  const blobs = new Map<PersistedBlobKind, unknown>();
  return {
    records,
    blobs,
    getRecord: async () => records.get(CURRENT_RECORD_KEY) ?? null,
    putRecord: async (record) => {
      records.set(CURRENT_RECORD_KEY, structuredClone(record));
    },
    getBlob: async (kind) => blobs.get(kind) ?? null,
    putBlob: async (entry) => {
      blobs.set(entry.kind, { ...entry });
    },
    deleteBlob: async (kind) => {
      blobs.delete(kind);
    },
    clearAll: async () => {
      records.clear();
      blobs.clear();
    },
  };
}
