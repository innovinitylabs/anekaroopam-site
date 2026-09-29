import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { accessionDraftToArchiveDraft } from "./adapters.ts";
import { bytesForArchiveDerivativeGenerate } from "./archive-policy.ts";
import {
  createAccessionDraft,
  generateArchiveFromDraft,
  loadAccessionDraft,
  regeneratePublishedEntryFromDraft,
  saveAccessionDraft,
  saveArchiveEntry,
} from "./draft-store.ts";
import { runArchiveExport, setArchiveExportContentWriteHookForTests } from "./export-orchestrator.ts";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { setArchiveImagePipelineForTests } from "./image-pipeline.ts";
import {
  canonicalPublicDerivativeFilenames,
  promotePublicDerivatives,
  publicArchiveStagingRoot,
  rollbackPublicPromote,
  validatePublicStaging,
  writePublicDerivativesToStaging,
} from "./public-derivative-export.ts";
import { contentArchiveSourceDir, publicArchiveDir } from "./paths.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";

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
      title: "Atomic Export Fixture",
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
    await fs.writeFile(path.join(publicDir, filename), buffers[normalized as keyof ArchiveImageBuffers]);
  }
}

async function writeArchiveSource(slug: string, bytes: Buffer): Promise<void> {
  const sourceDir = contentArchiveSourceDir(slug);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "master.jpg"), bytes);
}

