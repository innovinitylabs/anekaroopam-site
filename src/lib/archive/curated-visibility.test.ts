import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import {
  getAccessionRuntimeBySlug,
  getArchiveEntryBySlug,
  getArtworkBySlugDetailed,
  listAllArchiveSlugs,
  listAllArtworks,
} from "../content/resolve-artwork";
import { archiveArtworks } from "../content/artworks";
import { CURATED_SLUGS as WORKER_CURATED_SLUGS } from "../../../workers/archive-api/src/curated";
import { CURATED_SLUGS } from "./curated";
import { runWithRepoRoot } from "./paths";
import {
  ensureTestAdminSessionSecret,
  testAdminAuthHeaders,
} from "./admin-test-auth";

const WORKER = "https://worker.test";
const CROWN = "the-one-who-is-crown-among-the-kings";
const VALI = "valiroopam";
const AAZH = "aazhmaarrattam";
const D1_SLUG = "2026-09-24-hold-tight";

type CuratedMode =
  | { kind: "entries"; hidden: string[] }
  | { kind: "status"; status: number }
  | { kind: "network" }
  | { kind: "malformed" };

let curatedMode: CuratedMode = { kind: "entries", hidden: [] };
let listMode: "ok" | "unavailable" = "ok";
let d1Works: Array<{ slug: string; title: string; year?: number }> = [];
let puts: Array<{ path: string; body: unknown }> = [];
let root = "";

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const ENV_KEYS = [
  "ARCHIVE_WORKER_URL",
  "ARCHIVE_WORKER_TOKEN",
  "ARCHIVE_PREFER_GITHUB_STORE",
  "ADMIN_INGEST_ENABLED",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

function inRoot<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRepoRoot(root, fn);
}

