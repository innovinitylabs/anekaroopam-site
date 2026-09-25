import {
  appendEvent,
  createDraft,
  deleteArtwork,
  freezeWorkingRevision,
  getArtwork,
  getArtworkByAccessionId,
  getArtworkByDraftId,
  getArtworkBySlug,
  getRevision,
  getWorkingRevision,
  HttpError,
  listAllArtworkAssets,
  listArtworks,
  listEvents,
  listRevisionAssets,
  markAssetVerified,
  patchWorkingRevision,
  publishRevision,
  registerAsset,
  revisionHasRequiredAssets,
  setVisibility,
  unpublishArtwork,
  validateIdentity,
  type ListArtworksOpts,
  type ListArtworksSort,
} from "./db";
import { errorJson, json, readJson, requireAdmin } from "./http";
import type { SqlExecutor } from "./db";
import {
  parseRequiredRoles,
  publicUrlForKey,
  type Env,
} from "./types";

function db(env: Env): SqlExecutor {
  const d1 = env.DB as D1Database;
  return {
    prepare(query: string) {
      return d1.prepare(query) as unknown as ReturnType<SqlExecutor["prepare"]>;
    },
    async batch(statements) {
      await d1.batch(
        statements.map((statement) =>
          d1.prepare(statement.sql).bind(...statement.binds),
        ),
      );
    },
  };
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}

const SORT_VALUES = new Set<ListArtworksSort>([
  "updated_desc",
  "year_desc",
  "title_asc",
]);

function parseListQuery(
  url: URL,
  defaults: { status?: string; limit?: number } = {},
): { opts: ListArtworksOpts; error?: string } {
  const q = url.searchParams.get("q")?.trim() || undefined;
  const yearRaw = url.searchParams.get("year");
  const process = url.searchParams.get("process")?.trim() || undefined;
  const sortRaw = url.searchParams.get("sort") || "updated_desc";
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const statusParam = url.searchParams.get("status");

  if (yearRaw != null && yearRaw !== "") {
    const year = Number(yearRaw);
    if (!Number.isInteger(year)) {
      return { opts: {}, error: "year must be an integer" };
    }
  }

  if (!SORT_VALUES.has(sortRaw as ListArtworksSort)) {
    return {
      opts: {},
      error: "sort must be updated_desc, year_desc, or title_asc",
    };
  }

  const limit = limitRaw != null ? Number(limitRaw) : (defaults.limit ?? 48);
  if (!Number.isFinite(limit) || limit < 1) {
    return { opts: {}, error: "limit must be a positive number" };
  }

  const offset = offsetRaw != null ? Number(offsetRaw) : 0;
  if (!Number.isFinite(offset) || offset < 0) {
    return { opts: {}, error: "offset must be a non-negative number" };
  }

  let status: string | string[] | undefined = defaults.status;
  if (statusParam) {
    status = statusParam.includes(",")
      ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
      : statusParam;
  }

  const year =
    yearRaw != null && yearRaw !== "" ? Number(yearRaw) : undefined;

  return {
    opts: {
      status,
      q,
      year,
      process,
      sort: sortRaw as ListArtworksSort,
      limit: Math.min(Math.floor(limit), 200),
      offset: Math.floor(offset),
    },
  };
}