describe("atomic public derivative export", () => {
  let tmpRoot = "";
  let previousCwd = "";
  let capturedSource: Buffer | null = null;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-atomic-export-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveImagePipelineForTests(undefined);
    setArchiveExportContentWriteHookForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  function installPipelineMock(marker = "GEN"): void {
    capturedSource = null;
    setArchiveImagePipelineForTests(async (sourceBuffer: Buffer) => {
      capturedSource = sourceBuffer;
      return fakeBuffers(marker);
    });
  }

  async function seedDraftWithSource(
    slug: string,
    originalBytes: Buffer,
    preparedBytes?: Buffer,
  ) {
    const draft = await createAccessionDraft({
      slug,
      title: "Atomic test",
      date: "2026-01-01",
    });
    const { contentDraftSourceDir, contentDraftWorkingDir } = await import("./paths.ts");
    await fs.mkdir(contentDraftSourceDir(draft.draftId), { recursive: true });
    await fs.writeFile(
      path.join(contentDraftSourceDir(draft.draftId), "original.jpg"),
      originalBytes,
    );
    const updated = await saveAccessionDraft({
      ...draft,
      source: {
        kind: "original",
        originalFilename: "original.jpg",
        storedFilename: "original.jpg",
        mimeType: "image/jpeg",
        byteSize: originalBytes.length,
        importedAt: new Date().toISOString(),
      },
      status: "prepared",
    });
    if (preparedBytes) {
      await fs.mkdir(contentDraftWorkingDir(draft.draftId), { recursive: true });
      await fs.writeFile(
        path.join(contentDraftWorkingDir(draft.draftId), "master-prepared.avif"),
        preparedBytes,
      );
      return saveAccessionDraft({
        ...updated,
        processing: {
          preparedSource: "working/master-prepared.avif",
          preparedAt: new Date().toISOString(),
        },
      });
    }
    return updated;
  }

  async function seedEditDraft(
    slug: string,
    accessionId: string,
    editDraftId: string,
    originalBytes: Buffer,
  ) {
    const { contentDraftSourceDir } = await import("./paths.ts");
    await fs.mkdir(contentDraftSourceDir(editDraftId), { recursive: true });
    await fs.writeFile(
      path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
      originalBytes,
    );
    return saveAccessionDraft({
      version: ARCHIVE_VERSION,
      draftId: editDraftId,
      accessionId,
      status: "published",
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
          title: "Atomic test",
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

  it("uses original bytes for derivatives when prepared exists", async () => {
    installPipelineMock("ORIGINAL");
    const original = Buffer.from("ORIGINAL-SOURCE-BYTES");
    const prepared = Buffer.from("PREPARED-AVIF-BYTES");
    const draft = await seedDraftWithSource("2026-01-01-atomic-original", original, prepared);

    await generateArchiveFromDraft(draft.draftId);

    assert.ok(capturedSource);
    assert.equal(capturedSource.toString(), original.toString());
    assert.notEqual(capturedSource.toString(), prepared.toString());
    assert.equal(
      bytesForArchiveDerivativeGenerate(original, prepared).toString(),
      original.toString(),
    );
  });

  it("writes all canonical public derivatives on successful generate", async () => {
    installPipelineMock("SUCCESS");
    const draft = await seedDraftWithSource(
      "2026-01-01-atomic-success",
      Buffer.from("source-for-success"),
    );

    await generateArchiveFromDraft(draft.draftId);

    const publicDir = publicArchiveDir(draft.slug);
    for (const filename of canonicalPublicDerivativeFilenames()) {
      const filePath = path.join(publicDir, filename);
      const stat = await fs.stat(filePath);
      assert.ok(stat.size > 0, `missing or empty ${filename}`);
    }
  });

  it("leaves no partial public archive when pipeline fails", async () => {
    setArchiveImagePipelineForTests(async () => {
      throw new Error("pipeline failed");
    });

    const draft = await seedDraftWithSource(
      "2026-01-01-atomic-fail",
      Buffer.from("source-for-fail"),
    );
    const publicDir = publicArchiveDir(draft.slug);

    await assert.rejects(() => generateArchiveFromDraft(draft.draftId), /pipeline failed/);

    let publicExists = true;
    try {
      await fs.access(publicDir);
    } catch {
      publicExists = false;
    }
    assert.equal(publicExists, false);

    const stagingRoot = publicArchiveStagingRoot();
    if (await fs.access(stagingRoot).then(() => true).catch(() => false)) {
      const stagingEntries = await fs.readdir(stagingRoot);
      assert.equal(stagingEntries.length, 0);
    }

    const reloaded = await loadAccessionDraft(draft.draftId);
    assert.notEqual(reloaded?.status, "generated");
  });

  it("regenerates all public derivatives to version B", async () => {
    installPipelineMock("VERSION-B");
    const slug = "2026-01-01-atomic-regen-success";
    const archiveOriginal = Buffer.from("archive-original-for-regen-b");
    await writeCanonicalPublic(slug, "VERSION-A");
    await writeArchiveSource(slug, archiveOriginal);
    await saveArchiveEntry(entryFixture(slug));

    const original = Buffer.from("draft-working-copy-for-regen-b");
    await seedEditDraft(slug, "AR-2026-0101", "edit-ar-2026-0101", original);

    await regeneratePublishedEntryFromDraft("edit-ar-2026-0101");

    const publicDir = publicArchiveDir(slug);
    const artwork = await fs.readFile(path.join(publicDir, "artwork.avif"), "utf8");
    assert.equal(artwork, "artwork-VERSION-B");
  });

  it("keeps version A intact when regeneration fails", async () => {
    setArchiveImagePipelineForTests(async () => {
      throw new Error("regen pipeline failed");
    });

    const slug = "2026-01-01-atomic-regen-fail";
    await writeCanonicalPublic(slug, "VERSION-A");
    await writeArchiveSource(slug, Buffer.from("archive-source-regen-fail"));
    await saveArchiveEntry(entryFixture(slug));
    const beforeArtwork = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );

    const editDraftId = "edit-ar-2026-0101-fail";
    await seedEditDraft(slug, "AR-2026-0101", editDraftId, Buffer.from("regen-source"));

    await assert.rejects(
      () => regeneratePublishedEntryFromDraft(editDraftId),
      /regen pipeline failed/,
    );

    const afterArtwork = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );
    assert.equal(afterArtwork, beforeArtwork);
  });

  it("removes obsolete public derivatives on successful regeneration", async () => {
    installPipelineMock("CLEAN");
    const slug = "2026-01-01-atomic-orphan";
    await writeCanonicalPublic(slug, "OLD");
    await writeArchiveSource(slug, Buffer.from("archive-source-orphan"));
    await fs.writeFile(path.join(publicArchiveDir(slug), "thumb.avif"), "orphan-old");
    await saveArchiveEntry(entryFixture(slug));

    const editDraftId = "edit-ar-2026-0101-orphan";
    await seedEditDraft(slug, "AR-2026-0101", editDraftId, Buffer.from("orphan-source"));

    await regeneratePublishedEntryFromDraft(editDraftId);

    let orphanExists = true;
    try {
      await fs.access(path.join(publicArchiveDir(slug), "thumb.avif"));
    } catch {
      orphanExists = false;
    }
    assert.equal(orphanExists, false);
  });

  it("preserves obsolete files when regeneration fails", async () => {
    setArchiveImagePipelineForTests(async () => {
      throw new Error("orphan regen failed");
    });

    const slug = "2026-01-01-atomic-orphan-fail";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("archive-source-orphan-fail"));
    await fs.writeFile(path.join(publicArchiveDir(slug), "thumb.avif"), "orphan-keep");
    await saveArchiveEntry(entryFixture(slug));

    const editDraftId = "edit-ar-2026-0101-orphan-fail";
    await seedEditDraft(
      slug,
      "AR-2026-0101",
      editDraftId,
      Buffer.from("orphan-fail-source"),
    );

    await assert.rejects(
      () => regeneratePublishedEntryFromDraft(editDraftId),
      /orphan regen failed/,
    );

    const orphan = await fs.readFile(path.join(publicArchiveDir(slug), "thumb.avif"), "utf8");
    assert.equal(orphan, "orphan-keep");
  });

  it("does not mutate archive source bytes across generate", async () => {
    installPipelineMock("IMMUTABLE");
    const slug = "2026-01-01-atomic-immutable";
    const sourceBytes = Buffer.from("IMMUTABLE-ORIGINAL-SOURCE");
    const draft = await seedDraftWithSource(slug, sourceBytes);

    await generateArchiveFromDraft(draft.draftId);

    const sourcePath = path.join(contentArchiveSourceDir(slug), "master.jpg");
    const onDisk = await fs.readFile(sourcePath);
    assert.equal(onDisk.toString(), sourceBytes.toString());
  });

  it("embeds webp fallback in generated perception.html", async () => {
    installPipelineMock("HTML");
    const slug = "2026-01-01-atomic-html";
    const draft = await seedDraftWithSource(slug, Buffer.from("html-source"));

    await generateArchiveFromDraft(draft.draftId);

    const html = await fs.readFile(
      path.join(process.cwd(), "content", "archive", slug, "perception.html"),
      "utf8",
    );
    assert.match(html, /type="image\/webp"/);
    assert.match(html, /type="image\/avif"/);
    assert.match(html, /<picture>/);
    assert.match(html, /src="data:image\/webp/);
    assert.doesNotMatch(html, /srcset="\/archive\//);
  });

  it("restores live public directory on rollback", async () => {
    const slug = "2026-01-01-atomic-rollback";
    await writeCanonicalPublic(slug, "LIVE-A");
    const staging = await writePublicDerivativesToStaging(slug, fakeBuffers("LIVE-B"));
    const promoted = await promotePublicDerivatives(slug, staging.stagingDir);

    const liveArtwork = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );
    assert.equal(liveArtwork, "artwork-LIVE-B");

    await rollbackPublicPromote(slug, promoted.retiredDir);

    const restored = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );
    assert.equal(restored, "artwork-LIVE-A");
  });

  it("rejects incomplete staging directories", async () => {
    const stagingDir = path.join(publicArchiveStagingRoot(), "invalid-staging");
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.writeFile(path.join(stagingDir, "artwork.avif"), "partial");
    await assert.rejects(() => validatePublicStaging(stagingDir), /missing/);
    await fs.rm(stagingDir, { recursive: true, force: true });
  });

  it("rolls back public promote when content write fails", async () => {
    installPipelineMock("CONTENT-FAIL");
    const slug = "2026-01-01-atomic-content-fail";
    await writeCanonicalPublic(slug, "BEFORE-CONTENT-FAIL");
    const before = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );

    const seeded = await seedDraftWithSource(slug, Buffer.from("content-fail-source"));
    const draft = accessionDraftToArchiveDraft({
      ...seeded,
      status: "generated",
    });

    setArchiveExportContentWriteHookForTests((filePath) => {
      if (filePath.endsWith("metadata.json")) {
        throw new Error("metadata write failed");
      }
    });

    await assert.rejects(
      () =>
        runArchiveExport({
          draft,
          sourceBuffer: Buffer.from("content-fail-source"),
          existingEntry: entryFixture(slug, { status: "generated" }),
        }),
      /metadata write failed/,
    );

    setArchiveExportContentWriteHookForTests(undefined);

    const after = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
      "utf8",
    );
    assert.equal(after, before);
  });
});
