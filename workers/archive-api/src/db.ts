import {
  emptyExportJson,
  emptyPerceptionJson,
  emptyProvenanceJson,
  formatAccessionId,
  metadataFromTitle,
  newId,
  normalizeSlug,
  nowIso,
  projectionsFromMetadata,
  type ArtworkRow,
  type AssetRole,
  type RevisionRow,
} from "./types";

/** Minimal statement interface shared by D1 and node:sqlite adapters. */
export type SqlBatchStatement = {
  sql: string;
  binds: unknown[];
};

export type SqlExecutor = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
    };
  };
  /** Optional atomic multi-statement execution (D1 batch / sqlite transaction). */
  batch?(statements: SqlBatchStatement[]): Promise<void>;
};

function slugFromTitle(title: string, accessionId: string): string {
  const date = nowIso().slice(0, 10);
  const base = normalizeSlug(title);
  return `${date}-${base || normalizeSlug(accessionId)}`.slice(0, 72);
}

export async function allocateAccessionId(
  db: SqlExecutor,
  year: number,
): Promise<string> {
  await db
    .prepare(
      `INSERT INTO accession_counters (year, next_seq) VALUES (?, 1)
       ON CONFLICT(year) DO UPDATE SET next_seq = next_seq + 1`,
    )
    .bind(year)
    .run();

  const row = await db
    .prepare(`SELECT next_seq AS next_seq FROM accession_counters WHERE year = ?`)
    .bind(year)
    .first<{ next_seq: number }>();

  if (!row?.next_seq) {
    throw new Error("Failed to allocate accession sequence");
  }
  return formatAccessionId(year, row.next_seq);
}

