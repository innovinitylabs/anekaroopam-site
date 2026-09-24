import {
  getArchiveWorkerToken,
  getArchiveWorkerUrl,
  isArchiveWorkerConfigured,
} from "./worker-config";

export class ArchiveWorkerError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type WorkerArtwork = {
  id: string;
  accessionId: string;
  draftId: string;
  slug: string;
  status: string;
  workingRevision: number;
  publishedRevision: number | null;
  title: string;
  year: number | null;
  process: string | null;
  thumbObjectKey: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  hiddenAt: string | null;
  withdrawnAt: string | null;
  createdBy: string | null;
};

export type WorkerRevisionDetail = {
  revision: number;
  kind: string;
  metadata: Record<string, unknown>;
  perception?: Record<string, unknown>;
  export?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
};

export type WorkerArtworkDetail = {
  artwork: WorkerArtwork;
  workingRevision: WorkerRevisionDetail | null;
  publishedRevision: { revision: number; kind: string; metadata: Record<string, unknown> } | null;
  assets: Array<{
    role: string;
    object_key: string;
    mime_type: string;
    byte_size: number;
    verified_at: string | null;
    width: number | null;
    height: number | null;
  }>;
  readiness: { ok: boolean; missing: string[] };
};

export type WorkerPublicArtwork = {
  id: string;
  accessionId: string;
  slug: string;
  title: string;
  year: number | null;
  process: string | null;
  publishedRevision: number | null;
  thumbUrl: string | null;
  publishedAt: string | null;
};

export type WorkerPublicDetail = {
  artwork: {
    id: string;
    accessionId: string;
    slug: string;
    title: string;
    year: number | null;
    process: string | null;
    publishedRevision: number | null;
    publishedAt: string | null;
    metadata: Record<string, unknown>;
    perception: Record<string, unknown>;
    export: Record<string, unknown>;
    provenance: Record<string, unknown>;
    assets: Record<string, string>;
    thumbUrl: string | null;
  };
};

type FetchOpts = {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  admin?: boolean;
};

export async function archiveWorkerFetch<T>(
  path: string,
  opts: FetchOpts = {},
): Promise<T> {
  if (!isArchiveWorkerConfigured()) {
    throw new ArchiveWorkerError(503, "Archive Worker is not configured");
  }
  const base = getArchiveWorkerUrl()!;
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (opts.admin !== false) {
    headers.authorization = `Bearer ${getArchiveWorkerToken()}`;
  }
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (opts.idempotencyKey) {
    headers["idempotency-key"] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Archive Worker error ${res.status}`;
    throw new ArchiveWorkerError(res.status, message, data);
  }

  return data as T;
}

export async function workerCreateArtwork(input: {
  draftId: string;
  title?: string;
  slug?: string;
  createdBy?: string;
  idempotencyKey: string;
}): Promise<{ artwork: WorkerArtwork; created: boolean }> {
  return archiveWorkerFetch("/admin/artworks", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      draftId: input.draftId,
      title: input.title,
      slug: input.slug,
      createdBy: input.createdBy,
    },
  });
}

export async function workerListArtworks(opts?: {
  status?: string;
  limit?: number;
}): Promise<{ artworks: WorkerArtwork[] }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const q = params.toString();
  return archiveWorkerFetch(`/admin/artworks${q ? `?${q}` : ""}`);
}

export async function workerGetArtwork(
  id: string,
): Promise<WorkerArtworkDetail> {
  return archiveWorkerFetch(`/admin/artworks/${encodeURIComponent(id)}`);
}

export async function workerPatchArtwork(
  id: string,
  patch: {
    metadata?: unknown;
    perception?: unknown;
    export?: unknown;
    provenance?: unknown;
    slug?: string;
  },
): Promise<{ artwork: WorkerArtwork; workingRevision: WorkerRevisionDetail }> {
  return archiveWorkerFetch(`/admin/artworks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function workerRegisterAsset(
  artworkId: string,
  asset: {
    role: string;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    width?: number;
    height?: number;
    sha256?: string;
    verified?: boolean;
  },
): Promise<{ ok: boolean; assetId: string; revision: number }> {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/assets`,
    { method: "POST", body: asset },
  );
}

export async function workerMarkReady(artworkId: string) {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/ready`,
    { method: "POST", body: {} },
  );
}

export async function workerFreezeRevision(
  artworkId: string,
  note?: string,
) {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/revisions/freeze`,
    { method: "POST", body: note ? { note } : {} },
  );
}

export async function workerPublish(
  artworkId: string,
  revision?: number,
): Promise<{ artwork: WorkerArtwork }> {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/publish`,
    {
      method: "POST",
      body: revision != null ? { revision } : {},
    },
  );
}

export async function workerUnpublish(artworkId: string) {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/unpublish`,
    { method: "POST", body: {} },
  );
}

export async function workerSetVisibility(
  artworkId: string,
  status: "hidden" | "withdrawn" | "published" | "ready",
) {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/visibility`,
    { method: "POST", body: { status } },
  );
}

export async function workerListEvents(artworkId: string) {
  return archiveWorkerFetch<{
    events: Array<{
      id: string;
      event_type: string;
      payload_json: string | null;
      created_at: string;
    }>;
  }>(`/admin/artworks/${encodeURIComponent(artworkId)}/events`);
}

export async function workerAppendEvent(
  artworkId: string,
  eventType: string,
  payload?: unknown,
) {
  return archiveWorkerFetch(
    `/admin/artworks/${encodeURIComponent(artworkId)}/events`,
    { method: "POST", body: { eventType, payload } },
  );
}

export async function workerListPublicArtworks(): Promise<{
  artworks: WorkerPublicArtwork[];
}> {
  return archiveWorkerFetch("/public/artworks", { admin: false });
}

export async function workerGetPublicArtwork(
  slug: string,
): Promise<WorkerPublicDetail> {
  return archiveWorkerFetch(`/public/artworks/${encodeURIComponent(slug)}`, {
    admin: false,
  });
}

/** Map browser/R2 role names to Worker asset roles. */
export function toWorkerAssetRole(role: string): string {
  if (role === "previewWebp") return "preview_webp";
  return role;
}

export function roleFromObjectKey(objectKey: string): string | null {
  if (objectKey.includes("/original/")) return "original";
  if (objectKey.includes("/prepared/")) return "prepared";
  if (objectKey.endsWith("/thumb.jpg") || objectKey.includes("/thumb.")) {
    return "thumb";
  }
  if (objectKey.includes("preview.webp")) return "preview_webp";
  if (objectKey.includes("preview.avif") || objectKey.includes("preview.")) {
    return "preview";
  }
  if (objectKey.includes("artwork.")) return "artwork";
  if (objectKey.includes("social.")) return "social";
  return null;
}
