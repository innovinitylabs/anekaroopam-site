import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { testAdminAuthHeaders } from "./admin-test-auth";
import { ArchiveWorkerError, type WorkerArtwork } from "./worker-client";
import { resolveWorkerArtworkForWrite } from "./worker-drafts";

const WORKER = "https://worker.test";

function row(overrides: Partial<WorkerArtwork>): WorkerArtwork {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    accessionId: "AR-2026-0000",
    draftId: "draft-2026-00000000",
    slug: "untitled",
    status: "draft",
    workingRevision: 1,
    publishedRevision: null,
    title: "Untitled",
    year: null,
    process: null,
    thumbObjectKey: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    hiddenAt: null,
    withdrawnAt: null,
    createdBy: null,
    ...overrides,
  };
}

const A = row({
  id: "11111111-1111-4111-8111-111111111111",
  accessionId: "AR-2026-0001",
  draftId: "draft-2026-aaaaaaaa",
  slug: "shared-title",
  workingRevision: 2,
});
const B = row({
  id: "22222222-2222-4222-8222-222222222222",
  accessionId: "AR-2026-0002",
  draftId: "draft-2026-bbbbbbbb",
  slug: "shared-title-2",
});
const C = row({
  id: "33333333-3333-4333-8333-333333333333",
  accessionId: "AR-2026-0003",
  draftId: "draft-2026-cccccccc",
  slug: "mirror-of-a",
});

type Call = { method: string; path: string };

function installFakeWorker(rows: WorkerArtwork[]) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = init?.method ?? "GET";
    if (url.origin !== WORKER) {
      throw new Error(`Unexpected non-Worker fetch: ${method} ${url.href}`);
    }
    calls.push({ method, path: url.pathname + url.search });
    const detail = (artwork: WorkerArtwork) =>
      Response.json({
        artwork,
        workingRevision: null,
        publishedRevision: null,
        assets: [],
        readiness: { ok: true, missing: [] },
      });
    const notFound = () =>
      Response.json({ error: "Artwork not found" }, { status: 404 });

    const byDraft = /^\/admin\/artworks\/by-draft\/([^/]+)$/.exec(url.pathname);
    if (byDraft && method === "GET") {
      const hit = rows.find((r) => r.draftId === decodeURIComponent(byDraft[1]));
      return hit ? detail(hit) : notFound();
    }
    const single = /^\/admin\/artworks\/([^/]+)$/.exec(url.pathname);
    if (single && method === "GET") {
      // Mirrors the Worker's broad read resolution: id, draft, accession, slug.
      const key = decodeURIComponent(single[1]);
      const hit =
        rows.find((r) => r.id === key) ??
        rows.find((r) => r.draftId === key) ??
        rows.find((r) => r.accessionId === key) ??
        rows.find((r) => r.slug === key);
      return hit ? detail(hit) : notFound();
    }
    if (url.pathname === "/admin/artworks" && method === "GET") {
      return Response.json({ artworks: rows, total: rows.length });
    }
    const action = /^\/admin\/artworks\/([^/]+)\/(publish|visibility|assets)$/.exec(
      url.pathname,
    );
    if (action && method === "POST") {
      const target = rows.find((r) => r.id === decodeURIComponent(action[1]));
      if (!target) return notFound();
      return Response.json({ artwork: target, ok: true }, { status: 200 });
    }
    return Response.json({ error: `unhandled ${url.pathname}` }, { status: 500 });
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const ENV_KEYS = [
  "ARCHIVE_WORKER_URL",
  "ARCHIVE_WORKER_TOKEN",
  "ARCHIVE_PREFER_GITHUB_STORE",
  "ADMIN_INGEST_ENABLED",
  "ADMIN_SESSION_SECRET",
  "R2_ARCHIVE_ENABLED",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "R2_KEY_PREFIX",
  "VERCEL_ENV",
] as const;

let savedEnv: Record<string, string | undefined> = {};
let fake: ReturnType<typeof installFakeWorker>;