function publicWork(slug: string, title: string, year?: number) {
  return {
    id: `id-${slug}`,
    accessionId: "AR-2026-0001",
    slug,
    title,
    year: year ?? null,
    process: null,
    publishedRevision: 1,
    thumbUrl: `https://media.test/${slug}/thumb.jpg`,
    publishedAt: "2026-09-24T00:00:00.000Z",
  };
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "anek-curated-"));
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.ARCHIVE_WORKER_URL = WORKER;
  process.env.ARCHIVE_WORKER_TOKEN = "test-worker-token";
  delete process.env.ARCHIVE_PREFER_GITHUB_STORE;
  console.warn = () => {};
  curatedMode = { kind: "entries", hidden: [] };
  listMode = "ok";
  d1Works = [{ slug: D1_SLUG, title: "Hold Tight", year: 2026 }];
  puts = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== WORKER) {
      throw new Error(`Unexpected non-Worker fetch: ${url.href}`);
    }
    if (url.pathname === "/admin/curated-visibility") {
      if (curatedMode.kind === "network") throw new TypeError("fetch failed");
      if (curatedMode.kind === "status") {
        return Response.json({ error: "x" }, { status: curatedMode.status });
      }
      if (curatedMode.kind === "malformed") {
        return Response.json({ artworks: [] });
      }
      const hidden = new Set(curatedMode.hidden);
      return Response.json({
        entries: WORKER_CURATED_SLUGS.map((slug) => ({
          slug,
          visible: !hidden.has(slug),
          updatedAt: hidden.has(slug) ? "2026-09-29T00:00:00.000Z" : null,
          updatedBy: hidden.has(slug) ? "admin" : null,
        })),
      });
    }
    if (url.pathname.startsWith("/admin/curated-visibility/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      puts.push({ path: url.pathname, body });
      return Response.json({
        entry: {
          slug: decodeURIComponent(url.pathname.split("/").pop()!),
          visible: body.visible,
          updatedAt: "2026-09-29T00:00:00.000Z",
          updatedBy: body.updatedBy ?? null,
        },
      });
    }
    if (listMode === "unavailable") {
      return Response.json({ error: "Service Unavailable" }, { status: 503 });
    }
    if (url.pathname === "/public/artworks") {
      const q = url.searchParams.get("q")?.toLowerCase();
      const works = d1Works
        .filter((w) => !q || w.title.toLowerCase().includes(q) || w.slug.includes(q))
        .map((w) => publicWork(w.slug, w.title, w.year));
      return Response.json({ artworks: works, total: works.length });
    }
    return Response.json({ error: "Artwork not found" }, { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("curated slug lists", () => {
  it("Next and Worker agree on the curated slugs", () => {
    assert.deepEqual([...CURATED_SLUGS], [...WORKER_CURATED_SLUGS]);
    assert.deepEqual(
      archiveArtworks.map((a) => a.id),
      [CROWN, VALI, AAZH],
    );
  });
});

describe("Worker mode: curated works coexist with D1 works", () => {
  it("visible curated works are listed after D1 works and in the sitemap", async () => {
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(
      listed.artworks.map((a) => a.id),
      [D1_SLUG, CROWN, VALI, AAZH],
    );
    assert.equal(listed.total, 4);
    assert.ok(listed.facets.processes.includes("Valiroopam"));
    assert.deepEqual(await inRoot(() => listAllArchiveSlugs()), [
      D1_SLUG,
      CROWN,
      VALI,
      AAZH,
    ]);
  });

  it("a visible curated work resolves its detail page from the repository", async () => {
    const detail = await inRoot(() => getArtworkBySlugDetailed(VALI));
    assert.equal(detail.artwork?.id, VALI);
    assert.equal(detail.artwork?.imageSrc, "/artworks/Valiroopam.png");
    assert.equal(detail.fallbackActive, false);
    assert.equal(await inRoot(() => getArchiveEntryBySlug(VALI)), null);
    assert.equal(await inRoot(() => getAccessionRuntimeBySlug(VALI)), null);
  });

  it("hiding one curated work removes only that work from list, detail and sitemap", async () => {
    curatedMode = { kind: "entries", hidden: [VALI] };
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(
      listed.artworks.map((a) => a.id),
      [D1_SLUG, CROWN, AAZH],
    );
    assert.equal(listed.total, 3);
    assert.deepEqual(await inRoot(() => listAllArchiveSlugs()), [
      D1_SLUG,
      CROWN,
      AAZH,
    ]);
    const hidden = await inRoot(() => getArtworkBySlugDetailed(VALI));
    assert.equal(hidden.artwork, undefined);
    const shown = await inRoot(() => getArtworkBySlugDetailed(AAZH));
    assert.equal(shown.artwork?.id, AAZH);
  });

  it("all three can be hidden while D1 works stay listed", async () => {
    curatedMode = { kind: "entries", hidden: [CROWN, VALI, AAZH] };
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(listed.artworks.map((a) => a.id), [D1_SLUG]);
    assert.deepEqual(await inRoot(() => listAllArchiveSlugs()), [D1_SLUG]);
  });

  it("search filters apply to curated works", async () => {
    const listed = await inRoot(() => listAllArtworks({ q: "valiroopam" }));
    assert.deepEqual(listed.artworks.map((a) => a.id), [VALI]);
    assert.equal(listed.total, 1);
  });

  it("curated works appear on the first page only", async () => {
    const listed = await inRoot(() => listAllArtworks({ offset: 48 }));
    assert.ok(listed.artworks.every((a) => a.id === D1_SLUG));
  });

  it("a D1 row carrying a curated slug never shadows or duplicates the curated work", async () => {
    d1Works = [
      { slug: D1_SLUG, title: "Hold Tight" },
      { slug: VALI, title: "Impostor" },
    ];
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(
      listed.artworks.map((a) => a.id),
      [D1_SLUG, CROWN, VALI, AAZH],
    );
    assert.equal(
      listed.artworks.find((a) => a.id === VALI)?.metadata.title,
      "Valiroopam",
    );
    curatedMode = { kind: "entries", hidden: [VALI] };
    const hidden = await inRoot(() => listAllArtworks());
    assert.ok(!hidden.artworks.some((a) => a.id === VALI));
  });
});

describe("Worker mode: fail-closed when visibility is unknown", () => {
  const unknownModes: Array<[string, CuratedMode]> = [
    ["503", { kind: "status", status: 503 }],
    ["404 from an older Worker", { kind: "status", status: 404 }],
    ["network error", { kind: "network" }],
    ["malformed payload", { kind: "malformed" }],
  ];
  for (const [label, curated] of unknownModes) {
    it(`${label}: curated works are hidden, D1 works still listed`, async () => {
      curatedMode = curated;
      const listed = await inRoot(() => listAllArtworks());
      assert.deepEqual(listed.artworks.map((a) => a.id), [D1_SLUG]);
      assert.deepEqual(await inRoot(() => listAllArchiveSlugs()), [D1_SLUG]);
      for (const slug of [CROWN, VALI, AAZH]) {
        const detail = await inRoot(() => getArtworkBySlugDetailed(slug));
        assert.equal(detail.artwork, undefined, slug);
      }
    });
  }

  it("a full Worker outage never serves a curated work, even one set visible", async () => {
    listMode = "unavailable";
    curatedMode = { kind: "status", status: 503 };
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(listed.artworks, []);
    assert.equal(listed.fallbackActive, true);
    const detail = await inRoot(() => getArtworkBySlugDetailed(CROWN));
    assert.equal(detail.artwork, undefined);
    assert.equal(detail.fallbackActive, false);
  });

  it("an explicitly hidden work stays hidden when the list endpoint fails", async () => {
    listMode = "unavailable";
    curatedMode = { kind: "entries", hidden: [VALI] };
    const detail = await inRoot(() => getArtworkBySlugDetailed(VALI));
    assert.equal(detail.artwork, undefined);
  });
});

describe("Without a Worker: repository behaviour is unchanged", () => {
  it("all curated works are listed and resolvable", async () => {
    delete process.env.ARCHIVE_WORKER_URL;
    delete process.env.ARCHIVE_WORKER_TOKEN;
    globalThis.fetch = (async () => {
      throw new Error("no fetch expected without a Worker");
    }) as typeof fetch;
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(
      listed.artworks.map((a) => a.id),
      [CROWN, VALI, AAZH],
    );
    const detail = await inRoot(() => getArtworkBySlugDetailed(AAZH));
    assert.equal(detail.artwork?.id, AAZH);
  });
});

describe("/api/admin/archive/curated", () => {
  async function loadRoute() {
    const href = pathToFileURL(
      path.join(process.cwd(), "src/app/api/admin/archive/curated/route.ts"),
    ).href;
    return (await import(href)) as {
      GET: (request: Request) => Promise<Response>;
      PUT: (request: Request) => Promise<Response>;
    };
  }

  function putRequest(body: unknown, auth = true) {
    return new Request("http://localhost/api/admin/archive/curated", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? testAdminAuthHeaders({ login: "curator" }) : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("rejects requests when admin is disabled or unauthenticated", async () => {
    const { GET, PUT } = await loadRoute();
    delete process.env.ADMIN_INGEST_ENABLED;
    const disabled = await GET(
      new Request("http://localhost/api/admin/archive/curated"),
    );
    assert.equal(disabled.status, 403);

    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    const anonymous = await PUT(putRequest({ slug: VALI, visible: false }, false));
    assert.equal(anonymous.status, 401);
    assert.equal(puts.length, 0);
  });

  it("GET returns the stored visibility for each curated work", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    curatedMode = { kind: "entries", hidden: [AAZH] };
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/admin/archive/curated", {
        headers: testAdminAuthHeaders(),
      }),
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      entries: Array<{ slug: string; visible: boolean }>;
    };
    assert.deepEqual(
      data.entries.map((e) => [e.slug, e.visible]),
      [
        [CROWN, true],
        [VALI, true],
        [AAZH, false],
      ],
    );
  });

  it("GET reports 503 instead of guessing when visibility is unknown", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    curatedMode = { kind: "status", status: 503 };
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/admin/archive/curated", {
        headers: testAdminAuthHeaders(),
      }),
    );
    assert.equal(res.status, 503);
  });

  it("PUT forwards the change with the admin login", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    const { PUT } = await loadRoute();
    const res = await PUT(putRequest({ slug: VALI, visible: false }));
    assert.equal(res.status, 200);
    assert.deepEqual(puts, [
      {
        path: `/admin/curated-visibility/${VALI}`,
        body: { visible: false, updatedBy: "curator" },
      },
    ]);
  });

  it("PUT rejects non-curated slugs and non-boolean values", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    const { PUT } = await loadRoute();
    const unknown = await PUT(putRequest({ slug: D1_SLUG, visible: false }));
    assert.equal(unknown.status, 400);
    const bad = await PUT(putRequest({ slug: VALI, visible: "false" }));
    assert.equal(bad.status, 400);
    assert.equal(puts.length, 0);
  });
});
