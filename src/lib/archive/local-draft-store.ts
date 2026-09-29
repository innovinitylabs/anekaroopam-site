/**
 * Browser-local accession draft persistence (IndexedDB).
 * No GitHub writes. Large File blobs stay in IDB, not localStorage.
 */

import {
  AccessionDraftSchema,
  ARCHIVE_VERSION,
  createDefaultDraftArtwork,
  emptyProvenance,
  type AccessionDraft,
} from "./schema";

const DB_NAME = "anek-accession-drafts";
const DB_VERSION = 1;
const STORE = "drafts";
const META_KEY_PREFIX = "anek-local-draft:";

export interface LocalDraftRecord {
  schemaVersion: 1;
  localId: string;
  draftId: string;
  accessionId: string;
  slug: string;
  step: string;
  artworkJson: string;
  provenanceJson: string;
  /** Intended visibility after commit: generated | published | hidden */
  intendedStatus: "generated" | "published" | "hidden";
  isRevision: boolean;
  existingSlug: string | null;
  sourceFileName: string | null;
  sourceMimeType: string | null;
  sourceByteSize: number | null;
  updatedAt: string;
  /** Original source bytes when present */
  sourceBlob?: Blob;
  /** Prepared master bytes when present (optional resume) */
  preparedBlob?: Blob;
  preparedWidth?: number;
  preparedHeight?: number;
  preparedAt?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function newLocalDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `local-${crypto.randomUUID()}`;
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveLocalDraft(record: LocalDraftRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).put(record));
    try {
      localStorage.setItem(
        `${META_KEY_PREFIX}${record.localId}`,
        JSON.stringify({
          localId: record.localId,
          draftId: record.draftId,
          slug: record.slug,
          updatedAt: record.updatedAt,
          step: record.step,
        }),
      );
    } catch {
      /* quota — IDB is primary */
    }
  } finally {
    db.close();
  }
}

export async function loadLocalDraft(
  localId: string,
): Promise<LocalDraftRecord | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await idbReq(tx.objectStore(STORE).get(localId));
    return (row as LocalDraftRecord | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteLocalDraft(localId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbReq(tx.objectStore(STORE).delete(localId));
    localStorage.removeItem(`${META_KEY_PREFIX}${localId}`);
  } finally {
    db.close();
  }
}

/** Provisional server-shaped IDs for a brand-new local draft (no GitHub). */
export function provisionalAccessionIds(title: string): {
  draftId: string;
  accessionId: string;
  slug: string;
} {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 9000) + 1000).padStart(4, "0");
  const draftId = `draft-${year}-${seq}`;
  const accessionId = `AR-${year}-${seq}`;
  const date = new Date().toISOString().slice(0, 10);
  const slugBase = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const slug = `${date}-${slugBase || "untitled"}-${seq}`;
  return { draftId, accessionId, slug };
}

/** Build a full AccessionDraft that lives only in the browser until Commit. */
export function createBrowserLocalDraft(title: string): AccessionDraft {
  const ids = provisionalAccessionIds(title);
  const now = new Date().toISOString();
  const artwork = createDefaultDraftArtwork(title, ids.accessionId);
  artwork.id = ids.draftId;
  artwork.metadata.accessionId = ids.accessionId;
  return AccessionDraftSchema.parse({
    version: ARCHIVE_VERSION,
    draftId: ids.draftId,
    accessionId: ids.accessionId,
    status: "draft",
    slug: ids.slug,
    slugLocked: false,
    slugHistory: [],
    source: { kind: "migration-required" },
    processing: {},
    artwork,
    provenance: emptyProvenance(),
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    createdAt: now,
    updatedAt: now,
  });
}
