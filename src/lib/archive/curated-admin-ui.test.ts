import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { CuratedSection } from "../../components/admin/CuratedSection.tsx";
import {
  curatedVisibilityPrompt,
  submitCuratedVisibility,
} from "../../components/admin/CuratedVisibilityToggle.tsx";
import worker from "../../../workers/archive-api/src/index.ts";
import { openMemoryDb } from "../../../workers/archive-api/src/sqlite.ts";
import type { Env } from "../../../workers/archive-api/src/types.ts";
import { archiveArtworks } from "../content/artworks";
import {
  getArtworkBySlugDetailed,
  listAllArchiveSlugs,
  listAllArtworks,
} from "../content/resolve-artwork";
import { loadCuratedVisibility, type CuratedVisibility } from "./curated";
import { runWithRepoRoot } from "./paths";
import { ensureTestAdminSessionSecret, mintTestAdminBearer } from "./admin-test-auth";

const CROWN = "the-one-who-is-crown-among-the-kings";
const VALI = "valiroopam";
const AAZH = "aazhmaarrattam";
const ALL = [CROWN, VALI, AAZH];

const stubRouter = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
  hmrRefresh() {},
};

function renderSection(visibility: CuratedVisibility): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: stubRouter as never },
      createElement(CuratedSection, { visibility }),
    ),
  );
}

type Card = {
  state: string;
  title: string;
  changed: string | null;
  button: string | null;
  ariaLabel: string | null;
  viewHref: string | null;
};

/** One card per curated work, keyed by slug, parsed from the rendered markup. */
function cards(html: string): Map<string, Card> {
  const out = new Map<string, Card>();
  for (const li of html.split("<li").slice(1)) {
    const slug = ALL.find((s) => li.includes(`>${s}`));
    assert.ok(slug, "card without a curated slug");
    const text = li.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    out.set(slug, {
      state: /Curated \(repository\) · (\w+)/.exec(text)?.[1] ?? "",
      title: archiveArtworks.find((a) => a.id === slug)!.metadata.title,
      changed: /changed (\S+ by \S+|\S+)/.exec(text)?.[1] ?? null,
      button: /<button[^>]*>([^<]*)<\/button>/.exec(li)?.[1] ?? null,
      ariaLabel: /aria-label="([^"]+)"/.exec(li)?.[1] ?? null,
      viewHref: /href="(\/archive\/[^"]+)"/.exec(li)?.[1] ?? null,
    });
  }
  return out;
}

function knownVisibility(
  hidden: string[],
  changed: Record<string, { at: string; by: string | null }> = {},
): CuratedVisibility {
  return {
    known: true,
    visible: new Set(ALL.filter((s) => !hidden.includes(s))),
    entries: ALL.map((slug) => ({
      slug,
      visible: !hidden.includes(slug),
      updatedAt: changed[slug]?.at ?? null,
      updatedBy: changed[slug]?.by ?? null,
    })),
  };
}

describe("Admin: curated originals section", () => {
  it("lists all three works with their titles and slugs", () => {
    const html = renderSection(knownVisibility([]));
    const byslug = cards(html);
    assert.deepEqual([...byslug.keys()].sort(), [...ALL].sort());
    for (const work of archiveArtworks) {
      assert.ok(html.includes(work.metadata.title), work.metadata.title);
    }
  });

  it("each work reflects its own state and offers the opposite action", () => {
    const byslug = cards(
      renderSection(
        knownVisibility([VALI], {
          [VALI]: { at: "2026-09-29T10:00:00.000Z", by: "curator" },
        }),
      ),
    );
    assert.deepEqual(byslug.get(VALI), {
      state: "hidden",
      title: byslug.get(VALI)!.title,
      changed: "2026-09-29 by curator",
      button: "Show",
      ariaLabel: "Show curated work",
      viewHref: null,
    });
    for (const slug of [CROWN, AAZH]) {
      const card = byslug.get(slug)!;
      assert.equal(card.state, "visible", slug);
      assert.equal(card.button, "Hide", slug);
      assert.equal(card.ariaLabel, "Hide curated work", slug);
      assert.equal(card.viewHref, `/archive/${slug}`, slug);
      assert.equal(card.changed, null, slug);
    }
  });

  it("all three hidden: three Show actions and no public links", () => {
    const byslug = cards(renderSection(knownVisibility(ALL)));
    for (const slug of ALL) {
      assert.equal(byslug.get(slug)?.state, "hidden");
      assert.equal(byslug.get(slug)?.button, "Show");
      assert.equal(byslug.get(slug)?.viewHref, null);
    }
  });

  it("a change without an author shows only the date", () => {
    const byslug = cards(
      renderSection(
        knownVisibility([AAZH], { [AAZH]: { at: "2026-09-28T08:00:00.000Z", by: null } }),
      ),
    );
    assert.equal(byslug.get(AAZH)?.changed, "2026-09-28");
  });

  it("unknown visibility: states are unknown, no toggles, no links, reason shown", () => {
    const html = renderSection({ known: false, reason: "Archive Worker error 503" });
    assert.match(html, /Visibility unavailable \(Archive Worker error 503\)/);
    assert.match(html, /hidden publicly until the Worker responds/);
    assert.doesNotMatch(html, /<button/);
    for (const card of cards(html).values()) {
      assert.equal(card.state, "unknown");
      assert.equal(card.viewHref, null);
    }
  });
});