function setBaseEnv() {
  process.env.ARCHIVE_WORKER_URL = WORKER;
  process.env.ARCHIVE_WORKER_TOKEN = "worker-token";
  delete process.env.ARCHIVE_PREFER_GITHUB_STORE;
  process.env.ADMIN_INGEST_ENABLED = "true";
  process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
  process.env.R2_ARCHIVE_ENABLED = "true";
  process.env.R2_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "bucket";
  process.env.R2_PUBLIC_BASE_URL = "https://media.test";
  process.env.R2_KEY_PREFIX = "dev/";
  process.env.VERCEL_ENV = "preview";
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  setBaseEnv();
  fake = installFakeWorker([A, B, C]);
});

afterEach(() => {
  fake.restore();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

async function expectWorkerError(
  promise: Promise<unknown>,
  status: number,
  pattern?: RegExp,
) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof ArchiveWorkerError, String(err));
    assert.equal(err.status, status);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

describe("resolveWorkerArtworkForWrite", () => {
  it("resolves an exact artwork id", async () => {
    const artwork = await resolveWorkerArtworkForWrite({ artworkId: A.id });
    assert.equal(artwork.id, A.id);
  });

  it("resolves an exact draft id without slug or list lookups", async () => {
    const artwork = await resolveWorkerArtworkForWrite({ draftId: B.draftId });
    assert.equal(artwork.id, B.id);
    assert.ok(fake.calls.every((c) => c.path.startsWith("/admin/artworks/by-draft/")));
  });

  it("never treats a slug, draft id, or accession as an artwork id", async () => {
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ artworkId: C.slug }),
      404,
    );
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ artworkId: B.draftId }),
      404,
    );
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ artworkId: B.accessionId }),
      404,
    );
  });

  it("does not fall back to list scans when ids share slug text", async () => {
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ draftId: "shared-title" }),
      404,
    );
    assert.ok(!fake.calls.some((c) => c.path.startsWith("/admin/artworks?")));
    assert.ok(!fake.calls.some((c) => c.path === "/admin/artworks"));
  });

  it("rejects mismatched accession and draft ownership", async () => {
    await expectWorkerError(
      resolveWorkerArtworkForWrite({
        artworkId: A.id,
        accessionId: B.accessionId,
      }),
      409,
      /does not belong/,
    );
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ artworkId: A.id, draftId: B.draftId }),
      409,
      /does not belong/,
    );
    await expectWorkerError(
      resolveWorkerArtworkForWrite({
        draftId: B.draftId,
        accessionId: A.accessionId,
      }),
      409,
    );
  });

  it("rejects unknown ids and missing identifiers", async () => {
    await expectWorkerError(
      resolveWorkerArtworkForWrite({
        artworkId: "99999999-9999-4999-8999-999999999999",
      }),
      404,
    );
    await expectWorkerError(
      resolveWorkerArtworkForWrite({ draftId: "draft-missing" }),
      404,
    );
    await expectWorkerError(resolveWorkerArtworkForWrite({}), 400);
  });
});

async function loadRoute<T>(relative: string): Promise<T> {
  const href = pathToFileURL(path.join(process.cwd(), relative)).href;
  return (await import(`${href}?t=${Date.now()}-${Math.random()}`)) as T;
}

type PostHandler = (request: Request) => Promise<Response>;
type IdHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

function adminJson(url: string, body: unknown, method = "POST"): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...testAdminAuthHeaders() },
    body: JSON.stringify(body),
  });
}

