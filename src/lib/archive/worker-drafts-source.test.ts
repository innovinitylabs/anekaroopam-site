import assert from "node:assert/strict";
import test from "node:test";
import { artworkToDraft } from "./worker-drafts.ts";
import type {
  WorkerArtwork,
  WorkerArtworkDetail,
} from "./worker-client.ts";

function baseArtwork(overrides: Partial<WorkerArtwork> = {}): WorkerArtwork {
  return {
    id: "art-uuid-1",
    accessionId: "ACC-2026-0007",
    draftId: "draft-2026-reopen",
    slug: "2026-01-01-test",
    status: "published",
    workingRevision: 2,
    publishedRevision: 1,
    title: "Test Piece",
    year: 2026,
    process: "ink",
    thumbObjectKey: "acc/r2/thumb/thumb.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    hiddenAt: null,
    withdrawnAt: null,
    createdBy: "tester",
    ...overrides,
  };
}

test("artworkToDraft preserves accession and maps original/prepared", () => {
  const previous = process.env.R2_PUBLIC_BASE_URL;
  process.env.R2_PUBLIC_BASE_URL = "https://media.example.com";

  try {
    const artwork = baseArtwork();
    const detail: WorkerArtworkDetail = {
      artwork,
      workingRevision: {
        revision: 2,
        kind: "working",
        metadata: { title: "Test Piece" },
        perception: { states: [], background: "paper" },
        provenance: undefined,
        export: undefined,
      },
      publishedRevision: {
        revision: 1,
        kind: "frozen",
        metadata: {},
      },
      assets: [
        {
          role: "original",
          object_key: "ACC-2026-0007/r2/original/original.jpg",
          mime_type: "image/jpeg",
          byte_size: 1500,
          verified_at: "2026-01-01T00:00:00.000Z",
          width: 2000,
          height: 1500,
        },
        {
          role: "prepared",
          object_key: "ACC-2026-0007/r2/prepared/prepared.avif",
          mime_type: "image/avif",
          byte_size: 800,
          verified_at: "2026-01-01T01:00:00.000Z",
          width: 2000,
          height: 1500,
        },
        {
          role: "thumb",
          object_key: "ACC-2026-0007/r2/thumb/thumb.jpg",
          mime_type: "image/jpeg",
          byte_size: 40,
          verified_at: "2026-01-01T01:00:00.000Z",
          width: 64,
          height: 64,
        },
      ],
      readiness: { ok: true, missing: [] },
    };

    const draft = artworkToDraft(artwork, detail);
    assert.equal(draft.accessionId, "ACC-2026-0007");
    assert.equal(draft.artwork.metadata.accessionId, "ACC-2026-0007");
    assert.equal(draft.draftId, "draft-2026-reopen");
    assert.equal(draft.source.kind, "original");
    assert.equal(draft.processing.preparedSource, "prepared.avif");
    assert.equal(
      draft.artwork.imageSrc,
      "https://media.example.com/ACC-2026-0007/r2/thumb/thumb.jpg",
    );
    assert.ok(!draft.artwork.imageSrc.includes("/original/"));
  } finally {
    if (previous === undefined) {
      delete process.env.R2_PUBLIC_BASE_URL;
    } else {
      process.env.R2_PUBLIC_BASE_URL = previous;
    }
  }
});

test("artworkToDraft marks migration-required when original is missing", () => {
  const artwork = baseArtwork({ accessionId: "ACC-KEEP-9" });
  const detail: WorkerArtworkDetail = {
    artwork,
    workingRevision: {
      revision: 1,
      kind: "working",
      metadata: {},
    },
    publishedRevision: null,
    assets: [
      {
        role: "preview",
        object_key: "ACC-KEEP-9/r1/preview/preview.avif",
        mime_type: "image/avif",
        byte_size: 100,
        verified_at: null,
        width: 10,
        height: 10,
      },
    ],
    readiness: { ok: false, missing: ["original"] },
  };

  const draft = artworkToDraft(artwork, detail);
  assert.equal(draft.accessionId, "ACC-KEEP-9");
  assert.equal(draft.source.kind, "migration-required");
  assert.deepEqual(draft.processing, {});
});
