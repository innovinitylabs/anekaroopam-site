import type { PerceptionArtwork } from "@/lib/perception/types";
import type { ProvenanceRecord } from "@/lib/archive/schema";
import { stripArtworkForStorage, type StoredPerceptionArtwork } from "./session-artwork";

const SESSION_KEY = "anekaroopam-prepare-session";
const INGEST_SESSION_KEY = "anekaroopam-ingest-draft";

/** Lightweight prepare bridge — image file lives in transient upload registry. */
export interface PrepareSessionStored {
  /** Registry key for source file (ingest draft or artwork id). */
  uploadDraftId: string;
  artwork: StoredPerceptionArtwork;
  customBackground?: string;
  sourceFileName?: string;
  savedAt: string;
  /** @deprecated Use uploadDraftId — kept for migration reads */
  ingestDraftId?: string;
}

export function savePrepareSession(input: {
  artwork: PerceptionArtwork;
  customBackground?: string;
  uploadDraftId: string;
  sourceFileName?: string;
  ingestDraftId?: string;
}): void {
  if (typeof window === "undefined") return;
  const stored: PrepareSessionStored = {
    uploadDraftId: input.uploadDraftId,
    artwork: stripArtworkForStorage(input.artwork),
    customBackground: input.customBackground,
    sourceFileName: input.sourceFileName,
    savedAt: new Date().toISOString(),
    ingestDraftId: input.ingestDraftId,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    console.warn("Prepare session could not be saved (quota). Metadata only.");
  }
}

export function loadPrepareSession(): PrepareSessionStored | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PrepareSessionStored & {
      artwork?: PerceptionArtwork;
    };
    const uploadDraftId =
      parsed.uploadDraftId ?? parsed.ingestDraftId ?? parsed.artwork?.id ?? "";
    return {
      ...parsed,
      uploadDraftId,
      artwork: stripArtworkForStorage(
        parsed.artwork ?? {
          id: uploadDraftId,
          metadata: { title: "" },
          imageSrc: "",
          states: [],
          background: "paper",
        },
      ),
    };
  } catch {
    return null;
  }
}

export function clearPrepareSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

export interface IngestDraftSessionStored {
  draftId: string;
  artwork: StoredPerceptionArtwork;
  customBackground?: string;
  sourceFileName?: string;
  provenance?: ProvenanceRecord;
  savedAt: string;
}

export function saveIngestDraftSession(input: {
  draftId: string;
  artwork: PerceptionArtwork;
  customBackground?: string;
  sourceFileName?: string;
  provenance?: ProvenanceRecord;
}): void {
  if (typeof window === "undefined") return;
  const stored: IngestDraftSessionStored = {
    draftId: input.draftId,
    artwork: stripArtworkForStorage(input.artwork),
    customBackground: input.customBackground,
    sourceFileName: input.sourceFileName,
    provenance: input.provenance,
    savedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(INGEST_SESSION_KEY, JSON.stringify(stored));
  } catch (err) {
    console.warn("Ingest draft session could not be saved:", err);
  }
}

export function loadIngestDraftSession(): IngestDraftSessionStored | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(INGEST_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as IngestDraftSessionStored & {
      artwork?: PerceptionArtwork;
    };
    return {
      ...parsed,
      artwork: stripArtworkForStorage(parsed.artwork),
    };
  } catch {
    return null;
  }
}

export function clearIngestDraftSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(INGEST_SESSION_KEY);
}
