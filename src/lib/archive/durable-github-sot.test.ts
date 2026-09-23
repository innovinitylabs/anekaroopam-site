import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import {
  clearGitReadCache,
  setGitReadHookForTests,
} from "../github/git-read.ts";
import {
  setArchiveGitHubMetadataPushHookForTests,
  setArchiveGitHubPushHookForTests,
  syncArchiveEntryToGitHub,
  validateArchiveBundleOnGitHub,
} from "../github/publish-entry.ts";
import { setGitCommitHookForTests } from "../github/git-commit.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
  type ProvenanceRecord,
} from "./schema.ts";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
  testAdminAuthHeaders,
} from "./admin-test-auth.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";

function entryFixture(slug: string, overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0199",
    slug,
    status: "published",
    metadata: {
      title: "Durable Mode Fixture",
      date: "2026-01-01",
      accessionId: "AR-2026-0199",
    },
    assets: {
      artwork: `/archive/${slug}/artwork.avif`,
      preview: `/archive/${slug}/preview.avif`,
      previewWebp: `/archive/${slug}/preview.webp`,
      social: `/archive/${slug}/social.jpg`,
      thumb: `/archive/${slug}/thumb.jpg`,
    },
    source: {
      kind: "original",
      originalFilename: "master.jpg",
      storedFilename: "master.jpg",
      mimeType: "image/jpeg",
      byteSize: 12,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    perception: { states: [], background: "black" },
    export: { standaloneHtml: "perception.html", includeWebpFallback: true },
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  });
}

function installMemoryGit(store: Map<string, Buffer>): void {
  setGitCommitHookForTests(async (input) => {
    for (const file of input.upserts ?? []) {
      store.set(
        file.path,
        typeof file.content === "string"
          ? Buffer.from(file.content)
          : file.content,
      );
    }
    for (const filePath of input.deletes ?? []) {
      store.delete(filePath);
    }
    return {
      commitSha: `sha-${store.size}`,
      paths: [
        ...(input.upserts?.map((file) => file.path) ?? []),
        ...(input.deletes ?? []),
      ],
    };
  });
  setGitReadHookForTests({
    listPaths: async () => [...store.keys()],
    readFile: async (filePath) => store.get(filePath) ?? null,
  });
}

function seedGitHubBundle(store: Map<string, Buffer>, slug: string): ArchiveEntry {
  const entry = entryFixture(slug);
  store.set(
    `content/archive/${slug}/metadata.json`,
    Buffer.from(`${JSON.stringify(entry, null, 2)}\n`),
  );
  store.set(
    `content/archive/${slug}/states.json`,
    Buffer.from("{}\n"),
  );
  for (const filename of canonicalPublicDerivativeFilenames()) {
    store.set(
      `public/archive/${slug}/${filename}`,
      Buffer.from(filename),
    );
  }
  return entry;
}

