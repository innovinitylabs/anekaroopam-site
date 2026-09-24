import {
  appendEvent,
  createDraft,
  freezeWorkingRevision,
  getArtwork,
  getArtworkBySlug,
  getRevision,
  getWorkingRevision,
  HttpError,
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
} from "./db";
import { errorJson, json, readJson, requireAdmin } from "./http";
import type { SqlExecutor } from "./db";
import {
  parseRequiredRoles,
  publicUrlForKey,
  type Env,
} from "./types";

function db(env: Env): SqlExecutor {
  return env.DB as unknown as SqlExecutor;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers":
      "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
    return listPublic(env);
  }
  const publicMatch = /^\/public\/artworks\/([^/]+)$/.exec(path);
  if (publicMatch && request.method === "GET") {
    return getPublic(env, decodeURIComponent(publicMatch[1]));
  }

  const authError = requireAdmin(request, env);
  if (authError) return authError;

  if (path === "/admin/artworks" && request.method === "GET") {
    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit") || "50");
    const rows = await listArtworks(db(env), { status, limit });
    return json({ artworks: rows.map((r) => artworkDto(r)) });
  }

  if (path === "/admin/artworks" && request.method === "POST") {
    return createArtwork(request, env);
  }

  const artworkMatch = /^\/admin\/artworks\/([^/]+)$/.exec(path);
  if (artworkMatch) {
    const id = decodeURIComponent(artworkMatch[1]);
    if (request.method === "GET") return getArtworkDetail(env, id);
    if (request.method === "PATCH") return patchArtwork(request, env, id);
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
  const artwork = await getArtwork(db(env), id);
  if (!artwork) return errorJson(404, "Artwork not found");
  const working = await getWorkingRevision(db(env), id);
  const assets = working
    ? await listRevisionAssets(db(env), id, working.revision)
    : [];
  const published =
    artwork.published_revision != null
      ? await getRevision(db(env), id, artwork.published_revision)
      : null;
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
        }
      : null,
    assets,
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

async function listPublic(env: Env): Promise<Response> {
  const rows = await listArtworks(db(env), { status: "published", limit: 200 });
  const base = env.R2_PUBLIC_BASE_URL || "";
  return json({
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
  });
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