describe("upload-verify write target and namespace", () => {
  const route = "src/app/api/admin/archive/upload-verify/route.ts";

  it("rejects an accession that does not belong to the artwork", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(route);
    const res = await POST(
      adminJson("/api/admin/archive/upload-verify", {
        accessionId: B.accessionId,
        revision: 1,
        artworkId: A.id,
        objects: [
          {
            key: `dev/archive/${B.accessionId}/r1/derivatives/thumb.jpg`,
            contentType: "image/jpeg",
            contentLength: 10,
            role: "thumb",
          },
        ],
      }),
    );
    assert.equal(res.status, 409);
    assert.ok(!fake.calls.some((c) => c.path.endsWith("/assets")));
  });

  it("rejects a revision that is not the working revision", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(route);
    const res = await POST(
      adminJson("/api/admin/archive/upload-verify", {
        accessionId: A.accessionId,
        revision: 1,
        artworkId: A.id,
        objects: [
          {
            key: `dev/archive/${A.accessionId}/r1/derivatives/thumb.jpg`,
            contentType: "image/jpeg",
            contentLength: 10,
            role: "thumb",
          },
        ],
      }),
    );
    assert.equal(res.status, 409);
    assert.ok(!fake.calls.some((c) => c.path.endsWith("/assets")));
  });

  it("rejects a slug passed as artworkId", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(route);
    const res = await POST(
      adminJson("/api/admin/archive/upload-verify", {
        accessionId: C.accessionId,
        revision: 1,
        artworkId: C.slug,
        objects: [
          {
            key: `dev/archive/${C.accessionId}/r1/derivatives/thumb.jpg`,
            contentType: "image/jpeg",
            contentLength: 10,
          },
        ],
      }),
    );
    assert.equal(res.status, 404);
  });

  it("rejects keys from another environment before any Worker call", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(route);
    for (const key of [
      `prod/archive/${A.accessionId}/r2/derivatives/thumb.jpg`,
      `archive/${A.accessionId}/r2/derivatives/thumb.jpg`,
    ]) {
      const res = await POST(
        adminJson("/api/admin/archive/upload-verify", {
          accessionId: A.accessionId,
          revision: 2,
          artworkId: A.id,
          objects: [{ key, contentType: "image/jpeg", contentLength: 10 }],
        }),
      );
      assert.equal(res.status, 400);
    }
    assert.equal(fake.calls.length, 0);
  });
});

describe("metadata-commit resolves by id and verifies accession before R2", () => {
  const route = "src/app/api/admin/archive/metadata-commit/route.ts";
  const media = (accessionId: string, revision: number) => ({
    accessionId,
    revision,
    objects: [
      {
        key: `dev/archive/${accessionId}/r${revision}/derivatives/thumb.jpg`,
        contentType: "image/jpeg",
        contentLength: 10,
      },
    ],
  });

  const cases: Array<{
    name: string;
    body: Record<string, unknown>;
    status: number;
    error?: RegExp;
  }> = [
    {
      name: "mismatched accession",
      body: { slug: A.slug, artworkId: A.id, media: media(B.accessionId, 1) },
      status: 409,
    },
    {
      name: "unknown artwork id",
      body: {
        slug: A.slug,
        artworkId: "99999999-9999-4999-8999-999999999999",
        media: media(A.accessionId, 2),
      },
      status: 404,
    },
    {
      name: "slug passed as artworkId",
      body: { slug: C.slug, artworkId: C.slug, media: media(C.accessionId, 1) },
      status: 404,
    },
    {
      name: "slug-only request (no immutable id)",
      body: { slug: A.slug, media: media(A.accessionId, 2) },
      status: 400,
      error: /artworkId or draftId is required/,
    },
    {
      name: "revision ahead of the working tip",
      body: { slug: A.slug, artworkId: A.id, media: media(A.accessionId, 3) },
      status: 409,
    },
  ];

  for (const c of cases) {
    it(`rejects ${c.name} without writes`, async () => {
      const { POST } = await loadRoute<{ POST: PostHandler }>(route);
      const res = await POST(adminJson("/api/admin/archive/metadata-commit", c.body));
      assert.equal(res.status, c.status);
      if (c.error) {
        const data = (await res.json()) as { error?: string };
        assert.match(data.error ?? "", c.error);
      }
      assert.ok(fake.calls.every((call) => call.method === "GET"));
    });
  }
});