describe("Admin: curated visibility toggle request", () => {
  const originalFetch = globalThis.fetch;
  let calls: Array<{ url: string; init?: RequestInit }> = [];

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function respondWith(res: () => Response | Promise<Response>) {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return res();
    }) as typeof fetch;
  }

  it("sends one PUT with the slug, the new state and the session cookie", async () => {
    respondWith(() => Response.json({ entry: {} }));
    await submitCuratedVisibility(VALI, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/admin/archive/curated");
    assert.equal(calls[0].init?.method, "PUT");
    assert.equal(calls[0].init?.credentials, "include");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      slug: VALI,
      visible: false,
    });
  });

  it("surfaces the server's error when the session is missing or expired", async () => {
    respondWith(() =>
      Response.json({ error: "Admin authentication required" }, { status: 401 }),
    );
    await assert.rejects(submitCuratedVisibility(AAZH, true), /Admin authentication required/);
  });

  it("surfaces Worker unavailability", async () => {
    respondWith(() =>
      Response.json({ error: "Archive Worker error 503" }, { status: 503 }),
    );
    await assert.rejects(submitCuratedVisibility(AAZH, true), /Archive Worker error 503/);
  });

  it("does not treat a non-JSON error page as success", async () => {
    respondWith(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await assert.rejects(submitCuratedVisibility(CROWN, false), /Update failed/);
  });

  it("the confirmation prompt names the action being taken", () => {
    assert.match(curatedVisibilityPrompt(false), /^Hide /);
    assert.match(curatedVisibilityPrompt(false), /kept/);
    assert.match(curatedVisibilityPrompt(true), /^Show /);
  });
});