function publicListDto(
  rows: Awaited<ReturnType<typeof listArtworks>>["artworks"],
  total: number,
  base: string,
) {
  return {
    artworks: rows.map((r) => ({
      id: r.id,
      accessionId: r.accession_id,
      slug: r.slug,
      title: r.title,
      year: r.year,
      process: r.process,
      publishedRevision: r.published_revision,
      thumbUrl:
        r.thumb_object_key && base
          ? publicUrlForKey(r.thumb_object_key, base)
          : null,
      publishedAt: r.published_at,
    })),
    total,
  };
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function artworkDto(
  artwork: Awaited<ReturnType<typeof getArtwork>>,
  extras: Record<string, unknown> = {},
) {
  if (!artwork) return null;
  return {
    id: artwork.id,
    accessionId: artwork.accession_id,
    draftId: artwork.draft_id,
    slug: artwork.slug,
    status: artwork.status,
    workingRevision: artwork.working_revision,
    publishedRevision: artwork.published_revision,
    title: artwork.title,
    year: artwork.year,
    process: artwork.process,
    thumbObjectKey: artwork.thumb_object_key,
    createdAt: artwork.created_at,
    updatedAt: artwork.updated_at,
    publishedAt: artwork.published_at,
    hiddenAt: artwork.hidden_at,
    withdrawnAt: artwork.withdrawn_at,
    createdBy: artwork.created_by,
    ...extras,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }

    try {
      const response = await handle(request, env);
      return withCors(response, request);
    } catch (err) {
      if (err instanceof HttpError) {
        return withCors(errorJson(err.status, err.message), request);
      }
      const message = err instanceof Error ? err.message : "Internal error";
      console.error(message, err);
      return withCors(errorJson(500, message), request);
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";

  if (path === "/health" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: true, service: "archive-api", db: row?.ok === 1 });
  }

  // Public published listing / detail (no admin token)
  if (path === "/public/artworks" && request.method === "GET") {
    return listPublic(env, url);
  }
  const publicMatch = /^\/public\/artworks\/([^/]+)$/.exec(path);
  if (publicMatch && request.method === "GET") {
    return getPublic(env, decodeURIComponent(publicMatch[1]));
  }

  const authError = requireAdmin(request, env);
  if (authError) return authError;

  if (path === "/admin/artworks" && request.method === "GET") {
    const parsed = parseListQuery(url, { limit: 50 });
    if (parsed.error) return errorJson(400, parsed.error);
    const { artworks, total } = await listArtworks(db(env), parsed.opts);
    return json({ artworks: artworks.map((r) => artworkDto(r)), total });
  }

  if (path === "/admin/artworks" && request.method === "POST") {
    return createArtwork(request, env);
  }

  const byDraftMatch = /^\/admin\/artworks\/by-draft\/([^/]+)$/.exec(path);
  if (byDraftMatch && request.method === "GET") {
    const draftId = decodeURIComponent(byDraftMatch[1]);
    const row = await getArtworkByDraftId(db(env), draftId);
    if (!row) return errorJson(404, "Artwork not found");
    return getArtworkDetail(env, row.id);
  }

  const validateMatch =
    /^\/admin\/artworks\/([^/]+)\/validate-identity$/.exec(path);
  if (validateMatch && request.method === "POST") {
    const id = decodeURIComponent(validateMatch[1]);
    const body = await readJson<{ slug?: string }>(request).catch(
      () => ({} as { slug?: string }),
    );
    const artwork = await resolveArtworkId(db(env), id);
    if (!artwork) return errorJson(404, "Artwork not found");
    const result = await validateIdentity(db(env), artwork.id, {
      slug: body.slug,
    });
    return json(result, result.ok ? 200 : 409);
  }

  const ownedAssetsMatch =
    /^\/admin\/artworks\/([^/]+)\/owned-assets$/.exec(path);
  if (ownedAssetsMatch && request.method === "GET") {
    const id = decodeURIComponent(ownedAssetsMatch[1]);
    const artwork = await resolveArtworkId(db(env), id);
    if (!artwork) return errorJson(404, "Artwork not found");
    const assets = await listAllArtworkAssets(db(env), artwork.id);
    return json({
      artworkId: artwork.id,
      accessionId: artwork.accession_id,
      assets,
    });
  }

  const artworkMatch = /^\/admin\/artworks\/([^/]+)$/.exec(path);
  if (artworkMatch) {
    const id = decodeURIComponent(artworkMatch[1]);
    if (request.method === "GET") return getArtworkDetail(env, id);
    if (request.method === "PATCH") return patchArtwork(request, env, id);
    if (request.method === "DELETE") {
      const url = new URL(request.url);
      let confirm = url.searchParams.get("confirm");
      if (!confirm) {
        try {
          const body = await readJson<{ confirm?: string }>(request);
          confirm = body.confirm ?? null;
        } catch {
          confirm = null;
        }
      }
      if (confirm !== "permanent") {
        return errorJson(
          400,
          "Delete requires confirm=permanent query or body field",
        );
      }
      const artwork = await resolveArtworkId(db(env), id);
      if (!artwork) return errorJson(404, "Artwork not found");
      const result = await deleteArtwork(db(env), artwork.id);
      return json(result);
    }
  }

  const assetsMatch = /^\/admin\/artworks\/([^/]+)\/assets$/.exec(path);
  if (assetsMatch && request.method === "POST") {
    return postAsset(request, env, decodeURIComponent(assetsMatch[1]));
  }

  const verifyAssetMatch =
    /^\/admin\/artworks\/([^/]+)\/assets\/verify$/.exec(path);
  if (verifyAssetMatch && request.method === "POST") {
    const body = await readJson<{ objectKey: string; verified?: boolean }>(
      request,
    );
    if (!body.objectKey) return errorJson(400, "objectKey required");
    await markAssetVerified(db(env), body.objectKey);
    return json({ ok: true, objectKey: body.objectKey });
  }

  const readyMatch = /^\/admin\/artworks\/([^/]+)\/ready$/.exec(path);
  if (readyMatch && request.method === "POST") {
    return markReady(env, decodeURIComponent(readyMatch[1]));
  }

  const revisionsMatch =
    /^\/admin\/artworks\/([^/]+)\/revisions\/freeze$/.exec(path);
  if (revisionsMatch && request.method === "POST") {
    return createRevision(request, env, decodeURIComponent(revisionsMatch[1]));
  }

  const eventsPostMatch = /^\/admin\/artworks\/([^/]+)\/events$/.exec(path);
  if (eventsPostMatch && request.method === "POST") {
    const artworkId = decodeURIComponent(eventsPostMatch[1]);
    const body = await readJson<{ eventType: string; payload?: unknown }>(
      request,
    );
    if (!body.eventType) return errorJson(400, "eventType required");
    await appendEvent(db(env), artworkId, body.eventType, body.payload ?? null);
    return json({ ok: true }, 201);
  }

  const publishMatch = /^\/admin\/artworks\/([^/]+)\/publish$/.exec(path);
  if (publishMatch && request.method === "POST") {
    return publish(request, env, decodeURIComponent(publishMatch[1]));
  }

  const unpublishMatch = /^\/admin\/artworks\/([^/]+)\/unpublish$/.exec(path);
  if (unpublishMatch && request.method === "POST") {
    const artwork = await unpublishArtwork(
      db(env),
      decodeURIComponent(unpublishMatch[1]),
    );
    return json({ artwork: artworkDto(artwork) });
  }

  const visibilityMatch = /^\/admin\/artworks\/([^/]+)\/visibility$/.exec(path);
  if (visibilityMatch && request.method === "POST") {
    return visibility(request, env, decodeURIComponent(visibilityMatch[1]));
  }

  const eventsMatch = /^\/admin\/artworks\/([^/]+)\/events$/.exec(path);
  if (eventsMatch && request.method === "GET") {
    const events = await listEvents(
      db(env),
      decodeURIComponent(eventsMatch[1]),
    );
    return json({ events });
  }

  return errorJson(404, `Not found: ${path}`);
}