export async function findByIdempotencyKey(
  db: SqlExecutor,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT artwork_id FROM idempotency_keys WHERE key = ?`)
    .bind(key)
    .first<{ artwork_id: string }>();
  return row?.artwork_id ?? null;
}

export async function getArtwork(
  db: SqlExecutor,
  id: string,
): Promise<ArtworkRow | null> {
  return db
    .prepare(`SELECT * FROM artworks WHERE id = ?`)
    .bind(id)
    .first<ArtworkRow>();
}

export async function getArtworkBySlug(
  db: SqlExecutor,
  slug: string,
): Promise<ArtworkRow | null> {
  return db
    .prepare(`SELECT * FROM artworks WHERE slug = ?`)
    .bind(slug)
    .first<ArtworkRow>();
}

export async function getArtworkByDraftId(
  db: SqlExecutor,
  draftId: string,
): Promise<ArtworkRow | null> {
  return db
    .prepare(`SELECT * FROM artworks WHERE draft_id = ?`)
    .bind(draftId)
    .first<ArtworkRow>();
}

export async function getArtworkByAccessionId(
  db: SqlExecutor,
  accessionId: string,
): Promise<ArtworkRow | null> {
  return db
    .prepare(`SELECT * FROM artworks WHERE accession_id = ?`)
    .bind(accessionId)
    .first<ArtworkRow>();
}

export async function getWorkingRevision(
  db: SqlExecutor,
  artworkId: string,
): Promise<RevisionRow | null> {
  return db
    .prepare(
      `SELECT * FROM artwork_revisions
       WHERE artwork_id = ? AND kind = 'working'
       ORDER BY revision DESC LIMIT 1`,
    )
    .bind(artworkId)
    .first<RevisionRow>();
}

export async function getRevision(
  db: SqlExecutor,
  artworkId: string,
  revision: number,
): Promise<RevisionRow | null> {
  return db
    .prepare(
      `SELECT * FROM artwork_revisions WHERE artwork_id = ? AND revision = ?`,
    )
    .bind(artworkId, revision)
    .first<RevisionRow>();
}

export type CreateDraftInput = {
  draftId: string;
  title?: string;
  slug?: string;
  createdBy?: string;
  idempotencyKey: string;
};

export async function createDraft(
  db: SqlExecutor,
  input: CreateDraftInput,
): Promise<{ artwork: ArtworkRow; revision: RevisionRow; created: boolean }> {
  const existingId = await findByIdempotencyKey(db, input.idempotencyKey);
  if (existingId) {
    const artwork = await getArtwork(db, existingId);
    const revision = artwork
      ? await getWorkingRevision(db, artwork.id)
      : null;
    if (!artwork || !revision) {
      throw new Error("Idempotency key points to missing artwork");
    }
    return { artwork, revision, created: false };
  }

  const year = new Date().getUTCFullYear();
  const accessionId = await allocateAccessionId(db, year);
  const artworkId = newId();
  const revisionId = newId();
  const title = input.title?.trim() || "Untitled";
  const slug = input.slug?.trim()
    ? normalizeSlug(input.slug)
    : slugFromTitle(title, accessionId);
  const now = nowIso();
  const metadataJson = metadataFromTitle(title);
  const projections = projectionsFromMetadata(metadataJson);

  await db
    .prepare(
      `INSERT INTO artworks (
        id, accession_id, draft_id, slug, status, working_revision, published_revision,
        title, year, process, thumb_object_key,
        created_at, updated_at, published_at, hidden_at, withdrawn_at, created_by
      ) VALUES (?, ?, ?, ?, 'draft', 1, NULL, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?)`,
    )
    .bind(
      artworkId,
      accessionId,
      input.draftId,
      slug,
      projections.title,
      projections.year,
      projections.process,
      now,
      now,
      input.createdBy ?? null,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO artwork_revisions (
        id, artwork_id, revision, kind, metadata_json, perception_json, export_json,
        provenance_json, created_at, created_by, note
      ) VALUES (?, ?, 1, 'working', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      revisionId,
      artworkId,
      metadataJson,
      emptyPerceptionJson(),
      emptyExportJson(),
      emptyProvenanceJson(),
      now,
      input.createdBy ?? null,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO accession_events (id, artwork_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'draft_created', ?, ?)`,
    )
    .bind(
      newId(),
      artworkId,
      JSON.stringify({ accession_id: accessionId, draft_id: input.draftId }),
      now,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO idempotency_keys (key, artwork_id, created_at) VALUES (?, ?, ?)`,
    )
    .bind(input.idempotencyKey, artworkId, now)
    .run();

  const artwork = await getArtwork(db, artworkId);
  const revision = await getWorkingRevision(db, artworkId);
  if (!artwork || !revision) {
    throw new Error("Draft create failed to read back row");
  }
  return { artwork, revision, created: true };
}

export type ListArtworksSort =
  | "updated_desc"
  | "year_desc"
  | "title_asc";

export type ListArtworksOpts = {
  /** Single status or list; omit for all statuses (admin). */
  status?: string | string[];
  q?: string;
  year?: number;
  process?: string;
  sort?: ListArtworksSort;
  limit?: number;
  offset?: number;
};

export type ListArtworksResult = {
  artworks: ArtworkRow[];
  total: number;
};

function orderByClause(sort: ListArtworksSort | undefined): string {
  switch (sort) {
    case "year_desc":
      return "ORDER BY (year IS NULL), year DESC, updated_at DESC";
    case "title_asc":
      return "ORDER BY title COLLATE NOCASE ASC, updated_at DESC";
    case "updated_desc":
    default:
      return "ORDER BY updated_at DESC";
  }
}

/**
 * List artworks with optional search/filters. Filters combine with AND.
 * `q` is case-insensitive partial match on title, accession_id, and slug.
 */
export async function listArtworks(
  db: SqlExecutor,
  opts: ListArtworksOpts = {},
): Promise<ListArtworksResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where: string[] = [];
  const binds: unknown[] = [];

  if (opts.status !== undefined) {
    const statuses = Array.isArray(opts.status)
      ? opts.status.filter(Boolean)
      : [opts.status];
    if (statuses.length === 1) {
      where.push("status = ?");
      binds.push(statuses[0]);
    } else if (statuses.length > 1) {
      where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      binds.push(...statuses);
    }
  }

  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(
      `(LOWER(title) LIKE ? OR LOWER(accession_id) LIKE ? OR LOWER(slug) LIKE ?)`,
    );
    binds.push(like, like, like);
  }

  if (opts.year !== undefined && Number.isFinite(opts.year)) {
    where.push("year = ?");
    binds.push(opts.year);
  }

  if (opts.process?.trim()) {
    where.push("LOWER(process) = LOWER(?)");
    binds.push(opts.process.trim());
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = orderByClause(opts.sort);

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM artworks ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const total = Number(countRow?.total ?? 0);

  const res = await db
    .prepare(
      `SELECT * FROM artworks ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<ArtworkRow>();

  return { artworks: res.results, total };
}

