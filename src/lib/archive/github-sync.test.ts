import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { setArchiveImagePipelineForTests } from "./image-pipeline.ts";
import { loadArchiveEntry } from "./load-entry.ts";
import {
  contentArchiveDir,
  contentArchiveSourceDir,
  contentDraftSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import {
  regenerateDraftArchive,
  regeneratePublishedEntryFromDraft,
  saveArchiveEntry,
} from "./draft-store.ts";
import {
  ArchiveSyncIncompleteError,
  ArchiveSyncNotFoundError,
  setArchiveGitHubPushHookForTests,
  syncArchiveEntryToGitHub,
  validateArchiveBundleForSync,
} from "../github/publish-entry.ts";

function fakeBuffers(marker: string): ArchiveImageBuffers {
  return {
    artwork: Buffer.from(`artwork-${marker}`),
    previewAvif: Buffer.from(`preview-avif-${marker}`),
    previewWebp: Buffer.from(`preview-webp-${marker}`),
    socialJpg: Buffer.from(`social-${marker}`),
    thumbJpg: Buffer.from(`thumb-${marker}`),
  };
}

function entryFixture(slug: string, overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "published",
    metadata: {
      title: "GitHub Sync Fixture",
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

async function writeCanonicalPublic(slug: string, marker: string): Promise<void> {
  const publicDir = publicArchiveDir(slug);
  await fs.mkdir(publicDir, { recursive: true });
  const buffers = fakeBuffers(marker);
  for (const filename of canonicalPublicDerivativeFilenames()) {
    const normalized =
      filename === "artwork.avif"
        ? "artwork"
        : filename === "preview.avif"
          ? "previewAvif"
          : filename === "preview.webp"
            ? "previewWebp"
            : filename === "social.jpg"
              ? "socialJpg"
              : "thumbJpg";
    await fs.writeFile(
      path.join(publicDir, filename),
      buffers[normalized as keyof ArchiveImageBuffers],
    );
  }
}

async function writeArchiveSource(slug: string, bytes: Buffer): Promise<void> {
  const sourceDir = contentArchiveSourceDir(slug);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "master.jpg"), bytes);
}

async function seedEditDraft(
  slug: string,
  accessionId: string,
  editDraftId: string,
  options: {
    status?: ArchiveEntry["status"];
    draftSourceBytes?: Buffer;
  } = {},
): Promise<void> {
  const { status = "published", draftSourceBytes = Buffer.from(`draft-${editDraftId}`) } =
    options;
  const { saveAccessionDraft } = await import("./draft-store.ts");
  await fs.mkdir(contentDraftSourceDir(editDraftId), { recursive: true });
  await fs.writeFile(
    path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
    draftSourceBytes,
  );
  await saveAccessionDraft({
    version: ARCHIVE_VERSION,
    draftId: editDraftId,
    accessionId,
    status,
    slug,
    slugLocked: true,
    slugHistory: [],
    source: {
      kind: "original",
      originalFilename: "original.jpg",
      storedFilename: "original.jpg",
      mimeType: "image/jpeg",
      byteSize: draftSourceBytes.length,
      importedAt: new Date().toISOString(),
    },
    processing: {},
    artwork: {
      id: slug,
      metadata: {
        accessionId,
        title: "Sync test",
        date: "2026-01-01",
      },
      imageSrc: "",
      states: [],
      background: "black",
    },
    provenance: { mint: [], auction: [], marketplace: [] },
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function seedCompleteBundle(
  slug: string,
  overrides: Record<string, unknown> = {},
): Promise<ArchiveEntry> {
  await writeCanonicalPublic(slug, "SYNC");
  await writeArchiveSource(slug, Buffer.from(`archive-source-${slug}`));
  return saveArchiveEntry(entryFixture(slug, overrides));
}

describe("GitHub archive sync", () => {
  let tmpRoot = "";
  let previousCwd = "";

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-github-sync-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveGitHubPushHookForTests(undefined);
    setArchiveImagePipelineForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    setArchiveGitHubPushHookForTests(undefined);
  });

  it("successful sync returns commitSha and paths", async () => {
    const slug = "2026-01-01-sync-success";
    await seedCompleteBundle(slug);
    setArchiveGitHubPushHookForTests(async (s, commitMessage, files) => {
      assert.equal(s, slug);
      assert.equal(commitMessage, `archive: sync ${slug}`);
      assert.ok(files.length > 0);
      return {
        commitSha: "abc123def4567890abcdef1234567890abcdef12",
        paths: files.map((f) => f.path),
      };
    });

    const result = await syncArchiveEntryToGitHub(slug);
    assert.equal(result.commitSha, "abc123def4567890abcdef1234567890abcdef12");
    assert.ok(result.paths.some((p) => p.includes("metadata.json")));
  });

  it("GitHub hook failure surfaces error without mutating archive metadata", async () => {
    const slug = "2026-01-01-sync-hook-fail";
    const entry = await seedCompleteBundle(slug);
    setArchiveGitHubPushHookForTests(async () => {
      throw new Error("octokit push failed");
    });

    await assert.rejects(
      () => syncArchiveEntryToGitHub(slug),
      /octokit push failed/,
    );

    const after = await loadArchiveEntry(slug);
    assert.deepEqual(after, entry);
  });

  it("missing archive throws ArchiveSyncNotFoundError", async () => {
    await assert.rejects(
      () => validateArchiveBundleForSync("2026-01-01-sync-missing"),
      ArchiveSyncNotFoundError,
    );
  });

  it("invalid reserved slug throws", async () => {
    await assert.rejects(
      () => validateArchiveBundleForSync("admin"),
      /Slug is reserved/,
    );
  });

  it("incomplete bundle throws ArchiveSyncIncompleteError", async () => {
    const slug = "2026-01-01-sync-incomplete";
    await saveArchiveEntry(entryFixture(slug));
    await assert.rejects(
      () => validateArchiveBundleForSync(slug),
      ArchiveSyncIncompleteError,
    );
  });

  it("skips dot-prefixed directories when collecting bundle files", async () => {
    const slug = "2026-01-01-sync-dot-skip";
    await seedCompleteBundle(slug);
    const stagingDir = path.join(contentArchiveDir(slug), ".staging");
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, "secret.txt"), "hidden");

    let capturedPaths: string[] = [];
    setArchiveGitHubPushHookForTests(async (_s, _m, files) => {
      capturedPaths = files.map((f) => f.path);
      return { commitSha: "sha-dot-skip", paths: capturedPaths };
    });

    await syncArchiveEntryToGitHub(slug);
    assert.equal(
      capturedPaths.some((p) => p.includes(".staging")),
      false,
    );
  });

  for (const [label, overrides] of [
    [
      "published",
      {
        status: "published" as const,
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      "minted",
      {
        status: "minted" as const,
        publishedAt: "2026-01-02T00:00:00.000Z",
        mintedAt: "2026-01-03T00:00:00.000Z",
      },
    ],
    [
      "hidden",
      {
        status: "hidden" as const,
        publishedAt: "2026-01-02T00:00:00.000Z",
        hiddenAt: "2026-01-04T00:00:00.000Z",
      },
    ],
    [
      "withdrawn",
      {
        status: "withdrawn" as const,
        publishedAt: "2026-01-02T00:00:00.000Z",
        withdrawnAt: "2026-01-05T00:00:00.000Z",
      },
    ],
  ] as const) {
    it(`sync preserves ${label} lifecycle metadata`, async () => {
      const slug = `2026-01-01-sync-lifecycle-${label}`;
      await seedCompleteBundle(slug, overrides);
      const before = await loadArchiveEntry(slug);

      setArchiveGitHubPushHookForTests(async () => ({
        commitSha: `sha-${label}`,
        paths: [],
      }));

      await syncArchiveEntryToGitHub(slug);

      const after = await loadArchiveEntry(slug);
      assert.equal(after?.status, before?.status);
      assert.equal(after?.publishedAt, before?.publishedAt);
      assert.equal(after?.mintedAt, before?.mintedAt);
      assert.equal(after?.hiddenAt, before?.hiddenAt);
      assert.equal(after?.withdrawnAt, before?.withdrawnAt);
    });
  }

  it("sync failure leaves local public files intact", async () => {
    const slug = "2026-01-01-sync-files-intact";
    await seedCompleteBundle(slug);
    const artworkPath = path.join(publicArchiveDir(slug), "artwork.avif");
    const before = await fs.readFile(artworkPath);

    setArchiveGitHubPushHookForTests(async () => {
      throw new Error("sync failed");
    });
    await assert.rejects(() => syncArchiveEntryToGitHub(slug));

    const after = await fs.readFile(artworkPath);
    assert.equal(after.toString(), before.toString());
  });

  it("retry after mocked sync failure succeeds", async () => {
    const slug = "2026-01-01-sync-retry";
    await seedCompleteBundle(slug);
    let attempts = 0;
    setArchiveGitHubPushHookForTests(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient failure");
      return { commitSha: "sha-retry-ok", paths: [] };
    });

    await assert.rejects(() => syncArchiveEntryToGitHub(slug));
    const result = await syncArchiveEntryToGitHub(slug);
    assert.equal(result.commitSha, "sha-retry-ok");
    assert.equal(attempts, 2);
  });
});