describe("R2 write routes fail closed without environment isolation", () => {
  const cases: Array<{ name: string; env: Record<string, string | undefined> }> = [
    { name: "prefix unset", env: { R2_KEY_PREFIX: undefined } },
    {
      name: "production using dev/",
      env: { VERCEL_ENV: "production", R2_KEY_PREFIX: "dev/" },
    },
    {
      name: "preview using prod/",
      env: { VERCEL_ENV: "preview", R2_KEY_PREFIX: "prod/" },
    },
  ];

  for (const c of cases) {
    it(`returns 503 with no Worker/R2 calls: ${c.name}`, async () => {
      for (const [k, v] of Object.entries(c.env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      const auth = await loadRoute<{ POST: PostHandler }>(
        "src/app/api/admin/archive/upload-auth/route.ts",
      );
      const verify = await loadRoute<{ POST: PostHandler }>(
        "src/app/api/admin/archive/upload-verify/route.ts",
      );
      const commit = await loadRoute<{ POST: PostHandler }>(
        "src/app/api/admin/archive/metadata-commit/route.ts",
      );
      const del = await loadRoute<{ DELETE: IdHandler }>(
        "src/app/api/admin/archive/artworks/[id]/route.ts",
      );

      const responses = [
        await auth.POST(
          adminJson("/api/admin/archive/upload-auth", {
            slug: "x",
            draftId: A.draftId,
            objects: [
              { role: "thumb", filename: "thumb.jpg", contentType: "image/jpeg", contentLength: 1 },
            ],
          }),
        ),
        await verify.POST(
          adminJson("/api/admin/archive/upload-verify", {
            accessionId: A.accessionId,
            revision: 2,
            artworkId: A.id,
            objects: [],
          }),
        ),
        await commit.POST(
          adminJson("/api/admin/archive/metadata-commit", {
            slug: "x",
            artworkId: A.id,
          }),
        ),
        await del.DELETE(
          adminJson(
            `/api/admin/archive/artworks/${A.id}?confirm=permanent`,
            {},
            "DELETE",
          ),
          { params: Promise.resolve({ id: A.id }) },
        ),
      ];
      for (const res of responses) {
        assert.equal(res.status, 503);
      }
      assert.equal(fake.calls.length, 0);
    });
  }
});

describe("publish, visibility, and delete resolve by immutable id only", () => {
  it("publish rejects slug-only requests in Worker mode", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(
      "src/app/api/admin/archive/publish/route.ts",
    );
    const res = await POST(
      adminJson("/api/admin/archive/publish", { slug: A.slug }),
    );
    assert.equal(res.status, 400);
    assert.equal(fake.calls.length, 0);
  });

  it("publish rejects a draftId belonging to a different artwork", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(
      "src/app/api/admin/archive/publish/route.ts",
    );
    const res = await POST(
      adminJson("/api/admin/archive/publish", {
        artworkId: A.id,
        draftId: B.draftId,
      }),
    );
    assert.equal(res.status, 409);
    assert.ok(!fake.calls.some((c) => c.path.endsWith("/publish")));
  });

  it("publish targets the exact artwork id", async () => {
    const { POST } = await loadRoute<{ POST: PostHandler }>(
      "src/app/api/admin/archive/publish/route.ts",
    );
    const res = await POST(
      adminJson("/api/admin/archive/publish", {
        slug: B.slug,
        draftId: A.draftId,
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(
      fake.calls.filter((c) => c.path.endsWith("/publish")),
      [{ method: "POST", path: `/admin/artworks/${A.id}/publish` }],
    );
  });

  it("visibility rejects a slug as the route id", async () => {
    const { POST } = await loadRoute<{ POST: IdHandler }>(
      "src/app/api/admin/archive/artworks/[id]/visibility/route.ts",
    );
    const res = await POST(
      adminJson(`/api/admin/archive/artworks/${C.slug}/visibility`, {
        action: "hide",
      }),
      { params: Promise.resolve({ id: C.slug }) },
    );
    assert.equal(res.status, 404);
    assert.ok(!fake.calls.some((c) => c.path.endsWith("/visibility")));
  });

  it("delete rejects a slug as the route id before touching R2", async () => {
    const { DELETE } = await loadRoute<{ DELETE: IdHandler }>(
      "src/app/api/admin/archive/artworks/[id]/route.ts",
    );
    const res = await DELETE(
      adminJson(
        `/api/admin/archive/artworks/${C.slug}?confirm=permanent`,
        {},
        "DELETE",
      ),
      { params: Promise.resolve({ id: C.slug }) },
    );
    assert.equal(res.status, 404);
    assert.ok(!fake.calls.some((c) => c.method === "DELETE"));
    assert.ok(!fake.calls.some((c) => c.path.endsWith("/owned-assets")));
  });
});
