import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import {
  getAccessionRuntimeBySlug,
  getArchiveEntryBySlug,
  getArtworkBySlugDetailed,
  listAllArchiveSlugs,
  listAllArtworks,
} from "../content/resolve-artwork";
import { runWithRepoRoot } from "./paths";
import { ARCHIVE_VERSION, type DraftStatus } from "./schema";

const WORKER = "https://worker.test";
const LEGACY_ID = "valiroopam";

type WorkerMode = "unavailable" | "network" | "not_found" | "empty";

function entryJson(slug: string, status: DraftStatus) {
  return {
    version: ARCHIVE_VERSION,
    slug,
    status,
    metadata: {
      title: `Local ${slug}`,
      date: "2026-01-01",
      accessionId: "AR-2026-0001",
    },
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
  };
}

const LOCAL: Array<[string, DraftStatus]> = [
  ["local-published", "published"],
  ["local-generated", "generated"],
  ["local-hidden", "hidden"],
  ["local-withdrawn", "withdrawn"],
];

let root = "";
let mode: WorkerMode = "unavailable";
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const ENV_KEYS = [
  "ARCHIVE_WORKER_URL",
  "ARCHIVE_WORKER_TOKEN",
  "ARCHIVE_PREFER_GITHUB_STORE",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

async function writeEntry(slug: string, status: DraftStatus) {
  const dir = path.join(root, "content", "archive", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(entryJson(slug, status)),
  );
}

function inRoot<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRepoRoot(root, fn);
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "anek-fallback-"));
  for (const [slug, status] of LOCAL) await writeEntry(slug, status);
  await writeEntry(LEGACY_ID, "hidden");
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
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== WORKER) {
      throw new Error(`Unexpected non-Worker fetch: ${url.href}`);
    }
    if (mode === "network") throw new TypeError("fetch failed");
    if (mode === "unavailable") {
      return Response.json({ error: "Service Unavailable" }, { status: 503 });
    }
    if (url.pathname === "/public/artworks") {
      return Response.json({ artworks: [], total: 0 });
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

describe("Worker unavailable: local fallback visibility", () => {
  for (const workerMode of ["unavailable", "network"] as const) {
    for (const slug of ["local-hidden", "local-withdrawn"]) {
      it(`${workerMode}: ${slug} is not served`, async () => {
        mode = workerMode;
        const detail = await inRoot(() => getArtworkBySlugDetailed(slug));
        assert.equal(detail.artwork, undefined);
        assert.equal(detail.fallbackActive, false);
        assert.equal(await inRoot(() => getArchiveEntryBySlug(slug)), null);
        assert.equal(await inRoot(() => getAccessionRuntimeBySlug(slug)), null);
      });
    }

    for (const slug of ["local-published", "local-generated"]) {
      it(`${workerMode}: ${slug} remains eligible`, async () => {
        mode = workerMode;
        const detail = await inRoot(() => getArtworkBySlugDetailed(slug));
        assert.equal(detail.artwork?.id, slug);
        assert.equal(detail.fallbackActive, true);
        assert.ok(detail.fallbackReason);
        assert.equal((await inRoot(() => getArchiveEntryBySlug(slug)))?.slug, slug);
        assert.equal(
          (await inRoot(() => getAccessionRuntimeBySlug(slug)))?.visibility.public,
          true,
        );
      });
    }
  }

  it("a hidden local copy does not fall through to a same-slug placeholder", async () => {
    mode = "unavailable";
    const detail = await inRoot(() => getArtworkBySlugDetailed(LEGACY_ID));
    assert.equal(detail.artwork, undefined);
    assert.equal(detail.fallbackActive, false);
  });

  it("a legacy placeholder with no local copy is still served", async () => {
    mode = "unavailable";
    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-fallback-empty-"));
    try {
      const detail = await runWithRepoRoot(emptyRoot, () =>
        getArtworkBySlugDetailed(LEGACY_ID),
      );
      assert.equal(detail.artwork?.id, LEGACY_ID);
      assert.equal(detail.fallbackActive, true);
    } finally {
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });
});

describe("Worker reachable: no local fallback", () => {
  it("Worker 404 stays not-found even when a public local copy exists", async () => {
    mode = "not_found";
    const detail = await inRoot(() => getArtworkBySlugDetailed("local-published"));
    assert.equal(detail.artwork, undefined);
    assert.equal(detail.fallbackActive, false);
    assert.equal(await inRoot(() => getArchiveEntryBySlug("local-published")), null);
    assert.equal(await inRoot(() => getAccessionRuntimeBySlug("local-published")), null);
  });

  it("Worker 404 does not substitute a legacy placeholder", async () => {
    mode = "not_found";
    const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-fallback-empty-"));
    try {
      const detail = await runWithRepoRoot(emptyRoot, () =>
        getArtworkBySlugDetailed(LEGACY_ID),
      );
      assert.equal(detail.artwork, undefined);
      assert.equal(detail.fallbackActive, false);
    } finally {
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("a valid empty Worker list returns empty with no placeholders", async () => {
    mode = "empty";
    const listed = await inRoot(() => listAllArtworks());
    assert.deepEqual(listed.artworks, []);
    assert.equal(listed.total, 0);
    assert.equal(listed.fallbackActive, undefined);
    assert.deepEqual(await inRoot(() => listAllArchiveSlugs()), []);
  });
});