describe("POST /api/admin/archive/[slug]/sync route", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;
  const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
  const previousOwner = process.env.GITHUB_ARCHIVE_OWNER;
  const previousRepo = process.env.GITHUB_ARCHIVE_REPO;

  after(async () => {
    setArchiveGitHubPushHookForTests(undefined);
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
    setArchiveGitHubPushHookForTests(undefined);
  });

  async function loadPost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/sync/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  it("returns 503 when GitHub is not configured", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    delete process.env.GITHUB_ARCHIVE_TOKEN;
    delete process.env.GITHUB_ARCHIVE_OWNER;
    delete process.env.GITHUB_ARCHIVE_REPO;

    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/sync", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 503);
  });

  it("returns 404 for missing archive via route", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";

    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/sync", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ slug: "2026-01-01-route-missing" }) },
    );
    assert.equal(res.status, 404);
  });

  it("returns 400 for reserved slug via route", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";

    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/admin/sync", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ slug: "admin" }) },
    );
    assert.equal(res.status, 400);
  });
});

describe("published edit: regenerateDraftArchive and source immutability", () => {
  let tmpRoot = "";
  let previousCwd = "";
  let capturedSource: Buffer | null = null;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-sync-regen-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveImagePipelineForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  function installPipelineMock(marker = "REGEN"): void {
    capturedSource = null;
    setArchiveImagePipelineForTests(async (sourceBuffer: Buffer) => {
      capturedSource = sourceBuffer;
      return fakeBuffers(marker);
    });
  }

  it("regenerateDraftArchive on edit draft preserves minted status", async () => {
    installPipelineMock("DRAFT-REGEN");
    const slug = "2026-01-01-regen-draft-minted";
    const mintedAt = "2026-01-03T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-original-minted"));
    await saveArchiveEntry(entryFixture(slug, { status: "minted", mintedAt }));
    await seedEditDraft(slug, "AR-2026-0101", "edit-sync-minted", {
      status: "minted",
    });

    await regenerateDraftArchive("edit-sync-minted");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "minted");
    assert.equal(entry?.mintedAt, mintedAt);
    assert.notEqual(entry?.status, "generated");
  });

  it("regenerateDraftArchive preserves hidden status", async () => {
    installPipelineMock("VIS");
    const slug = "2026-01-01-regen-draft-hidden";
    const hiddenAt = "2026-01-04T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-hidden"));
    await saveArchiveEntry(entryFixture(slug, { status: "hidden", hiddenAt }));
    await seedEditDraft(slug, "AR-2026-0101", "edit-sync-hidden", {
      status: "hidden",
    });

    await regenerateDraftArchive("edit-sync-hidden");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "hidden");
  });

  it("regenerateDraftArchive refuses withdrawn archives", async () => {
    installPipelineMock("VIS");
    const slug = "2026-01-01-regen-draft-withdrawn";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-withdrawn"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, "AR-2026-0101", "edit-sync-withdrawn", {
      status: "withdrawn",
    });

    await assert.rejects(
      () => regenerateDraftArchive("edit-sync-withdrawn"),
      /withdrawn and cannot be regenerated/,
    );

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "withdrawn");
    assert.equal(entry?.withdrawnAt, withdrawnAt);
  });

  it("archive source bytes unchanged when draft has different re-uploaded source", async () => {
    installPipelineMock("IMMUT");
    const slug = "2026-01-01-regen-diff-draft";
    const archiveBytes = Buffer.from("DEPOSITED-ARCHIVE-ORIGINAL-BYTES");
    const draftBytes = Buffer.from("RE-UPLOADED-DRAFT-BYTES-DIFFERENT");
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", "edit-sync-diff-draft", {
      draftSourceBytes: draftBytes,
    });

    await regeneratePublishedEntryFromDraft("edit-sync-diff-draft");

    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), archiveBytes.toString());
    assert.notEqual(onDisk.toString(), draftBytes.toString());
  });

  it("derivatives encode from archive original when draft bytes differ", async () => {
    installPipelineMock("ENCODE");
    const slug = "2026-01-01-regen-encode-source";
    const archiveBytes = Buffer.from("ARCHIVE-BYTES-FOR-DERIVATIVES");
    const draftBytes = Buffer.from("DRAFT-BYTES-SHOULD-NOT-ENCODE");
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", "edit-sync-encode", {
      draftSourceBytes: draftBytes,
    });

    await regeneratePublishedEntryFromDraft("edit-sync-encode");

    assert.ok(capturedSource);
    assert.equal(capturedSource!.toString(), archiveBytes.toString());
  });

  it("draft working copy source file remains the re-uploaded bytes after regen", async () => {
    installPipelineMock("WORKING");
    const slug = "2026-01-01-regen-working-copy";
    const archiveBytes = Buffer.from("ARCHIVE-ORIGINAL");
    const draftBytes = Buffer.from("DRAFT-WORKING-COPY-BYTES");
    const editDraftId = "edit-sync-working";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", editDraftId, {
      draftSourceBytes: draftBytes,
    });

    await regeneratePublishedEntryFromDraft(editDraftId);

    const draftOnDisk = await fs.readFile(
      path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
    );
    assert.equal(draftOnDisk.toString(), draftBytes.toString());
  });
});