async function createArtwork(request: Request, env: Env): Promise<Response> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return errorJson(400, "Idempotency-Key header required");
  }
  const body = await readJson<{
    draftId?: string;
    title?: string;
    slug?: string;
    createdBy?: string;
  }>(request);
  if (!body.draftId) return errorJson(400, "draftId required");

  const { artwork, revision, created } = await createDraft(db(env), {
    draftId: body.draftId,
    title: body.title,
    slug: body.slug,
    createdBy: body.createdBy,
    idempotencyKey,
  });

  return json(
    {
      artwork: artworkDto(artwork, {
        workingRevisionDetail: {
          revision: revision.revision,
          kind: revision.kind,
          metadata: JSON.parse(revision.metadata_json),
          perception: JSON.parse(revision.perception_json),
          export: JSON.parse(revision.export_json),
          provenance: JSON.parse(revision.provenance_json),
        },
      }),
      created,
    },
    created ? 201 : 200,
  );
}

async function getArtworkDetail(env: Env, id: string): Promise<Response> {
  let artwork = await getArtwork(db(env), id);
  if (!artwork) artwork = await getArtworkByDraftId(db(env), id);
  if (!artwork) artwork = await getArtworkByAccessionId(db(env), id);
  if (!artwork) artwork = await getArtworkBySlug(db(env), id);
  if (!artwork) return errorJson(404, "Artwork not found");
  id = artwork.id;
  const working = await getWorkingRevision(db(env), id);
  const assets = working
    ? await listRevisionAssets(db(env), id, working.revision)
    : [];
  const published =
    artwork.published_revision != null
      ? await getRevision(db(env), id, artwork.published_revision)
      : null;
  const publishedAssets =
    artwork.published_revision != null
      ? await listRevisionAssets(db(env), id, artwork.published_revision)
      : [];
  const required = parseRequiredRoles(env.REQUIRED_ROLES);
  const readiness = working
    ? await revisionHasRequiredAssets(db(env), id, working.revision, required)
    : { ok: false, missing: required };

  return json({
    artwork: artworkDto(artwork),
    workingRevision: working
      ? {
          revision: working.revision,
          kind: working.kind,
          metadata: JSON.parse(working.metadata_json),
          perception: JSON.parse(working.perception_json),
          export: JSON.parse(working.export_json),
          provenance: JSON.parse(working.provenance_json),
        }
      : null,
    publishedRevision: published
      ? {
          revision: published.revision,
          kind: published.kind,
          metadata: JSON.parse(published.metadata_json),
          perception: JSON.parse(published.perception_json),
          export: JSON.parse(published.export_json),
          provenance: JSON.parse(published.provenance_json),
        }
      : null,
    assets,
    publishedAssets,
    readiness,
  });
}

