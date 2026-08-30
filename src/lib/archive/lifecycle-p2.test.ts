import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { setArchiveImagePipelineForTests } from "./image-pipeline.ts";
import {
  canonicalPublicDerivativeFilenames,
} from "./public-derivative-export.ts";
import {
  contentArchiveMintPackageDir,
  contentArchiveSourceDir,
  contentDraftDir,
  contentDraftSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
  type ExportInventoryItem,
} from "./schema.ts";
import {
  createAccessionDraftFromSource,
  deleteDraft,
  listAccessionDrafts,
  loadAccessionDraft,
  regeneratePublishedEntryFromDraft,
  saveAccessionDraft,
  saveArchiveEntry,
  storeDraftSource,
} from "./draft-store.ts";
import { loadArchiveEntry } from "./load-entry.ts";

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
      title: "Lifecycle P2 Fixture",
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

function mockFile(name: string, bytes: Buffer): File {
  return new File([bytes], name, { type: "image/jpeg" });
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
    withDraftSourceBytes?: boolean;
  } = {},
): Promise<void> {
  const { status = "published", withDraftSourceBytes = true } = options;
  const originalBytes = Buffer.from(`draft-source-${editDraftId}`);
  if (withDraftSourceBytes) {
    await fs.mkdir(contentDraftSourceDir(editDraftId), { recursive: true });
    await fs.writeFile(
      path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
      originalBytes,
    );
  }
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
      byteSize: originalBytes.length,
      importedAt: new Date().toISOString(),
    },
    processing: {},
    artwork: {
      id: slug,
      metadata: {
        accessionId,
        title: "Lifecycle test",
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

describe("P2 lifecycle: published regeneration and mint package", () => {
  let tmpRoot = "";
  let previousCwd = "";

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-lifecycle-p2-"));
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
    setArchiveImagePipelineForTests(async () => fakeBuffers(marker));
  }

  it("preserves published status and publishedAt on published regeneration", async () => {
    installPipelineMock("PUB");
    const slug = "2026-01-01-p2-published";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-source-published"));
    await saveArchiveEntry(entryFixture(slug, { publishedAt }));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-published");

    await regeneratePublishedEntryFromDraft("edit-p2-published");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
    assert.equal(entry?.publishedAt, publishedAt);
    assert.equal(entry?.mintedAt, undefined);
  });

  it("does not falsely create mintedAt when archive was never minted", async () => {
    installPipelineMock("NEVER-MINTED");
    const slug = "2026-01-01-p2-never-minted";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-source-never-minted"));
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-never-minted");

    await regeneratePublishedEntryFromDraft("edit-p2-never-minted");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
    assert.equal(entry?.mintedAt, undefined);
  });

  it("preserves minted status and mintedAt on minted archive regeneration", async () => {
    installPipelineMock("MINTED");
    const slug = "2026-01-01-p2-minted";
    const mintedAt = "2026-01-03T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-source-minted"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "minted", mintedAt }),
    );
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-minted", {
      status: "minted",
    });

    await regeneratePublishedEntryFromDraft("edit-p2-minted");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "minted");
    assert.equal(entry?.mintedAt, mintedAt);

    const draft = await loadAccessionDraft("edit-p2-minted");
    assert.equal(draft?.status, "minted");
  });

  it("refreshes mint-package exports inventory after successful regeneration", async () => {
    installPipelineMock("MINTPKG");
    const slug = "2026-01-01-p2-mint-package";
    await writeCanonicalPublic(slug, "OLD");
    await writeArchiveSource(slug, Buffer.from("archive-source-mint-package"));
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-mint-package");

    await regeneratePublishedEntryFromDraft("edit-p2-mint-package");

    const packageDir = contentArchiveMintPackageDir(slug);
    const packageEntries = await fs.readdir(packageDir, { recursive: true });
    assert.ok(packageEntries.length > 0);

    const entry = await loadArchiveEntry(slug);
    assert.ok(entry?.exports && entry.exports.length > 0);
  });

  it("leaves prior public and exports intact when regeneration fails", async () => {
    setArchiveImagePipelineForTests(async () => {
      throw new Error("p2 regen failed");
    });

    const slug = "2026-01-01-p2-regen-fail";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("archive-source-fail"));
    const priorExports: ExportInventoryItem[] = [
      {
        role: "metadata",
        path: "exports/mint-package/metadata.json",
        byteSize: 10,
        generatedAt: "2026-01-01T00:00:00.000Z",
        checksum: { algorithm: "sha256", value: "abc123" },
        exportVersion: "mint-package-v1",
      },
    ];
    await saveArchiveEntry(entryFixture(slug, { exports: priorExports }));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-regen-fail");

    const beforeArtwork = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );

    await assert.rejects(
      () => regeneratePublishedEntryFromDraft("edit-p2-regen-fail"),
      /p2 regen failed/,
    );

    const afterArtwork = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );
    assert.equal(afterArtwork, beforeArtwork);

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.exports?.length, priorExports.length);
    assert.equal(entry?.exports?.[0]?.role, "metadata");
  });

  it("preserves hidden archive visibility on regeneration", async () => {
    installPipelineMock("VIS");
    const slug = "2026-01-01-p2-hidden";
    const hiddenAt = "2026-01-04T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-source-hidden"));
    await saveArchiveEntry(entryFixture(slug, { status: "hidden", hiddenAt }));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-hidden", {
      status: "hidden",
    });

    await regeneratePublishedEntryFromDraft("edit-p2-hidden");

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "hidden");
    const draft = await loadAccessionDraft("edit-p2-hidden");
    assert.equal(draft?.status, "hidden");
  });

  it("refuses regeneration of withdrawn archives", async () => {
    installPipelineMock("WITHDRAWN-BLOCK");
    const slug = "2026-01-01-p2-withdrawn";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("archive-source-withdrawn"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-withdrawn", {
      status: "withdrawn",
    });

    await assert.rejects(
      () => regeneratePublishedEntryFromDraft("edit-p2-withdrawn"),
      /withdrawn and cannot be regenerated/,
    );

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "withdrawn");
    assert.equal(entry?.withdrawnAt, withdrawnAt);
  });

  it("does not downgrade published or minted archives to generated", async () => {
    installPipelineMock("NODEGRADE");
    for (const [status, editDraftId, mintedAt] of [
      ["published", "edit-p2-no-downgrade-published", undefined],
      ["minted", "edit-p2-no-downgrade-minted", "2026-01-03T00:00:00.000Z"],
    ] as const) {
      const slug = `2026-01-01-p2-no-downgrade-${status}`;
      await writeCanonicalPublic(slug, "BEFORE");
      await writeArchiveSource(slug, Buffer.from(`archive-${status}`));
      await saveArchiveEntry(
        entryFixture(slug, {
          status,
          mintedAt,
        }),
      );
      await seedEditDraft(slug, "AR-2026-0101", editDraftId, { status });

      await regeneratePublishedEntryFromDraft(editDraftId);

      const entry = await loadArchiveEntry(slug);
      assert.notEqual(entry?.status, "generated");
      assert.equal(entry?.status, status);
    }
  });

  it("does not mutate archive source bytes when using archive fallback", async () => {
    installPipelineMock("IMMUTABLE");
    const slug = "2026-01-01-p2-immutable-source";
    const sourceBytes = Buffer.from("IMMUTABLE-ARCHIVE-SOURCE-BYTES");
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, sourceBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, "AR-2026-0101", "edit-p2-immutable", {
      withDraftSourceBytes: false,
    });

    await regeneratePublishedEntryFromDraft("edit-p2-immutable");

    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), sourceBytes.toString());
  });
});

