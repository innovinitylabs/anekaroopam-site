import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveStatusFromDraft,
  assertArchiveDiscardable,
  bytesForArchiveDerivativeGenerate,
  bytesForArchiveSourceDeposit,
  hasDepositedArchiveSource,
  isArchiveDiscardable,
  keepExplicitPatchKeys,
  preferDraftSourceForRegenerate,
  shouldDepositDraftSourceInArchive,
} from "./archive-policy.ts";
import {
  AccessionDraftUpdateSchema,
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";

function sampleEntry(overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    slug: "2026-01-01-sample",
    status: "generated",
    metadata: {
      title: "Sample",
      date: "2026-01-01",
      accessionId: "AR-2026-0001",
    },
    assets: {
      artwork: "/archive/2026-01-01-sample/artwork.avif",
      preview: "/archive/2026-01-01-sample/preview.avif",
      social: "/archive/2026-01-01-sample/social.jpg",
      thumb: "/archive/2026-01-01-sample/thumb.jpg",
    },
    perception: {
      states: [],
      background: "black",
    },
    export: {},
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("archiveStatusFromDraft", () => {
  it("maps generate-time draft statuses to generated, not published", () => {
    assert.equal(archiveStatusFromDraft("draft"), "generated");
    assert.equal(archiveStatusFromDraft("prepared"), "generated");
    assert.equal(archiveStatusFromDraft("generated"), "generated");
    assert.equal(archiveStatusFromDraft(undefined), "generated");
  });

  it("preserves terminal archive statuses", () => {
    assert.equal(archiveStatusFromDraft("published"), "published");
    assert.equal(archiveStatusFromDraft("minted"), "minted");
    assert.equal(archiveStatusFromDraft("hidden"), "hidden");
    assert.equal(archiveStatusFromDraft("withdrawn"), "withdrawn");
  });
});

describe("isArchiveDiscardable / assertArchiveDiscardable", () => {
  it("allows never-published generated records", () => {
    assert.equal(isArchiveDiscardable(sampleEntry()), true);
    assert.doesNotThrow(() => assertArchiveDiscardable(sampleEntry()));
  });

  it("refuses published, minted, hidden, and withdrawn", () => {
    for (const status of ["published", "minted", "hidden", "withdrawn"] as const) {
      assert.equal(isArchiveDiscardable(sampleEntry({ status })), false);
    }
  });

  it("refuses generated records that carry publication timestamps", () => {
    assert.equal(
      isArchiveDiscardable(sampleEntry({ publishedAt: "2026-01-02T00:00:00.000Z" })),
      false,
    );
    assert.equal(
      isArchiveDiscardable(sampleEntry({ mintedAt: "2026-01-02T00:00:00.000Z" })),
      false,
    );
  });

  it("legacy default status published is not discardable", () => {
    const legacy = ArchiveEntrySchema.parse({
      version: ARCHIVE_VERSION,
      slug: "legacy-entry",
      metadata: { title: "Legacy" },
      assets: {
        artwork: "/a",
        preview: "/p",
        social: "/s",
        thumb: "/t",
      },
      perception: { states: [], background: "black" },
      export: {},
      provenance: { mint: [], auction: [], marketplace: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(legacy.status, "published");
    assert.equal(isArchiveDiscardable(legacy), false);
    assert.throws(() => assertArchiveDiscardable(legacy), /not discardable/);
  });
});

describe("archive deposit vs derivative buffers", () => {
  it("deposits original bytes into source/, never prepared bytes", () => {
    const original = Buffer.from("original-bytes");
    const prepared = Buffer.from("prepared-bytes");
    assert.equal(bytesForArchiveSourceDeposit(original, prepared), original);
  });

  it("always uses original bytes for derivatives even when prepared exists", () => {
    const original = Buffer.from("original-bytes");
    const prepared = Buffer.from("prepared-bytes");
    assert.equal(bytesForArchiveDerivativeGenerate(original, prepared), original);
  });

  it("uses original bytes for derivatives when prepared is absent", () => {
    const original = Buffer.from("original-bytes");
    assert.equal(bytesForArchiveDerivativeGenerate(original, null), original);
  });
});

describe("preferDraftSourceForRegenerate", () => {
  it("requires both filename metadata and readable bytes", () => {
    assert.equal(preferDraftSourceForRegenerate(true, true), true);
    assert.equal(preferDraftSourceForRegenerate(true, false), false);
    assert.equal(preferDraftSourceForRegenerate(false, false), false);
  });
});

describe("hasDepositedArchiveSource", () => {
  it("returns true when original source metadata is deposited", () => {
    const entry = sampleEntry({
      source: {
        kind: "original",
        originalFilename: "master.jpg",
        storedFilename: "master.jpg",
        mimeType: "image/jpeg",
        byteSize: 10,
        importedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    assert.equal(hasDepositedArchiveSource(entry), true);
  });

  it("returns false when source is missing or not original", () => {
    assert.equal(hasDepositedArchiveSource(sampleEntry({ source: undefined })), false);
    assert.equal(
      hasDepositedArchiveSource(
        sampleEntry({
          source: {
            kind: "migration-required",
            originalFilename: "",
            storedFilename: "",
            mimeType: "application/octet-stream",
            byteSize: 0,
            importedAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
      false,
    );
  });
});

describe("shouldDepositDraftSourceInArchive", () => {
  it("allows deposit on first generate when no archive exists", () => {
    assert.equal(shouldDepositDraftSourceInArchive(null), true);
    assert.equal(shouldDepositDraftSourceInArchive(undefined), true);
  });

  it("blocks deposit when archive already has deposited original", () => {
    const entry = sampleEntry({
      source: {
        kind: "original",
        originalFilename: "master.jpg",
        storedFilename: "master.jpg",
        mimeType: "image/jpeg",
        byteSize: 10,
        importedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    assert.equal(shouldDepositDraftSourceInArchive(entry), false);
  });
});

describe("keepExplicitPatchKeys", () => {
  it("does not keep defaulted source when the patch did not set source", () => {
    const patch = {
      status: "prepared" as const,
      processing: { preparedSource: "working/master-prepared.avif" },
    };
    const parsed = AccessionDraftUpdateSchema.parse(patch);
    assert.equal(parsed.source?.kind, "migration-required");
    const assigned = keepExplicitPatchKeys(patch, parsed);
    assert.equal("source" in assigned, false);
    assert.equal(assigned.status, "prepared");
  });
});