async function patchArtwork(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const body = await readJson<{
    metadata?: unknown;
    perception?: unknown;
    export?: unknown;
    provenance?: unknown;
    slug?: string;
  }>(request);

  const { artwork, revision } = await patchWorkingRevision(db(env), id, {
    metadata_json:
      body.metadata !== undefined ? JSON.stringify(body.metadata) : undefined,
    perception_json:
      body.perception !== undefined
        ? JSON.stringify(body.perception)
        : undefined,
    export_json:
      body.export !== undefined ? JSON.stringify(body.export) : undefined,
    provenance_json:
      body.provenance !== undefined
        ? JSON.stringify(body.provenance)
        : undefined,
    slug: body.slug,
  });

  return json({
    artwork: artworkDto(artwork),
    workingRevision: {
      revision: revision.revision,
      kind: revision.kind,
      metadata: JSON.parse(revision.metadata_json),
      perception: JSON.parse(revision.perception_json),
      export: JSON.parse(revision.export_json),
      provenance: JSON.parse(revision.provenance_json),
    },
  });
}

async function postAsset(
  request: Request,
  env: Env,
  artworkId: string,
): Promise<Response> {
  const body = await readJson<{
    role: string;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    width?: number;
    height?: number;
    sha256?: string;
    verified?: boolean;
  }>(request);

  if (!body.role || !body.objectKey || !body.mimeType || body.byteSize == null) {
    return errorJson(400, "role, objectKey, mimeType, byteSize required");
  }

  const result = await registerAsset(db(env), {
    artworkId,
    role: body.role,
    objectKey: body.objectKey,
    mimeType: body.mimeType,
    byteSize: body.byteSize,
    width: body.width,
    height: body.height,
    sha256: body.sha256,
    verifiedAt: body.verified ? new Date().toISOString() : null,
  });

  return json({ ok: true, ...result }, 201);
}

async function markReady(env: Env, artworkId: string): Promise<Response> {
  const artwork = await getArtwork(db(env), artworkId);
  if (!artwork) return errorJson(404, "Artwork not found");
  const required = parseRequiredRoles(env.REQUIRED_ROLES);
  const check = await revisionHasRequiredAssets(
    db(env),
    artworkId,
    artwork.working_revision,
    required,
  );
  if (!check.ok) {
    return errorJson(409, "Required assets missing or unverified", {
      missing: check.missing,
    });
  }
  const now = new Date().toISOString();
  await db(env).prepare(
    `UPDATE artworks SET status = 'ready', updated_at = ? WHERE id = ?`,
  )
    .bind(now, artworkId)
    .run();
  await appendEvent(db(env), artworkId, "ready", { revision: artwork.working_revision });
  const next = await getArtwork(db(env), artworkId);
  return json({ artwork: artworkDto(next) });
}

