/** Shared types and constants for the archive D1 API. */

export const ARTWORK_STATUSES = [
  "draft",
  "uploading",
  "ready",
  "published",
  "hidden",
  "withdrawn",
] as const;

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

export const ASSET_ROLES = [
  "original",
  "prepared",
  "artwork",
  "preview",
  "preview_webp",
  "social",
  "thumb",
] as const;

export type AssetRole = (typeof ASSET_ROLES)[number];

export const DEFAULT_REQUIRED_ROLES: AssetRole[] = [
  "original",
  "artwork",
  "preview",
  "thumb",
];

export type Env = {
  DB: D1Database;
  WORKER_ADMIN_TOKEN: string;
  REQUIRED_ROLES?: string;
  R2_PUBLIC_BASE_URL?: string;
  R2_KEY_PREFIX?: string;
};

export type ArtworkRow = {
  id: string;
  accession_id: string;
  draft_id: string;
  slug: string;
  status: string;
  working_revision: number;
  published_revision: number | null;
  title: string;
  year: number | null;
  process: string | null;
  thumb_object_key: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  hidden_at: string | null;
  withdrawn_at: string | null;
  created_by: string | null;
};

export type RevisionRow = {
  id: string;
  artwork_id: string;
  revision: number;
  kind: string;
  metadata_json: string;
  perception_json: string;
  export_json: string;
  provenance_json: string;
  created_at: string;
  created_by: string | null;
  note: string | null;
};

export function formatAccessionId(year: number, seq: number): string {
  const width = seq > 9999 ? String(seq).length : 4;
  return `AR-${year}-${String(seq).padStart(width, "0")}`;
}

export function parseRequiredRoles(raw: string | undefined): AssetRole[] {
  if (!raw?.trim()) return [...DEFAULT_REQUIRED_ROLES];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as AssetRole[];
}

export function publicUrlForKey(
  objectKey: string,
  publicBaseUrl: string,
): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  const key = objectKey.replace(/^\//, "");
  return `${base}/${key}`;
}

export function emptyPerceptionJson(): string {
  return JSON.stringify({
    states: [],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  });
}

export function emptyExportJson(): string {
  return JSON.stringify({
    standaloneHtml: "perception.html",
    includeWebpFallback: true,
    preset: "archival",
  });
}

export function emptyProvenanceJson(): string {
  return JSON.stringify({ mint: [], auction: [], marketplace: [] });
}

export function metadataFromTitle(title: string): string {
  return JSON.stringify({ title });
}

export function projectionsFromMetadata(metadataJson: string): {
  title: string;
  year: number | null;
  process: string | null;
} {
  try {
    const meta = JSON.parse(metadataJson) as {
      title?: string;
      year?: number;
      process?: string;
    };
    return {
      title: typeof meta.title === "string" && meta.title ? meta.title : "Untitled",
      year: typeof meta.year === "number" ? meta.year : null,
      process: typeof meta.process === "string" ? meta.process : null,
    };
  } catch {
    return { title: "Untitled", year: null, process: null };
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "untitled";
}
