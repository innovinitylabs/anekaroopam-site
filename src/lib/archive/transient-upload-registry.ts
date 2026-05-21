/**
 * In-memory file registry for archival ingestion (browser session only).
 * Never persisted to sessionStorage/localStorage — files and object URLs live here.
 */

export interface TransientUploadEntry {
  draftId: string;
  file: File;
  objectUrl: string;
  fileName: string;
  mimeType: string;
  registeredAt: string;
}

const registry = new Map<string, TransientUploadEntry>();

export type TransientUploadRegistryBridge = {
  get: (draftId: string) => TransientUploadEntry | null;
  getObjectUrl: (draftId: string) => string | null;
  getFile: (draftId: string) => File | null;
};

declare global {
  interface Window {
    anekaroopamUploadRegistry?: TransientUploadRegistryBridge;
  }
}

function entryFromFile(draftId: string, file: File): TransientUploadEntry {
  return {
    draftId,
    file,
    objectUrl: URL.createObjectURL(file),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    registeredAt: new Date().toISOString(),
  };
}

export function registerTransientUpload(
  draftId: string,
  file: File,
): TransientUploadEntry {
  revokeTransientUpload(draftId);
  const entry = entryFromFile(draftId, file);
  registry.set(draftId, entry);
  return entry;
}

export function replaceTransientUpload(
  draftId: string,
  file: File,
): TransientUploadEntry {
  return registerTransientUpload(draftId, file);
}

export function getTransientUpload(
  draftId: string,
): TransientUploadEntry | null {
  return registry.get(draftId) ?? null;
}

export function getTransientObjectUrl(draftId: string): string | null {
  return registry.get(draftId)?.objectUrl ?? null;
}

export function getTransientFile(draftId: string): File | null {
  return registry.get(draftId)?.file ?? null;
}

export function revokeTransientUpload(draftId: string): void {
  const existing = registry.get(draftId);
  if (existing) {
    URL.revokeObjectURL(existing.objectUrl);
    registry.delete(draftId);
  }
}

export function installUploadRegistryBridge(): void {
  if (typeof window === "undefined") return;
  window.anekaroopamUploadRegistry = {
    get: getTransientUpload,
    getObjectUrl: getTransientObjectUrl,
    getFile: getTransientFile,
  };
}

export function resolveUploadFromAnyTab(
  draftId: string,
): TransientUploadEntry | null {
  const local = getTransientUpload(draftId);
  if (local) return local;

  if (typeof window === "undefined") return null;
  const opener = window.opener as Window | null;
  if (!opener?.anekaroopamUploadRegistry) return null;
  return opener.anekaroopamUploadRegistry.get(draftId);
}

export function resolveObjectUrlFromAnyTab(draftId: string): string | null {
  const entry = resolveUploadFromAnyTab(draftId);
  return entry?.objectUrl ?? null;
}

export function resolveFileFromAnyTab(draftId: string): File | null {
  const entry = resolveUploadFromAnyTab(draftId);
  return entry?.file ?? null;
}