describe("P2 lifecycle: draft deletion", () => {
  let tmpRoot = "";
  let previousCwd = "";

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-lifecycle-delete-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("deleteDraft removes draft only and leaves archive untouched", async () => {
    const slug = "2026-01-01-p2-delete-draft";
    const { createAccessionDraft } = await import("./draft-store.ts");
    const created = await createAccessionDraft({
      slug,
      title: "Delete draft test",
      date: "2026-01-01",
    });

    await writeArchiveSource(slug, Buffer.from("survives"));
    await saveArchiveEntry(entryFixture(slug));

    await deleteDraft(created.draftId, created.draftId);
    assert.equal(await loadAccessionDraft(created.draftId), null);
    assert.ok(await loadArchiveEntry(slug));
  });

  it("deleteDraft rejects missing draft safely", async () => {
    await assert.rejects(
      () => deleteDraft("draft-2026-missing", "draft-2026-missing"),
      /not found/i,
    );
  });
});

describe("P2 lifecycle: deferred draft creation", () => {
  let tmpRoot = "";
  let previousCwd = "";

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-lifecycle-deferred-"));
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function clearDrafts(): Promise<void> {
    const draftsRoot = path.join(process.cwd(), "content", "drafts");
    const entries = await fs.readdir(draftsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      await fs.rm(path.join(draftsRoot, entry.name), { recursive: true, force: true });
    }
  }

  afterEach(async () => {
    await clearDrafts();
  });

  it("does not persist a draft when no create function is called", async () => {
    const before = (await listAccessionDrafts()).length;
    assert.equal(before, 0);
  });

  it("createAccessionDraftFromSource creates exactly one draft with source bytes", async () => {
    const bytes = Buffer.from("first-upload-source");
    const draft = await createAccessionDraftFromSource(mockFile("first.jpg", bytes));

    const drafts = await listAccessionDrafts();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.draftId, draft.draftId);
    assert.equal(draft.source.storedFilename, "original.jpg");

    const onDisk = await fs.readFile(
      path.join(contentDraftSourceDir(draft.draftId), "original.jpg"),
    );
    assert.equal(onDisk.toString(), bytes.toString());
  });

  it("rolls back draft directory when source upload fails", async () => {
    const badFile = {
      name: "broken.jpg",
      type: "image/jpeg",
      arrayBuffer: async () => {
        throw new Error("simulated read failure");
      },
    } as File;

    await assert.rejects(
      () => createAccessionDraftFromSource(badFile),
      /simulated read failure/,
    );

    const drafts = await listAccessionDrafts();
    assert.equal(drafts.length, 0);

    const draftDirs = await fs.readdir(path.join(process.cwd(), "content", "drafts"));
    const liveDraftDirs = draftDirs.filter(
      (name) => !name.startsWith(".") && name.startsWith("draft-"),
    );
    assert.equal(liveDraftDirs.length, 0);
  });

  it("re-upload to existing draft does not create duplicate drafts", async () => {
    const first = await createAccessionDraftFromSource(
      mockFile("first.jpg", Buffer.from("first")),
    );
    await storeDraftSource(first.draftId, mockFile("second.jpg", Buffer.from("second")));

    const drafts = await listAccessionDrafts();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.draftId, first.draftId);

    let draftDirExists = false;
    try {
      await fs.access(contentDraftDir(first.draftId));
      draftDirExists = true;
    } catch {
      draftDirExists = false;
    }
    assert.equal(draftDirExists, true);
  });
});