describe("durable-mode GitHub SoT paths", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  const previousEnv: Record<string, string | undefined> = {};

  before(async () => {
    for (const key of [
      "ADMIN_INGEST_ENABLED",
      "ADMIN_INGEST_SECRET",
      "GITHUB_ARCHIVE_TOKEN",
      "GITHUB_ARCHIVE_OWNER",
      "GITHUB_ARCHIVE_REPO",
      "GITHUB_ARCHIVE_DURABLE",
      "VERCEL",
    ]) {
      previousEnv[key] = process.env[key];
    }
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-durable-sot-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    setArchiveGitHubMetadataPushHookForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
    clearGitReadCache();
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  afterEach(() => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    setArchiveGitHubMetadataPushHookForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
    clearGitReadCache();
    delete process.env.GITHUB_ARCHIVE_DURABLE;
    delete process.env.VERCEL;
  });

  function enableDurableAdmin(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    ensureTestAdminSessionSecret();
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    process.env.GITHUB_ARCHIVE_DURABLE = "1";
  }

  it("visibility succeeds on durable mode when local metadata write is impossible", async () => {
    enableDurableAdmin();
    const store = new Map<string, Buffer>();
    installMemoryGit(store);
    const slug = "2026-01-01-vis-durable-ro";
    const entry = seedGitHubBundle(store, slug);

    // No local archive directory — saveArchiveEntry would fail if required.
    assert.equal(
      await fs
        .access(path.join(tmpRoot, "content", "archive", slug, "metadata.json"))
        .then(() => true)
        .catch(() => false),
      false,
    );

    setArchiveGitHubMetadataPushHookForTests(async (_s, message, metadataJson) => {
      assert.match(message, /hidden$/);
      store.set(
        `content/archive/${slug}/metadata.json`,
        Buffer.from(metadataJson),
      );
      return { commitSha: "sha-vis-durable" };
    });

    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/visibility/route.ts"),
    ).href;
    const { PATCH } = await import(href);
    const res = await PATCH(
      new Request(`http://localhost/api/admin/archive/${slug}/visibility`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${mintTestAdminBearer()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "hidden" }),
      }),
      { params: Promise.resolve({ slug }) },
    );

    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      entry: ArchiveEntry;
      commitSha?: string;
      githubSynced?: boolean;
    };
    assert.equal(data.githubSynced, true);
    assert.equal(data.commitSha, "sha-vis-durable");
    assert.equal(data.entry.status, "hidden");
    assert.ok(data.entry.hiddenAt);

    const tip = JSON.parse(
      store.get(`content/archive/${slug}/metadata.json`)!.toString("utf8"),
    ) as ArchiveEntry;
    assert.equal(tip.status, "hidden");
    assert.equal(entry.status, "published");
  });

  it("slug provenance persists via GitHub on durable mode without local files", async () => {
    enableDurableAdmin();
    const store = new Map<string, Buffer>();
    installMemoryGit(store);
    const slug = "2026-01-01-prov-durable";
    seedGitHubBundle(store, slug);

    const provenance: ProvenanceRecord = {
      mint: [
        {
          label: "Mint",
          platform: "manifold",
          url: "https://example.com/mint/1",
          chain: "ethereum",
        },
      ],
      auction: [],
      marketplace: [],
    };

    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/provenance/route.ts"),
    ).href;
    const { PATCH } = await import(href);
    const res = await PATCH(
      new Request(`http://localhost/api/admin/archive/${slug}/provenance`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${mintTestAdminBearer()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(provenance),
      }),
      { params: Promise.resolve({ slug }) },
    );

    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      entry: ArchiveEntry;
      commitSha?: string;
    };
    assert.ok(data.commitSha);
    assert.equal(data.entry.provenance.mint.length, 1);

    const tip = JSON.parse(
      store.get(`content/archive/${slug}/metadata.json`)!.toString("utf8"),
    ) as ArchiveEntry;
    assert.equal(tip.provenance.mint[0]?.url, "https://example.com/mint/1");
  });

  it("sync validates GitHub bundle without requiring deploy filesystem files", async () => {
    enableDurableAdmin();
    const store = new Map<string, Buffer>();
    installMemoryGit(store);
    const slug = "2026-01-01-sync-durable";
    seedGitHubBundle(store, slug);

    let hookCalls = 0;
    setArchiveGitHubPushHookForTests(async (s, message, files) => {
      hookCalls += 1;
      assert.equal(s, slug);
      assert.equal(message, `archive: sync ${slug}`);
      assert.ok(files.some((file) => file.path.endsWith("metadata.json")));
      assert.ok(
        files.some((file) => file.path.includes(`public/archive/${slug}/artwork.avif`)),
      );
      return { commitSha: "sha-sync-durable", paths: files.map((f) => f.path) };
    });

    await validateArchiveBundleOnGitHub(slug);
    const result = await syncArchiveEntryToGitHub(slug);
    assert.equal(result.commitSha, "sha-sync-durable");
    assert.equal(hookCalls, 1);
    assert.equal(
      await fs
        .access(path.join(tmpRoot, "content", "archive", slug))
        .then(() => true)
        .catch(() => false),
      false,
    );
  });
});