async function createRevision(
  request: Request,
  env: Env,
  artworkId: string,
): Promise<Response> {
  const body = await readJson<{ note?: string }>(request).catch(() => ({} as { note?: string }));
  const { frozen, working } = await freezeWorkingRevision(
    db(env),
    artworkId,
    body.note,
  );
  return json({
    frozen: { revision: frozen.revision, kind: frozen.kind },
    working: { revision: working.revision, kind: working.kind },
  });
}

async function resolveArtworkId(database: SqlExecutor, idOrKey: string) {
  let artwork = await getArtwork(database, idOrKey);
  if (!artwork) artwork = await getArtworkByDraftId(database, idOrKey);
  if (!artwork) artwork = await getArtworkByAccessionId(database, idOrKey);
  if (!artwork) artwork = await getArtworkBySlug(database, idOrKey);
  return artwork;
}

async function publish(
  request: Request,
  env: Env,
  artworkId: string,
): Promise<Response> {
  const body = await readJson<{ revision?: number }>(request).catch(
    () => ({} as { revision?: number }),
  );
  const artwork = await getArtwork(db(env), artworkId);
  if (!artwork) return errorJson(404, "Artwork not found");

  const identity = await validateIdentity(db(env), artworkId);
  if (!identity.ok) {
    return errorJson(409, identity.errors.join("; "), { identity });
  }

  let revision = body.revision;
  if (revision == null) {
    // Freeze current working tip, then publish the frozen revision.
    const { frozen } = await freezeWorkingRevision(db(env), artworkId);
    revision = frozen.revision;
  }

  const required = parseRequiredRoles(env.REQUIRED_ROLES);
  const published = await publishRevision(db(env), artworkId, revision, required);
  return json({ artwork: artworkDto(published) });
}

async function visibility(
  request: Request,
  env: Env,
  artworkId: string,
): Promise<Response> {
  const body = await readJson<{ status: "hidden" | "withdrawn" | "published" | "ready" }>(
    request,
  );
  if (!body.status) return errorJson(400, "status required");
  const artwork = await setVisibility(db(env), artworkId, body.status);
  return json({ artwork: artworkDto(artwork) });
}

async function listPublic(env: Env, url: URL): Promise<Response> {
  const parsed = parseListQuery(url, { status: "published", limit: 48 });
  if (parsed.error) return errorJson(400, parsed.error);
  // Public listing always forces published regardless of client status.
  const { artworks, total } = await listArtworks(db(env), {
    ...parsed.opts,
    status: "published",
  });
  const base = env.R2_PUBLIC_BASE_URL || "";
  return json(publicListDto(artworks, total, base));
}

async function getPublic(env: Env, slugOrId: string): Promise<Response> {
  let artwork = await getArtworkBySlug(db(env), slugOrId);
  if (!artwork) artwork = await getArtwork(db(env), slugOrId);
  if (!artwork || artwork.status !== "published" || artwork.published_revision == null) {
    return errorJson(404, "Artwork not found");
  }

  const rev = await getRevision(db(env), artwork.id, artwork.published_revision);
  if (!rev) return errorJson(404, "Published revision missing");
  const assets = await listRevisionAssets(
    db(env),
    artwork.id,
    artwork.published_revision,
  );
  const base = env.R2_PUBLIC_BASE_URL || "";
  const assetUrls = Object.fromEntries(
    assets
      .filter((a) => a.role !== "original")
      .map((a) => [
        a.role,
        base ? publicUrlForKey(a.object_key, base) : a.object_key,
      ]),
  );

  return json({
    artwork: {
      id: artwork.id,
      accessionId: artwork.accession_id,
      slug: artwork.slug,
      title: artwork.title,
      year: artwork.year,
      process: artwork.process,
      publishedRevision: artwork.published_revision,
      publishedAt: artwork.published_at,
      metadata: JSON.parse(rev.metadata_json),
      perception: JSON.parse(rev.perception_json),
      export: JSON.parse(rev.export_json),
      provenance: JSON.parse(rev.provenance_json),
      assets: assetUrls,
      thumbUrl:
        artwork.thumb_object_key && base
          ? publicUrlForKey(artwork.thumb_object_key, base)
          : null,
    },
  });
}