describe("Admin toggle -> Next route -> Worker -> D1 -> public site", () => {
  const WORKER = "https://worker.chain";
  const TOKEN = "chain-worker-token";
  const ENV_KEYS = [
    "ARCHIVE_WORKER_URL",
    "ARCHIVE_WORKER_TOKEN",
    "ARCHIVE_PREFER_GITHUB_STORE",
    "ADMIN_INGEST_ENABLED",
    "ADMIN_SESSION_SECRET",
  ] as const;
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;

  let root = "";
  let memory: ReturnType<typeof openMemoryDb>;
  let session: string | null = null;
  let route: {
    GET: (request: Request) => Promise<Response>;
    PUT: (request: Request) => Promise<Response>;
  };
  let sitemap: () => Promise<Array<{ url: string }>>;

  function workerEnv(): Env {
    const db = memory.db;
    return {
      DB: {
        prepare(query: string) {
          const prepared = db.prepare(query);
          return {
            bind(...values: unknown[]) {
              const bound = prepared.bind(...values);
              return {
                first: bound.first.bind(bound),
                all: bound.all.bind(bound),
                run: bound.run.bind(bound),
              };
            },
          };
        },
      },
      WORKER_ADMIN_TOKEN: TOKEN,
    } as unknown as Env;
  }

  function storedRows() {
    const rows = memory.raw
      .prepare("SELECT slug, visible, updated_by FROM curated_visibility ORDER BY slug")
      .all() as Array<{ slug: string; visible: number; updated_by: string | null }>;
    return rows.map((r) => ({ ...r }));
  }

  async function publicState() {
    return runWithRepoRoot(root, async () => {
      const detail: Record<string, boolean> = {};
      for (const slug of ALL) {
        detail[slug] = Boolean((await getArtworkBySlugDetailed(slug)).artwork);
      }
      return {
        listed: (await listAllArtworks()).artworks.map((a) => a.id),
        slugs: await listAllArchiveSlugs(),
        sitemap: (await sitemap())
          .map((e) => e.url)
          .filter((u) => u.includes("/archive/"))
          .map((u) => u.split("/archive/")[1]),
        detail,
      };
    });
  }

  async function adminCards() {
    return cards(renderSection(await loadCuratedVisibility()));
  }

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "anek-curated-chain-"));
    route = await import(
      pathToFileURL(path.join(process.cwd(), "src/app/api/admin/archive/curated/route.ts")).href
    );
    sitemap = (
      await import(pathToFileURL(path.join(process.cwd(), "src/app/sitemap.ts")).href)
    ).default;
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    process.env.ARCHIVE_WORKER_URL = WORKER;
    process.env.ARCHIVE_WORKER_TOKEN = TOKEN;
    delete process.env.ARCHIVE_PREFER_GITHUB_STORE;
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    session = mintTestAdminBearer({ login: "curator", method: "oauth" });
    memory = openMemoryDb();
    console.warn = () => {};
    const env = workerEnv();

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      if (href.startsWith("/api/admin/archive/curated")) {
        const headers = new Headers(init?.headers);
        if (session) {
          headers.set("cookie", `anek_admin_session=${encodeURIComponent(session)}`);
        }
        const request = new Request(`http://localhost${href}`, {
          method: init?.method,
          headers,
          body: init?.body,
        });
        return init?.method === "PUT" ? route.PUT(request) : route.GET(request);
      }
      if (href.startsWith(WORKER)) {
        return worker.fetch(new Request(href, init), env);
      }
      throw new Error(`Unexpected fetch: ${href}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    memory.raw.close();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("defaults to visible with no stored rows", async () => {
    assert.deepEqual(storedRows(), []);
    const state = await publicState();
    assert.deepEqual(state.listed, ALL);
    assert.deepEqual(state.sitemap, ALL);
    for (const card of (await adminCards()).values()) {
      assert.equal(card.state, "visible");
      assert.equal(card.button, "Hide");
    }
  });

  it("hiding and showing each work independently is stored and reflected everywhere", async () => {
    await submitCuratedVisibility(VALI, false);
    assert.deepEqual(storedRows(), [{ slug: VALI, visible: 0, updated_by: "curator" }]);
    let state = await publicState();
    assert.deepEqual(state.listed, [CROWN, AAZH]);
    assert.deepEqual(state.slugs, [CROWN, AAZH]);
    assert.deepEqual(state.sitemap, [CROWN, AAZH]);
    assert.deepEqual(state.detail, { [CROWN]: true, [VALI]: false, [AAZH]: true });
    let admin = await adminCards();
    assert.equal(admin.get(VALI)?.state, "hidden");
    assert.equal(admin.get(VALI)?.button, "Show");
    assert.match(admin.get(VALI)?.changed ?? "", / by curator$/);
    assert.equal(admin.get(CROWN)?.state, "visible");

    await submitCuratedVisibility(AAZH, false);
    state = await publicState();
    assert.deepEqual(state.listed, [CROWN]);
    assert.deepEqual(state.detail, { [CROWN]: true, [VALI]: false, [AAZH]: false });

    await submitCuratedVisibility(CROWN, false);
    state = await publicState();
    assert.deepEqual(state.listed, []);
    assert.deepEqual(state.sitemap, []);

    await submitCuratedVisibility(VALI, true);
    state = await publicState();
    assert.deepEqual(state.listed, [VALI]);
    admin = await adminCards();
    assert.equal(admin.get(VALI)?.state, "visible");
    assert.equal(admin.get(AAZH)?.state, "hidden");
    assert.equal(admin.get(CROWN)?.state, "hidden");

    await submitCuratedVisibility(CROWN, true);
    await submitCuratedVisibility(AAZH, true);
    state = await publicState();
    assert.deepEqual(state.listed, ALL);
    assert.deepEqual(
      storedRows().map((r) => [r.slug, r.visible]),
      [
        [AAZH, 1],
        [CROWN, 1],
        [VALI, 1],
      ],
    );
  });

  it("without a session the toggle fails, nothing is stored, and the site is unchanged", async () => {
    session = null;
    await assert.rejects(submitCuratedVisibility(CROWN, false), /Admin authentication required/);
    assert.deepEqual(storedRows(), []);
    assert.deepEqual((await publicState()).listed, ALL);
  });

  it("an expired session is rejected the same way", async () => {
    const { signAdminSession } = await import("./admin-session");
    session = signAdminSession({
      sub: "42",
      login: "curator",
      method: "oauth",
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await assert.rejects(submitCuratedVisibility(VALI, false), /Admin authentication required/);
    assert.deepEqual(storedRows(), []);
  });

  it("a Next deployment with the wrong Worker token cannot change or read visibility", async () => {
    process.env.ARCHIVE_WORKER_TOKEN = "stale-token";
    await assert.rejects(submitCuratedVisibility(VALI, false), /Unauthorized|401/);
    assert.deepEqual(storedRows(), []);
    const state = await publicState();
    assert.deepEqual(state.listed, [], "unknown visibility hides every curated work");
    const admin = await adminCards();
    for (const card of admin.values()) assert.equal(card.state, "unknown");
  });
});