export async function patchWorkingRevision(
  db: SqlExecutor,
  artworkId: string,
  patch: {
    metadata_json?: string;
    perception_json?: string;
    export_json?: string;
    provenance_json?: string;
    slug?: string;
  },
): Promise<{ artwork: ArtworkRow; revision: RevisionRow }> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");
  if (artwork.status === "withdrawn") {
    throw new HttpError(409, "Withdrawn artworks cannot be edited");
  }
  const revision = await getWorkingRevision(db, artworkId);
  if (!revision) throw new HttpError(404, "Working revision not found");

  const metadataJson = patch.metadata_json ?? revision.metadata_json;
  const perceptionJson = patch.perception_json ?? revision.perception_json;
  const exportJson = patch.export_json ?? revision.export_json;
  const provenanceJson = patch.provenance_json ?? revision.provenance_json;
  const projections = projectionsFromMetadata(metadataJson);
  const now = nowIso();
  let slug = artwork.slug;
  if (patch.slug) {
    const nextSlug = assertSlugFormat(patch.slug);
    const conflict = await getArtworkBySlug(db, nextSlug);
    if (conflict && conflict.id !== artworkId) {
      throw new HttpError(409, `Slug "${nextSlug}" is already in use`);
    }
    slug = nextSlug;
  }

  await db
    .prepare(
      `UPDATE artwork_revisions SET
        metadata_json = ?, perception_json = ?, export_json = ?, provenance_json = ?
       WHERE id = ?`,
    )
    .bind(metadataJson, perceptionJson, exportJson, provenanceJson, revision.id)
    .run();

  await db
    .prepare(
      `UPDATE artworks SET
        title = ?, year = ?, process = ?, slug = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      projections.title,
      projections.year,
      projections.process,
      slug,
      now,
      artworkId,
    )
    .run();

  const nextArtwork = await getArtwork(db, artworkId);
  const nextRevision = await getWorkingRevision(db, artworkId);
  if (!nextArtwork || !nextRevision) throw new Error("Patch read-back failed");
  return { artwork: nextArtwork, revision: nextRevision };
}

export async function appendEvent(
  db: SqlExecutor,
  artworkId: string,
  eventType: string,
  payload: unknown = null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO accession_events (id, artwork_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      artworkId,
      eventType,
      payload == null ? null : JSON.stringify(payload),
      nowIso(),
    )
    .run();
}

export async function freezeWorkingRevision(
  db: SqlExecutor,
  artworkId: string,
  note?: string,
): Promise<{ frozen: RevisionRow; working: RevisionRow }> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");
  const working = await getWorkingRevision(db, artworkId);
  if (!working) throw new HttpError(404, "Working revision not found");

  const now = nowIso();
  await db
    .prepare(
      `UPDATE artwork_revisions SET kind = 'frozen', note = COALESCE(?, note) WHERE id = ?`,
    )
    .bind(note ?? null, working.id)
    .run();

  const nextRev = working.revision + 1;
  const nextId = newId();
  await db
    .prepare(
      `INSERT INTO artwork_revisions (
        id, artwork_id, revision, kind, metadata_json, perception_json, export_json,
        provenance_json, created_at, created_by, note
      ) VALUES (?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      nextId,
      artworkId,
      nextRev,
      working.metadata_json,
      working.perception_json,
      working.export_json,
      working.provenance_json,
      now,
      working.created_by,
    )
    .run();

  // Copy asset memberships from frozen tip to new working tip (reuse object keys).
  const memberships = await db
    .prepare(
      `SELECT role, asset_id, source_revision FROM revision_assets
       WHERE artwork_id = ? AND revision = ?`,
    )
    .bind(artworkId, working.revision)
    .all<{ role: string; asset_id: string; source_revision: number | null }>();

  for (const m of memberships.results) {
    await db
      .prepare(
        `INSERT INTO revision_assets (
          id, artwork_id, revision, role, asset_id, source_revision, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        artworkId,
        nextRev,
        m.role,
        m.asset_id,
        m.source_revision ?? working.revision,
        now,
      )
      .run();
  }

  await db
    .prepare(
      `UPDATE artworks SET working_revision = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(nextRev, now, artworkId)
    .run();

  await appendEvent(db, artworkId, "revision_created", {
    frozen: working.revision,
    working: nextRev,
  });

  const frozen = await getRevision(db, artworkId, working.revision);
  const nextWorking = await getWorkingRevision(db, artworkId);
  if (!frozen || !nextWorking) throw new Error("Freeze read-back failed");
  return { frozen, working: nextWorking };
}

export async function revisionHasRequiredAssets(
  db: SqlExecutor,
  artworkId: string,
  revision: number,
  requiredRoles: AssetRole[],
): Promise<{ ok: boolean; missing: string[] }> {
  const rows = await db
    .prepare(
      `SELECT ra.role AS role, a.verified_at AS verified_at
       FROM revision_assets ra
       JOIN assets a ON a.id = ra.asset_id
       WHERE ra.artwork_id = ? AND ra.revision = ?`,
    )
    .bind(artworkId, revision)
    .all<{ role: string; verified_at: string | null }>();

  const byRole = new Map(rows.results.map((r) => [r.role, r.verified_at]));
  const missing: string[] = [];
  for (const role of requiredRoles) {
    const verifiedAt = byRole.get(role);
    if (!verifiedAt) missing.push(role);
  }
  return { ok: missing.length === 0, missing };
}

export async function publishRevision(
  db: SqlExecutor,
  artworkId: string,
  revision: number,
  requiredRoles: AssetRole[],
): Promise<ArtworkRow> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");

  if (
    artwork.status === "published" &&
    artwork.published_revision === revision
  ) {
    return artwork;
  }

  const rev = await getRevision(db, artworkId, revision);
  if (!rev) throw new HttpError(404, "Revision not found");
  if (rev.kind !== "frozen") {
    throw new HttpError(409, "Only frozen revisions can be published");
  }

  const check = await revisionHasRequiredAssets(
    db,
    artworkId,
    revision,
    requiredRoles,
  );
  if (!check.ok) {
    throw new HttpError(
      409,
      `Missing verified required assets: ${check.missing.join(", ")}`,
    );
  }

  const projections = projectionsFromMetadata(rev.metadata_json);
  const thumb = await db
    .prepare(
      `SELECT a.object_key AS object_key
       FROM revision_assets ra
       JOIN assets a ON a.id = ra.asset_id
       WHERE ra.artwork_id = ? AND ra.revision = ? AND ra.role = 'thumb'`,
    )
    .bind(artworkId, revision)
    .first<{ object_key: string }>();

  const now = nowIso();
  await db
    .prepare(
      `UPDATE artworks SET
        status = 'published',
        published_revision = ?,
        title = ?, year = ?, process = ?,
        thumb_object_key = ?,
        published_at = COALESCE(published_at, ?),
        hidden_at = NULL,
        withdrawn_at = NULL,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      revision,
      projections.title,
      projections.year,
      projections.process,
      thumb?.object_key ?? null,
      now,
      now,
      artworkId,
    )
    .run();

  await appendEvent(db, artworkId, "published", { revision });
  const next = await getArtwork(db, artworkId);
  if (!next) throw new Error("Publish read-back failed");
  return next;
}

export async function unpublishArtwork(
  db: SqlExecutor,
  artworkId: string,
): Promise<ArtworkRow> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");
  if (artwork.status !== "published" && artwork.published_revision == null) {
    return artwork;
  }
  const now = nowIso();
  await db
    .prepare(
      `UPDATE artworks SET
        status = 'ready',
        published_revision = NULL,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(now, artworkId)
    .run();
  await appendEvent(db, artworkId, "unpublished", {});
  const next = await getArtwork(db, artworkId);
  if (!next) throw new Error("Unpublish read-back failed");
  return next;
}

export async function setVisibility(
  db: SqlExecutor,
  artworkId: string,
  status: "hidden" | "withdrawn" | "published" | "ready",
): Promise<ArtworkRow> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");
  const now = nowIso();

  if (status === "hidden") {
    await db
      .prepare(
        `UPDATE artworks SET status = 'hidden', hidden_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, artworkId)
      .run();
    await appendEvent(db, artworkId, "hidden", {});
  } else if (status === "withdrawn") {
    await db
      .prepare(
        `UPDATE artworks SET status = 'withdrawn', withdrawn_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(now, now, artworkId)
      .run();
    await appendEvent(db, artworkId, "withdrawn", {});
  } else if (status === "published") {
    if (artwork.published_revision == null) {
      throw new HttpError(409, "No published_revision to restore");
    }
    await db
      .prepare(
        `UPDATE artworks SET status = 'published', hidden_at = NULL, withdrawn_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(now, artworkId)
      .run();
    await appendEvent(db, artworkId, "published", {
      restored: artwork.published_revision,
    });
  } else {
    await db
      .prepare(
        `UPDATE artworks SET status = 'ready', hidden_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(now, artworkId)
      .run();
  }

  const next = await getArtwork(db, artworkId);
  if (!next) throw new Error("Visibility read-back failed");
  return next;
}

export async function registerAsset(
  db: SqlExecutor,
  input: {
    artworkId: string;
    role: string;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    width?: number | null;
    height?: number | null;
    sha256?: string | null;
    verifiedAt?: string | null;
  },
): Promise<{ assetId: string; revision: number }> {
  const artwork = await getArtwork(db, input.artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");
  const working = await getWorkingRevision(db, input.artworkId);
  if (!working) throw new HttpError(404, "Working revision not found");

  const now = nowIso();
  const existingAsset = await db
    .prepare(`SELECT id, verified_at FROM assets WHERE object_key = ?`)
    .bind(input.objectKey)
    .first<{ id: string; verified_at: string | null }>();

  let assetId = existingAsset?.id;
  if (!assetId) {
    assetId = newId();
    await db
      .prepare(
        `INSERT INTO assets (
          id, object_key, mime_type, byte_size, width, height, sha256, verified_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        assetId,
        input.objectKey,
        input.mimeType,
        input.byteSize,
        input.width ?? null,
        input.height ?? null,
        input.sha256 ?? null,
        input.verifiedAt ?? null,
        now,
      )
      .run();
  } else if (input.verifiedAt) {
    await db
      .prepare(
        `UPDATE assets SET verified_at = COALESCE(verified_at, ?),
          mime_type = ?, byte_size = ?,
          width = COALESCE(?, width), height = COALESCE(?, height),
          sha256 = COALESCE(?, sha256)
         WHERE id = ?`,
      )
      .bind(
        input.verifiedAt,
        input.mimeType,
        input.byteSize,
        input.width ?? null,
        input.height ?? null,
        input.sha256 ?? null,
        assetId,
      )
      .run();
  }

  const existingMembership = await db
    .prepare(
      `SELECT id FROM revision_assets
       WHERE artwork_id = ? AND revision = ? AND role = ?`,
    )
    .bind(input.artworkId, working.revision, input.role)
    .first<{ id: string }>();

  if (existingMembership) {
    await db
      .prepare(`UPDATE revision_assets SET asset_id = ? WHERE id = ?`)
      .bind(assetId, existingMembership.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO revision_assets (
          id, artwork_id, revision, role, asset_id, source_revision, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(
        newId(),
        input.artworkId,
        working.revision,
        input.role,
        assetId,
        now,
      )
      .run();
  }

  if (input.role === "thumb") {
    await db
      .prepare(`UPDATE artworks SET thumb_object_key = ?, updated_at = ? WHERE id = ?`)
      .bind(input.objectKey, now, input.artworkId)
      .run();
  } else {
    await db
      .prepare(`UPDATE artworks SET updated_at = ?, status = CASE
        WHEN status IN ('draft') THEN 'uploading' ELSE status END WHERE id = ?`)
      .bind(now, input.artworkId)
      .run();
  }

  await appendEvent(db, input.artworkId, "asset_verified", {
    role: input.role,
    object_key: input.objectKey,
    verified: Boolean(input.verifiedAt),
  });

  return { assetId, revision: working.revision };
}

export async function markAssetVerified(
  db: SqlExecutor,
  objectKey: string,
  verifiedAt: string = nowIso(),
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE assets SET verified_at = COALESCE(verified_at, ?) WHERE object_key = ?`,
    )
    .bind(verifiedAt, objectKey)
    .run();
  if (!result.success) {
    throw new HttpError(404, "Asset not found");
  }
}

export async function listRevisionAssets(
  db: SqlExecutor,
  artworkId: string,
  revision: number,
): Promise<
  Array<{
    role: string;
    object_key: string;
    mime_type: string;
    byte_size: number;
    verified_at: string | null;
    width: number | null;
    height: number | null;
  }>
> {
  const res = await db
    .prepare(
      `SELECT ra.role AS role, a.object_key AS object_key, a.mime_type AS mime_type,
              a.byte_size AS byte_size, a.verified_at AS verified_at,
              a.width AS width, a.height AS height
       FROM revision_assets ra
       JOIN assets a ON a.id = ra.asset_id
       WHERE ra.artwork_id = ? AND ra.revision = ?
       ORDER BY ra.role`,
    )
    .bind(artworkId, revision)
    .all<{
      role: string;
      object_key: string;
      mime_type: string;
      byte_size: number;
      verified_at: string | null;
      width: number | null;
      height: number | null;
    }>();
  return res.results;
}

export async function listEvents(
  db: SqlExecutor,
  artworkId: string,
  limit = 50,
): Promise<
  Array<{ id: string; event_type: string; payload_json: string | null; created_at: string }>
> {
  const res = await db
    .prepare(
      `SELECT id, event_type, payload_json, created_at FROM accession_events
       WHERE artwork_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(artworkId, limit)
    .all<{
      id: string;
      event_type: string;
      payload_json: string | null;
      created_at: string;
    }>();
  return res.results;
}

const ACCESSION_ID_RE = /^AR-\d{4}-\d{4,}$/;

export function isValidAccessionId(accessionId: string): boolean {
  return ACCESSION_ID_RE.test(accessionId.trim());
}

const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "archive",
  "about",
  "writings",
  "new",
  "edit",
  "drafts",
  "unauthorized",
]);

export function assertSlugFormat(slug: string): string {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    throw new HttpError(400, "Slug is empty after normalization");
  }
  if (RESERVED_SLUGS.has(normalized)) {
    throw new HttpError(400, `Slug "${normalized}" is reserved`);
  }
  return normalized;
}

export async function validateIdentity(
  db: SqlExecutor,
  artworkId: string,
  input: { slug?: string } = {},
): Promise<{
  ok: boolean;
  accessionId: string;
  accessionValid: boolean;
  slug: string;
  slugAvailable: boolean;
  errors: string[];
}> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");

  const errors: string[] = [];
  const accessionValid = isValidAccessionId(artwork.accession_id);
  if (!accessionValid) {
    errors.push("Accession id has invalid format");
  }

  let slug = artwork.slug;
  if (input.slug !== undefined) {
    try {
      slug = assertSlugFormat(input.slug);
    } catch (err) {
      if (err instanceof HttpError) {
        errors.push(err.message);
        return {
          ok: false,
          accessionId: artwork.accession_id,
          accessionValid,
          slug: artwork.slug,
          slugAvailable: false,
          errors,
        };
      }
      throw err;
    }
  }

  const conflict = await getArtworkBySlug(db, slug);
  const slugAvailable = !conflict || conflict.id === artwork.id;
  if (!slugAvailable) {
    errors.push(`Slug "${slug}" is already in use`);
  }

  return {
    ok: errors.length === 0,
    accessionId: artwork.accession_id,
    accessionValid,
    slug,
    slugAvailable,
    errors,
  };
}

export type OwnedArtworkAsset = {
  asset_id: string;
  role: string;
  object_key: string;
  revision: number;
  mime_type: string;
  byte_size: number;
};

/**
 * All assets linked to any revision of this artwork via revision_assets.
 * Used for owned R2 cleanup before hard-delete.
 */
export async function listAllArtworkAssets(
  db: SqlExecutor,
  artworkId: string,
): Promise<OwnedArtworkAsset[]> {
  const res = await db
    .prepare(
      `SELECT DISTINCT a.id AS asset_id, ra.role AS role, a.object_key AS object_key,
              ra.revision AS revision, a.mime_type AS mime_type, a.byte_size AS byte_size
       FROM revision_assets ra
       JOIN assets a ON a.id = ra.asset_id
       WHERE ra.artwork_id = ?
       ORDER BY ra.revision ASC, ra.role ASC`,
    )
    .bind(artworkId)
    .all<OwnedArtworkAsset>();
  return res.results;
}

/**
 * Hard-delete never-published drafts only.
 * Caller must delete R2 objects first. This removes D1 artwork (cascade
 * revisions/events) and owned assets rows so they are not orphaned.
 */
export async function deleteArtwork(
  db: SqlExecutor,
  artworkId: string,
): Promise<{ deleted: true; id: string; assetIdsRemoved: string[] }> {
  const artwork = await getArtwork(db, artworkId);
  if (!artwork) throw new HttpError(404, "Artwork not found");

  const deletableStatuses = new Set(["draft", "uploading", "ready"]);
  if (!deletableStatuses.has(artwork.status)) {
    throw new HttpError(
      409,
      `Cannot delete artwork with status "${artwork.status}"`,
    );
  }
  if (artwork.published_revision != null || artwork.published_at != null) {
    throw new HttpError(
      409,
      "Cannot delete artwork that has been published; unpublish or withdraw instead",
    );
  }

  const owned = await listAllArtworkAssets(db, artworkId);
  const assetIds = [...new Set(owned.map((a) => a.asset_id))];

  const statements: SqlBatchStatement[] = [
    { sql: `DELETE FROM artworks WHERE id = ?`, binds: [artworkId] },
    ...assetIds.map((assetId) => ({
      sql: `DELETE FROM assets WHERE id = ?`,
      binds: [assetId] as unknown[],
    })),
  ];

  if (db.batch) {
    await db.batch(statements);
  } else {
    for (const statement of statements) {
      await db
        .prepare(statement.sql)
        .bind(...statement.binds)
        .run();
    }
  }

  return { deleted: true, id: artworkId, assetIdsRemoved: assetIds };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
