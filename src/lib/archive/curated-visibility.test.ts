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
import { ARCHIVE_VERSION } from "./schema";
import { signAdminSession } from "./admin-session";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
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
  | { kind: "malformed" }
  | { kind: "payload"; body: unknown }
  | { kind: "text"; body: string };

let curatedMode: CuratedMode = { kind: "entries", hidden: [] };
let listMode: "ok" | "unavailable" = "ok";
let putMode: "ok" | { status: number } = "ok";
let d1Works: Array<{ slug: string; title: string; year?: number }> = [];
let puts: Array<{ path: string; body: unknown }> = [];
let requests: string[] = [];
let root = "";

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const ENV_KEYS = [
  "ARCHIVE_WORKER_URL",
  "ARCHIVE_WORKER_TOKEN",
  "ARCHIVE_PREFER_GITHUB_STORE",
  "ADMIN_INGEST_ENABLED",
  "ADMIN_SESSION_SECRET",
  "ADMIN_INGEST_SECRET",
  "ADMIN_INGEST_ALLOW_SECRET",
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
  putMode = "ok";
  d1Works = [{ slug: D1_SLUG, title: "Hold Tight", year: 2026 }];
  puts = [];
  requests = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== WORKER) {
      throw new Error(`Unexpected non-Worker fetch: ${url.href}`);
    }
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/admin/curated-visibility") {
      if (curatedMode.kind === "network") throw new TypeError("fetch failed");
      if (curatedMode.kind === "status") {
        return Response.json({ error: "x" }, { status: curatedMode.status });
      }
      if (curatedMode.kind === "malformed") {
        return Response.json({ artworks: [] });
      }
      if (curatedMode.kind === "payload") {
        return Response.json(curatedMode.body);
      }
      if (curatedMode.kind === "text") {
        return new Response(curatedMode.body, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
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
      if (putMode !== "ok") {
        return Response.json({ error: "Worker refused" }, { status: putMode.status });
      }
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

const ALL_CURATED = [CROWN, VALI, AAZH];
const SITE = "https://anekaroopam.art";

async function sitemapArchiveSlugs(): Promise<string[]> {
  const mod = (await import(
    pathToFileURL(path.join(process.cwd(), "src/app/sitemap.ts")).href
  )) as { default: () => Promise<Array<{ url: string }>> };
  const urls = (await inRoot(() => mod.default())).map((e) => e.url);
  assert.ok(urls.includes(SITE) && urls.includes(`${SITE}/archive`));
  return urls
    .filter((u) => u.startsWith(`${SITE}/archive/`))
    .map((u) => u.slice(`${SITE}/archive/`.length));
}

type DetailPage = {
  default: (props: { params: Promise<{ slug: string }> }) => Promise<unknown>;
  generateMetadata: (props: {
    params: Promise<{ slug: string }>;
  }) => Promise<{ title?: unknown }>;
};

async function loadDetailPage(): Promise<DetailPage> {
  return (await import(
    pathToFileURL(
      path.join(process.cwd(), "src/app/(site)/archive/[slug]/page.tsx"),
    ).href
  )) as DetailPage;
}

async function detailPageStatus(slug: string): Promise<200 | 404> {
  const page = await loadDetailPage();
  try {
    await inRoot(() => page.default({ params: Promise.resolve({ slug }) }));
    return 200;
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.includes("404")) return 404;
    throw err;
  }
}

async function publicSurface() {
  const listed = await inRoot(() => listAllArtworks());
  const detail: Record<string, boolean> = {};
  for (const slug of ALL_CURATED) {
    detail[slug] = Boolean((await inRoot(() => getArtworkBySlugDetailed(slug))).artwork);
  }
  return {
    listed: listed.artworks.map((a) => a.id),
    slugs: await inRoot(() => listAllArchiveSlugs()),
    sitemap: await sitemapArchiveSlugs(),
    detail,
  };
}

describe("Worker mode: every visibility combination of the three works", () => {
  const combos: string[][] = [];
  for (let mask = 0; mask < 8; mask++) {
    combos.push(ALL_CURATED.filter((_, i) => mask & (1 << i)));
  }
  for (const hidden of combos) {
    const label = hidden.length ? `hidden: ${hidden.join(", ")}` : "none hidden";
    it(`${label} -> list, sitemap and detail agree`, async () => {
      curatedMode = { kind: "entries", hidden };
      const shown = ALL_CURATED.filter((s) => !hidden.includes(s));
      const surface = await publicSurface();
      assert.deepEqual(surface.listed, [D1_SLUG, ...shown]);
      assert.deepEqual(surface.slugs, [D1_SLUG, ...shown]);
      assert.deepEqual(surface.sitemap, [D1_SLUG, ...shown]);
      for (const slug of ALL_CURATED) {
        assert.equal(surface.detail[slug], shown.includes(slug), slug);
      }
    });
  }
});

describe("Worker mode: public routes", () => {
  it("the sitemap route lists visible works and omits hidden ones", async () => {
    curatedMode = { kind: "entries", hidden: [CROWN] };
    assert.deepEqual(await sitemapArchiveSlugs(), [D1_SLUG, VALI, AAZH]);
  });

  it("the sitemap omits every curated work while visibility is unknown", async () => {
    curatedMode = { kind: "status", status: 503 };
    assert.deepEqual(await sitemapArchiveSlugs(), [D1_SLUG]);
  });

  it("the detail page renders a visible work and 404s a hidden one", async () => {
    curatedMode = { kind: "entries", hidden: [AAZH] };
    assert.equal(await detailPageStatus(VALI), 200);
    assert.equal(await detailPageStatus(CROWN), 200);
    assert.equal(await detailPageStatus(AAZH), 404);
  });

  it("the detail page 404s every curated work while visibility is unknown", async () => {
    curatedMode = { kind: "network" };
    for (const slug of ALL_CURATED) {
      assert.equal(await detailPageStatus(slug), 404, slug);
    }
  });

  it("hidden works get a Not found title instead of their metadata", async () => {
    curatedMode = { kind: "entries", hidden: [VALI] };
    const page = await loadDetailPage();
    const hidden = await inRoot(() =>
      page.generateMetadata({ params: Promise.resolve({ slug: VALI }) }),
    );
    assert.equal(hidden.title, "Not found");
    const shown = await inRoot(() =>
      page.generateMetadata({ params: Promise.resolve({ slug: CROWN }) }),
    );
    assert.equal(
      shown.title,
      archiveArtworks.find((a) => a.id === CROWN)?.metadata.title,
    );
  });

  it("curated detail never asks the Worker for a D1 artwork with that slug", async () => {
    for (const slug of ALL_CURATED) {
      await inRoot(() => getArtworkBySlugDetailed(slug));
      await inRoot(() => getArchiveEntryBySlug(slug));
      await inRoot(() => getAccessionRuntimeBySlug(slug));
    }
    assert.ok(
      requests.every((r) => !r.startsWith("GET /public/artworks/")),
      requests.join("\n"),
    );
  });

  it("D1 works keep their R2 images while curated works use repository images", async () => {
    const listed = await inRoot(() => listAllArtworks());
    const byId = new Map(listed.artworks.map((a) => [a.id, a]));
    assert.equal(byId.get(D1_SLUG)?.imageSrc, `https://media.test/${D1_SLUG}/thumb.jpg`);
    for (const work of archiveArtworks) {
      assert.equal(byId.get(work.id)?.imageSrc, work.imageSrc);
      assert.ok(work.imageSrc.startsWith("/artworks/"), work.imageSrc);
    }
  });
});

describe("Worker mode: visibility payload validation", () => {
  const entry = (slug: string, visible: unknown) => ({
    slug,
    visible,
    updatedAt: null,
    updatedBy: null,
  });
  const failClosed: Array<[string, CuratedMode]> = [
    ["an HTML page with status 200", { kind: "text", body: "<html>login</html>" }],
    ["an empty body", { kind: "text", body: "" }],
    ["entries that is not an array", { kind: "payload", body: { entries: { valiroopam: true } } }],
    ["visible given as a string", { kind: "payload", body: { entries: ALL_CURATED.map((s) => entry(s, "true")) } }],
    ["an entry without a slug", { kind: "payload", body: { entries: [{ visible: true }] } }],
    ["a null payload", { kind: "payload", body: null }],
    ["401 from a wrong Worker token", { kind: "status", status: 401 }],
    ["500 from the Worker", { kind: "status", status: 500 }],
  ];
  for (const [label, mode] of failClosed) {
    it(`${label}: every curated work is hidden`, async () => {
      curatedMode = mode;
      const surface = await publicSurface();
      assert.deepEqual(surface.listed, [D1_SLUG]);
      assert.deepEqual(surface.sitemap, [D1_SLUG]);
      assert.deepEqual(Object.values(surface.detail), [false, false, false]);
    });
  }

  it("a work the Worker does not report stays hidden", async () => {
    curatedMode = {
      kind: "payload",
      body: { entries: [entry(CROWN, true), entry(AAZH, true)] },
    };
    const surface = await publicSurface();
    assert.deepEqual(surface.listed, [D1_SLUG, CROWN, AAZH]);
    assert.equal(surface.detail[VALI], false);
  });

  it("an empty entries list hides every curated work", async () => {
    curatedMode = { kind: "payload", body: { entries: [] } };
    const surface = await publicSurface();
    assert.deepEqual(surface.listed, [D1_SLUG]);
  });

  it("unknown slugs in the payload are ignored", async () => {
    curatedMode = {
      kind: "payload",
      body: {
        entries: [...ALL_CURATED.map((s) => entry(s, true)), entry("not-curated", true)],
      },
    };
    const surface = await publicSurface();
    assert.deepEqual(surface.listed, [D1_SLUG, CROWN, VALI, AAZH]);
    assert.ok(!surface.sitemap.includes("not-curated"));
  });
});

describe("Worker outage: local fallback never resurrects a curated work", () => {
  let fallbackRoot = "";
  const LOCAL_D1 = "local-published";

  async function writeLocalEntry(slug: string) {
    const dir = path.join(fallbackRoot, "content", "archive", slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "metadata.json"),
      JSON.stringify({
        version: ARCHIVE_VERSION,
        slug,
        status: "published",
        metadata: { title: `Local ${slug}`, date: "2026-01-01", accessionId: "AR-2026-0001" },
        assets: {
          artwork: `/archive/${slug}/artwork.avif`,
          preview: `/archive/${slug}/preview.avif`,
          social: `/archive/${slug}/social.jpg`,
          thumb: `/archive/${slug}/thumb.jpg`,
        },
        perception: { states: [], background: "black" },
        export: {},
        provenance: { mint: [], auction: [], marketplace: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  }

  before(async () => {
    fallbackRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-curated-fallback-"));
    for (const slug of [LOCAL_D1, ...ALL_CURATED]) await writeLocalEntry(slug);
  });

  after(async () => {
    await fs.rm(fallbackRoot, { recursive: true, force: true });
  });

  const outages: Array<[string, CuratedMode]> = [
    ["visibility explicitly hidden", { kind: "entries", hidden: [...ALL_CURATED] }],
    ["visibility unavailable", { kind: "status", status: 503 }],
    ["visibility unreachable", { kind: "network" }],
  ];
  for (const [label, mode] of outages) {
    it(`${label}: published local copies of curated slugs are not served`, async () => {
      listMode = "unavailable";
      curatedMode = mode;
      await runWithRepoRoot(fallbackRoot, async () => {
        const control = await getArtworkBySlugDetailed(LOCAL_D1);
        assert.equal(control.artwork?.id, LOCAL_D1, "local fallback must be active");
        assert.equal(control.fallbackActive, true);

        for (const slug of ALL_CURATED) {
          const detail = await getArtworkBySlugDetailed(slug);
          assert.equal(detail.artwork, undefined, slug);
          assert.equal(detail.fallbackActive, false, slug);
          assert.equal(await getArchiveEntryBySlug(slug), null, slug);
          assert.equal(await getAccessionRuntimeBySlug(slug), null, slug);
        }
        const listed = await listAllArtworks();
        assert.ok(!listed.artworks.some((a) => ALL_CURATED.includes(a.id)));
        const slugs = await listAllArchiveSlugs();
        assert.ok(!slugs.some((s) => ALL_CURATED.includes(s)));
      });
    });
  }
});

describe("Worker outage and recovery", () => {
  it("a hidden work stays hidden through an outage and after recovery", async () => {
    curatedMode = { kind: "entries", hidden: [VALI] };
    const beforeOutage = await publicSurface();
    assert.deepEqual(beforeOutage.listed, [D1_SLUG, CROWN, AAZH]);

    curatedMode = { kind: "status", status: 404 };
    const during = await publicSurface();
    assert.deepEqual(during.listed, [D1_SLUG]);
    assert.deepEqual(during.sitemap, [D1_SLUG]);
    assert.deepEqual(Object.values(during.detail), [false, false, false]);

    listMode = "unavailable";
    curatedMode = { kind: "network" };
    const fullOutage = await publicSurface();
    assert.deepEqual(fullOutage.listed, []);
    assert.deepEqual(Object.values(fullOutage.detail), [false, false, false]);

    listMode = "ok";
    curatedMode = { kind: "entries", hidden: [VALI] };
    const recovered = await publicSurface();
    assert.deepEqual(recovered.listed, [D1_SLUG, CROWN, AAZH]);
    assert.deepEqual(recovered.sitemap, [D1_SLUG, CROWN, AAZH]);
    assert.deepEqual(recovered.detail, { [CROWN]: true, [VALI]: false, [AAZH]: true });
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

  it("PUT rejects a body that is not JSON", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    const { PUT } = await loadRoute();
    const res = await PUT(
      new Request("http://localhost/api/admin/archive/curated", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...testAdminAuthHeaders() },
        body: "slug=valiroopam&visible=false",
      }),
    );
    assert.equal(res.status, 400);
    assert.equal(puts.length, 0);
  });

  describe("authentication failures never reach the Worker", () => {
    type Case = [label: string, headers: () => Record<string, string>, status: number];
    const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
    const cases: Case[] = [
      ["no credentials", () => ({}), 401],
      [
        "an expired session",
        () =>
          bearer(
            signAdminSession({
              sub: "1",
              login: "curator",
              method: "oauth",
              exp: Math.floor(Date.now() / 1000) - 60,
            }),
          ),
        401,
      ],
      [
        "a tampered session",
        () => bearer(`${mintTestAdminBearer({ login: "curator" }).split(".")[0]}.forged`),
        401,
      ],
      [
        "a session signed with another secret",
        () => {
          const token = mintTestAdminBearer({ login: "curator" });
          process.env.ADMIN_SESSION_SECRET = "rotated-secret";
          return bearer(token);
        },
        401,
      ],
      [
        "the raw ingest secret instead of a session",
        () => {
          process.env.ADMIN_INGEST_SECRET = "raw-ingest-secret";
          return bearer("raw-ingest-secret");
        },
        401,
      ],
      [
        "a forged session cookie",
        () => ({ cookie: "anek_admin_session=forged.value" }),
        401,
      ],
      [
        "a valid session while admin is disabled",
        () => {
          const headers = testAdminAuthHeaders({ login: "curator" });
          process.env.ADMIN_INGEST_ENABLED = "false";
          return headers;
        },
        403,
      ],
    ];

    for (const [label, headers, status] of cases) {
      it(`${label}: GET and PUT return ${status} with no data`, async () => {
        process.env.ADMIN_INGEST_ENABLED = "true";
        ensureTestAdminSessionSecret();
        const { GET, PUT } = await loadRoute();
        const h = headers();

        const get = await GET(
          new Request("http://localhost/api/admin/archive/curated", { headers: h }),
        );
        const put = await PUT(
          new Request("http://localhost/api/admin/archive/curated", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...h },
            body: JSON.stringify({ slug: VALI, visible: false }),
          }),
        );
        for (const res of [get, put]) {
          assert.equal(res.status, status);
          const body = (await res.json()) as Record<string, unknown>;
          assert.equal(typeof body.error, "string");
          assert.equal(body.entries, undefined);
          assert.equal(body.entry, undefined);
        }
        assert.deepEqual(requests, [], "the Worker must not be called");
        assert.deepEqual(puts, []);
      });
    }
  });

  it("PUT reports the Worker's refusal instead of claiming success", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    const { PUT } = await loadRoute();
    for (const status of [401, 503]) {
      putMode = { status };
      const res = await PUT(putRequest({ slug: AAZH, visible: false }));
      assert.equal(res.status, status);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.error, "Worker refused");
      assert.equal(body.entry, undefined);
    }
  });

  it("PUT fails with a server error when the Worker is unreachable", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    const { PUT } = await loadRoute();
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      const res = await PUT(putRequest({ slug: AAZH, visible: false }));
      assert.ok(res.status >= 500, String(res.status));
      assert.equal(((await res.json()) as { entry?: unknown }).entry, undefined);
    } finally {
      globalThis.fetch = saved;
    }
  });

  it("GET and PUT require Worker mode", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    delete process.env.ARCHIVE_WORKER_URL;
    delete process.env.ARCHIVE_WORKER_TOKEN;
    const { GET, PUT } = await loadRoute();
    const get = await GET(
      new Request("http://localhost/api/admin/archive/curated", {
        headers: testAdminAuthHeaders(),
      }),
    );
    assert.equal(get.status, 503);
    const put = await PUT(putRequest({ slug: VALI, visible: false }));
    assert.equal(put.status, 503);
    assert.deepEqual(requests, []);
  });
});
