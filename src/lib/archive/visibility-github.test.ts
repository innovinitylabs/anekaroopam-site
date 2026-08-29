import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import {
  buildArchiveVisibilityUpdate,
  saveArchiveEntry,
} from "./draft-store.ts";
import { getAllArchiveEntries, loadArchiveEntry } from "./load-entry.ts";
import {
  contentArchiveDir,
  contentArchiveSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import {
  assertVisibilityTransition,
  resolveVisibilityRestoreTarget,
  visibilityTransitionKind,
} from "./visibility.ts";
import {
  setArchiveGitHubMetadataPushHookForTests,
  setArchiveGitHubPushHookForTests,
  syncArchiveEntryToGitHub,
} from "../github/publish-entry.ts";

function entryFixture(slug: string, overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "published",
    metadata: {
      title: "Visibility Fixture",
      date: "2026-01-01",
      accessionId: "AR-2026-0101",
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

async function writeCanonicalPublic(slug: string): Promise<void> {
  const publicDir = publicArchiveDir(slug);
  await fs.mkdir(publicDir, { recursive: true });
  for (const filename of canonicalPublicDerivativeFilenames()) {
    await fs.writeFile(path.join(publicDir, filename), Buffer.from(filename));
  }
}

async function seedEntry(
  slug: string,
  overrides: Record<string, unknown> = {},
): Promise<ArchiveEntry> {
  await writeCanonicalPublic(slug);
  const sourceBytes = Buffer.from(`source-${slug}`);
  await fs.mkdir(contentArchiveSourceDir(slug), { recursive: true });
  await fs.writeFile(path.join(contentArchiveSourceDir(slug), "master.jpg"), sourceBytes);
  return saveArchiveEntry(entryFixture(slug, overrides));
}

describe("visibility transition policy", () => {
  it("resolveVisibilityRestoreTarget prefers minted when mintedAt exists", () => {
    const entry = entryFixture("2026-01-01-restore-minted", {
      status: "hidden",
      mintedAt: "2026-01-03T00:00:00.000Z",
    });
    assert.equal(resolveVisibilityRestoreTarget(entry), "minted");
  });

  it("classifies hide, unhide, withdraw, and restore transitions", () => {
    assert.equal(visibilityTransitionKind("published", "hidden"), "hide");
    assert.equal(visibilityTransitionKind("hidden", "published"), "unhide");
    assert.equal(visibilityTransitionKind("published", "withdrawn"), "withdraw");
    assert.equal(visibilityTransitionKind("withdrawn", "published"), "restore");
  });

  it("rejects hiding a withdrawn archive", () => {
    const entry = entryFixture("2026-01-01-no-hide-withdrawn", {
      status: "withdrawn",
      withdrawnAt: "2026-01-05T00:00:00.000Z",
    });
    assert.throws(
      () => assertVisibilityTransition(entry, "hidden"),
      /Cannot hide a withdrawn archive/,
    );
  });

  it("rejects wrong restore target for minted archive", () => {
    const entry = entryFixture("2026-01-01-wrong-restore", {
      status: "hidden",
      mintedAt: "2026-01-03T00:00:00.000Z",
    });
    assert.throws(
      () => assertVisibilityTransition(entry, "published"),
      /expected minted/,
    );
  });
});

describe("visibility GitHub synchronization", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;
  const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
  const previousOwner = process.env.GITHUB_ARCHIVE_OWNER;
  const previousRepo = process.env.GITHUB_ARCHIVE_REPO;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-vis-github-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveGitHubMetadataPushHookForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
    for (const [key, value] of [
      ["ADMIN_INGEST_ENABLED", previousEnabled],
      ["ADMIN_INGEST_SECRET", previousSecret],
      ["GITHUB_ARCHIVE_TOKEN", previousToken],
      ["GITHUB_ARCHIVE_OWNER", previousOwner],
      ["GITHUB_ARCHIVE_REPO", previousRepo],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  afterEach(() => {
    setArchiveGitHubMetadataPushHookForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
  });

  function enableAdminAndGitHub(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
  }

  async function loadPatch() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/visibility/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.PATCH as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  async function patchVisibility(slug: string, status: string): Promise<Response> {
    const PATCH = await loadPatch();
    return PATCH(
      new Request(`http://localhost/api/admin/archive/${slug}/visibility`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      }),
      { params: Promise.resolve({ slug }) },
    );
  }

  it("hide pushes metadata with status hidden and sets hiddenAt", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-hide";
    await seedEntry(slug);
    let capturedJson = "";
    setArchiveGitHubMetadataPushHookForTests(async (_s, message, metadataJson) => {
      capturedJson = metadataJson;
      assert.match(message, /hidden$/);
      return { commitSha: "sha-hide" };
    });

    const res = await patchVisibility(slug, "hidden");
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      entry: ArchiveEntry;
      commitSha?: string;
      githubSynced?: boolean;
    };
    assert.equal(data.githubSynced, true);
    assert.equal(data.commitSha, "sha-hide");
    assert.equal(data.entry.status, "hidden");
    assert.ok(data.entry.hiddenAt);
    const parsed = JSON.parse(capturedJson) as ArchiveEntry;
    assert.equal(parsed.status, "hidden");
    assert.ok(parsed.hiddenAt);
  });

  it("withdraw pushes metadata with status withdrawn and sets withdrawnAt", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-withdraw";
    await seedEntry(slug);
    let capturedJson = "";
    setArchiveGitHubMetadataPushHookForTests(async (_s, message, metadataJson) => {
      capturedJson = metadataJson;
      assert.match(message, /withdrawn$/);
      return { commitSha: "sha-withdraw" };
    });

    const res = await patchVisibility(slug, "withdrawn");
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entry: ArchiveEntry; githubSynced?: boolean };
    assert.equal(data.githubSynced, true);
    assert.equal(data.entry.status, "withdrawn");
    assert.ok(data.entry.withdrawnAt);
    const parsed = JSON.parse(capturedJson) as ArchiveEntry;
    assert.equal(parsed.status, "withdrawn");
  });

  it("unhide from hidden restores minted when mintedAt is present", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-unhide-minted";
    const mintedAt = "2026-01-03T00:00:00.000Z";
    await seedEntry(slug, {
      status: "hidden",
      hiddenAt: "2026-01-04T00:00:00.000Z",
      mintedAt,
    });
    setArchiveGitHubMetadataPushHookForTests(async () => ({ commitSha: "sha-unhide-minted" }));

    const res = await patchVisibility(slug, "minted");
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entry: ArchiveEntry };
    assert.equal(data.entry.status, "minted");
    assert.equal(data.entry.mintedAt, mintedAt);
  });

  it("restore from withdrawn uses published when not minted", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-restore-published";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    await seedEntry(slug, {
      status: "withdrawn",
      withdrawnAt: "2026-01-05T00:00:00.000Z",
      publishedAt,
    });
    setArchiveGitHubMetadataPushHookForTests(async () => ({ commitSha: "sha-restore" }));

    const res = await patchVisibility(slug, "published");
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entry: ArchiveEntry };
    assert.equal(data.entry.status, "published");
    assert.equal(data.entry.publishedAt, publishedAt);
    assert.ok(data.entry.withdrawnAt);
  });

  it("rejects invalid transition from withdrawn to hidden", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-invalid-hide";
    await seedEntry(slug, {
      status: "withdrawn",
      withdrawnAt: "2026-01-05T00:00:00.000Z",
    });

    const res = await patchVisibility(slug, "hidden");
    assert.equal(res.status, 400);
  });

  it("preserves publishedAt and mintedAt across hide and unhide", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-timestamps";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    const mintedAt = "2026-01-03T00:00:00.000Z";
    await seedEntry(slug, { status: "minted", mintedAt, publishedAt });
    setArchiveGitHubMetadataPushHookForTests(async () => ({ commitSha: "sha-ts" }));

    await patchVisibility(slug, "hidden");
    const res = await patchVisibility(slug, "minted");
    assert.equal(res.status, 200);
    const data = (await res.json()) as { entry: ArchiveEntry };
    assert.equal(data.entry.publishedAt, publishedAt);
    assert.equal(data.entry.mintedAt, mintedAt);
  });

  it("does not mutate archive source bytes during visibility change", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-source";
    const sourceBytes = Buffer.from(`immutable-source-${slug}`);
    await writeCanonicalPublic(slug);
    await fs.mkdir(contentArchiveSourceDir(slug), { recursive: true });
    await fs.writeFile(path.join(contentArchiveSourceDir(slug), "master.jpg"), sourceBytes);
    await saveArchiveEntry(entryFixture(slug));
    setArchiveGitHubMetadataPushHookForTests(async () => ({ commitSha: "sha-src" }));

    await patchVisibility(slug, "hidden");

    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), sourceBytes.toString());
  });

  it("GitHub failure leaves local metadata unchanged", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-gh-fail";
    const entry = await seedEntry(slug);
    setArchiveGitHubMetadataPushHookForTests(async () => {
      throw new Error("metadata push failed");
    });

    const res = await patchVisibility(slug, "hidden");
    assert.equal(res.status, 500);

    const after = await loadArchiveEntry(slug);
    assert.equal(after?.status, entry.status);
    assert.equal(after?.hiddenAt, entry.hiddenAt);
  });

  it("retry after GitHub failure succeeds", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-retry";
    await seedEntry(slug);
    let attempts = 0;
    setArchiveGitHubMetadataPushHookForTests(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient metadata failure");
      return { commitSha: "sha-retry" };
    });

    const first = await patchVisibility(slug, "hidden");
    assert.equal(first.status, 500);
    const second = await patchVisibility(slug, "hidden");
    assert.equal(second.status, 200);
    assert.equal(attempts, 2);
  });

  it("excludes hidden archives from public listing after transition", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-listing";
    await seedEntry(slug);
    setArchiveGitHubMetadataPushHookForTests(async () => ({ commitSha: "sha-list" }));

    await patchVisibility(slug, "hidden");

    const listed = await getAllArchiveEntries();
    assert.equal(listed.some((entry) => entry.slug === slug), false);
    const all = await getAllArchiveEntries({ includeHidden: true });
    assert.equal(all.some((entry) => entry.slug === slug), true);
  });

  it("explicit sync remains lifecycle-neutral for hidden archives", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-vis-sync-neutral";
    const hiddenAt = "2026-01-04T00:00:00.000Z";
    await seedEntry(slug, { status: "hidden", hiddenAt });
    setArchiveGitHubPushHookForTests(async () => ({
      commitSha: "sha-sync-neutral",
      paths: [],
    }));

    await syncArchiveEntryToGitHub(slug);

    const after = await loadArchiveEntry(slug);
    assert.equal(after?.status, "hidden");
    assert.equal(after?.hiddenAt, hiddenAt);
  });

  it("saves locally only when GitHub is not configured", async () => {
    delete process.env.GITHUB_ARCHIVE_TOKEN;
    delete process.env.GITHUB_ARCHIVE_OWNER;
    delete process.env.GITHUB_ARCHIVE_REPO;
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";

    const slug = "2026-01-01-vis-local-only";
    await seedEntry(slug);

    const res = await patchVisibility(slug, "hidden");
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      entry: ArchiveEntry;
      githubSynced?: boolean;
      commitSha?: string;
    };
    assert.equal(data.githubSynced, false);
    assert.equal(data.commitSha, undefined);
    assert.equal(data.entry.status, "hidden");

    const metadataRaw = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.match(metadataRaw, /"status": "hidden"/);
  });
});

describe("buildArchiveVisibilityUpdate", () => {
  it("preserves historical hiddenAt and withdrawnAt when not re-entering those states", () => {
    const entry = entryFixture("2026-01-01-build-vis", {
      status: "hidden",
      hiddenAt: "2026-01-04T00:00:00.000Z",
      withdrawnAt: "2026-01-05T00:00:00.000Z",
    });
    const updated = buildArchiveVisibilityUpdate(entry, "minted");
    assert.equal(updated.hiddenAt, "2026-01-04T00:00:00.000Z");
    assert.equal(updated.withdrawnAt, "2026-01-05T00:00:00.000Z");
  });
});
