import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { preferDraftSourceForRegenerate } from "./archive-policy.ts";
import {
  draftSourceBytesExist,
  hydrateDraftFromArchiveSlug,
  saveAccessionDraft,
  saveArchiveEntry,
} from "./draft-store.ts";
import { loadArchiveEntry } from "./load-entry.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import { archiveEntryToAccessionDraft } from "./adapters.ts";

function entryFixture(slug: string): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0088",
    slug,
    status: "published",
    metadata: {
      title: "Hydrate Fixture",
      date: "2026-01-01",
      accessionId: "AR-2026-0088",
    },
    assets: {
      artwork: `/archive/${slug}/artwork.avif`,
      preview: `/archive/${slug}/preview.avif`,
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
    processing: {
      preparedSource: "prepared/master-prepared.avif",
      preparedAt: "2026-01-01T00:00:00.000Z",
    },
    perception: { states: [], background: "black" },
    export: {},
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
  });
}

describe("preferDraftSourceForRegenerate", () => {
  it("prefers draft only when filename and bytes exist", () => {
    assert.equal(preferDraftSourceForRegenerate(true, true), true);
    assert.equal(preferDraftSourceForRegenerate(true, false), false);
    assert.equal(preferDraftSourceForRegenerate(false, true), false);
    assert.equal(preferDraftSourceForRegenerate(false, false), false);
  });
});

describe("hydrateDraftFromArchiveSlug materializes source bytes", () => {
  const slug = "2026-01-01-hydrate-fixture";
  const contentDir = path.join(process.cwd(), "content", "archive", slug);
  const draftId = "edit-ar-2026-0088";

  before(async () => {
    await fs.rm(contentDir, { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), "content", "drafts", draftId), {
      recursive: true,
      force: true,
    });

    await fs.mkdir(path.join(contentDir, "source"), { recursive: true });
    await fs.mkdir(path.join(contentDir, "prepared"), { recursive: true });
    await fs.writeFile(path.join(contentDir, "source", "master.jpg"), "source-bytes");
    await fs.writeFile(
      path.join(contentDir, "prepared", "master-prepared.avif"),
      "prepared-bytes",
    );
    await saveArchiveEntry(entryFixture(slug));
  });

  after(async () => {
    await fs.rm(contentDir, { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), "content", "drafts", draftId), {
      recursive: true,
      force: true,
    });
  });

  it("copies archive source and prepared into edit draft when bytes are missing", async () => {
    const entry = await loadArchiveEntry(slug);
    assert.ok(entry);

    const metadataOnly = archiveEntryToAccessionDraft(entry!);
    await saveAccessionDraft(metadataOnly);
    assert.equal(await draftSourceBytesExist(metadataOnly), false);

    const hydrated = await hydrateDraftFromArchiveSlug(slug);
    assert.equal(await draftSourceBytesExist(hydrated), true);
    assert.equal(hydrated.source.kind, "original");
    assert.ok(hydrated.source.storedFilename);

    const draftSourcePath = path.join(
      process.cwd(),
      "content",
      "drafts",
      draftId,
      "source",
      hydrated.source.storedFilename!,
    );
    const draftPreparedPath = path.join(
      process.cwd(),
      "content",
      "drafts",
      draftId,
      "working",
      "master-prepared.avif",
    );
    assert.equal(await fs.readFile(draftSourcePath, "utf8"), "source-bytes");
    assert.equal(await fs.readFile(draftPreparedPath, "utf8"), "prepared-bytes");
  });
});
