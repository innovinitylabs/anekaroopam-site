import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNeverPublishedDeletable,
  assertOwnedAssetKeys,
  canPermanentlyDeleteArtwork,
  performPermanentArtworkDelete,
  requirePermanentDeleteConfirm,
  type PermanentDeleteDeps,
} from "./artwork-delete.ts";

test("requirePermanentDeleteConfirm rejects missing confirm", () => {
  assert.throws(() => requirePermanentDeleteConfirm(null), /confirm=permanent/);
  assert.throws(() => requirePermanentDeleteConfirm("yes"), /confirm=permanent/);
  assert.doesNotThrow(() => requirePermanentDeleteConfirm("permanent"));
});

test("canPermanentlyDeleteArtwork distinguishes lifecycle states", () => {
  assert.equal(
    canPermanentlyDeleteArtwork({
      status: "draft",
      publishedRevision: null,
      publishedAt: null,
      accessionId: "AR-2026-0001",
    }),
    true,
  );
  assert.equal(
    canPermanentlyDeleteArtwork({
      status: "published",
      publishedRevision: 1,
      publishedAt: "2026-01-01",
      accessionId: "AR-2026-0001",
    }),
    false,
  );
  assert.equal(
    canPermanentlyDeleteArtwork({
      status: "ready",
      publishedRevision: 1,
      publishedAt: null,
      accessionId: "AR-2026-0001",
    }),
    false,
  );
  assert.equal(
    canPermanentlyDeleteArtwork({
      status: "ready",
      publishedRevision: null,
      publishedAt: "2026-01-01",
      accessionId: "AR-2026-0001",
    }),
    false,
  );
  assert.equal(
    canPermanentlyDeleteArtwork({
      status: "hidden",
      publishedRevision: null,
      publishedAt: null,
      accessionId: "AR-2026-0001",
    }),
    false,
  );
});

test("assertNeverPublishedDeletable blocks publishedRevision and publishedAt", () => {
  assert.doesNotThrow(() =>
    assertNeverPublishedDeletable({
      status: "draft",
      publishedRevision: null,
      publishedAt: null,
      accessionId: "AR-2026-0001",
    }),
  );
  assert.throws(
    () =>
      assertNeverPublishedDeletable({
        status: "published",
        publishedRevision: 1,
        publishedAt: "2026-01-01",
        accessionId: "AR-2026-0001",
      }),
    /published/,
  );
  assert.throws(
    () =>
      assertNeverPublishedDeletable({
        status: "ready",
        publishedRevision: 2,
        publishedAt: null,
        accessionId: "AR-2026-0001",
      }),
    /published/,
  );
  assert.throws(
    () =>
      assertNeverPublishedDeletable({
        status: "ready",
        publishedRevision: null,
        publishedAt: "2026-01-01",
        accessionId: "AR-2026-0001",
      }),
    /published/,
  );
});

test("assertOwnedAssetKeys accepts matching accession keys", () => {
  const keys = assertOwnedAssetKeys("AR-2026-0001", [
    {
      asset_id: "a1",
      role: "artwork",
      object_key: "archive/AR-2026-0001/r1/derivatives/artwork.avif",
      revision: 1,
    },
  ]);
  assert.deepEqual(keys, [
    "archive/AR-2026-0001/r1/derivatives/artwork.avif",
  ]);
});

test("assertOwnedAssetKeys rejects foreign accession", () => {
  assert.throws(
    () =>
      assertOwnedAssetKeys("AR-2026-0001", [
        {
          asset_id: "a1",
          role: "artwork",
          object_key: "archive/AR-2026-0002/r1/derivatives/artwork.avif",
          revision: 1,
        },
      ]),
    /AR-2026-0002/,
  );
});

test("assertOwnedAssetKeys rejects unparseable archive/ keys", () => {
  assert.throws(
    () =>
      assertOwnedAssetKeys("AR-2026-0001", [
        {
          asset_id: "a1",
          role: "artwork",
          object_key: "archive/not-a-valid-accession/file.avif",
          revision: 1,
        },
      ]),
    /does not match accession/,
  );
});

test("assertOwnedAssetKeys allows non-archive dig keys from D1 join", () => {
  const keys = assertOwnedAssetKeys("AR-2026-0001", [
    {
      asset_id: "dig1",
      role: "artwork",
      object_key: "dig/test-only/object.bin",
      revision: 1,
    },
  ]);
  assert.deepEqual(keys, ["dig/test-only/object.bin"]);
});

function baseDeps(
  overrides: Partial<PermanentDeleteDeps> = {},
): PermanentDeleteDeps {
  return {
    hasR2Config: () => true,
    keyPrefix: null,
    getArtwork: async () => ({
      id: "art-1",
      status: "draft",
      publishedRevision: null,
      publishedAt: null,
      accessionId: "AR-2026-0001",
    }),
    listOwnedAssets: async () => [
      {
        asset_id: "a1",
        role: "artwork",
        object_key: "archive/AR-2026-0001/r1/derivatives/artwork.avif",
        revision: 1,
      },
    ],
    deleteR2Objects: async (keys) => ({ deleted: keys, failed: [] }),
    deleteD1Artwork: async (id) => ({
      deleted: true as const,
      id,
      assetIdsRemoved: ["a1"],
    }),
    ...overrides,
  };
}

test("performPermanentArtworkDelete rejects missing confirm", async () => {
  const result = await performPermanentArtworkDelete("art-1", null, baseDeps());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("performPermanentArtworkDelete rejects published artwork", async () => {
  const result = await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      getArtwork: async () => ({
        id: "art-1",
        status: "published",
        publishedRevision: 1,
        publishedAt: "2026-01-01",
        accessionId: "AR-2026-0001",
      }),
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("R2 failure prevents D1 deletion", async () => {
  let d1Called = false;
  const result = await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      deleteR2Objects: async () => ({
        deleted: [],
        failed: [{ key: "archive/AR-2026-0001/r1/derivatives/artwork.avif", error: "boom" }],
      }),
      deleteD1Artwork: async (id) => {
        d1Called = true;
        return { deleted: true as const, id };
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 502);
    assert.match(result.error, /D1 record was not deleted/);
  }
  assert.equal(d1Called, false);
});

test("successful delete calls R2 with exact owned keys then D1", async () => {
  const r2Keys: string[] = [];
  let d1Id: string | null = null;
  const result = await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      deleteR2Objects: async (keys) => {
        r2Keys.push(...keys);
        return { deleted: keys, failed: [] };
      },
      deleteD1Artwork: async (id) => {
        d1Id = id;
        return { deleted: true as const, id, assetIdsRemoved: ["a1"] };
      },
    }),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(r2Keys, [
    "archive/AR-2026-0001/r1/derivatives/artwork.avif",
  ]);
  assert.equal(d1Id, "art-1");
  if (result.ok) {
    assert.deepEqual(result.r2Deleted, r2Keys);
  }
});

test("unrelated R2 objects are never passed to deleteR2Objects", async () => {
  const unrelated = "archive/AR-2026-9999/r1/derivatives/artwork.avif";
  let seen: string[] = [];
  await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      deleteR2Objects: async (keys) => {
        seen = keys;
        return { deleted: keys, failed: [] };
      },
    }),
  );
  assert.ok(!seen.includes(unrelated));
  assert.deepEqual(seen, [
    "archive/AR-2026-0001/r1/derivatives/artwork.avif",
  ]);
});

test("cross-accession keys abort before R2 or D1", async () => {
  let r2 = false;
  let d1 = false;
  const result = await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      listOwnedAssets: async () => [
        {
          asset_id: "x",
          role: "artwork",
          object_key: "archive/AR-2026-0002/r1/derivatives/artwork.avif",
          revision: 1,
        },
      ],
      deleteR2Objects: async (keys) => {
        r2 = true;
        return { deleted: keys, failed: [] };
      },
      deleteD1Artwork: async (id) => {
        d1 = true;
        return { deleted: true as const, id };
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  assert.equal(r2, false);
  assert.equal(d1, false);
});

test("D1 deletion failure surfaces clear error after R2 success", async () => {
  const result = await performPermanentArtworkDelete(
    "art-1",
    "permanent",
    baseDeps({
      deleteD1Artwork: async () => {
        throw Object.assign(new Error("D1 write failed"), { status: 500 });
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 500);
    assert.match(result.error, /D1 write failed/);
    assert.ok(result.deletedKeys?.length);
  }
});

test("repeated delete surfaces artwork-not-found from getArtwork", async () => {
  const result = await performPermanentArtworkDelete(
    "gone",
    "permanent",
    baseDeps({
      getArtwork: async () => {
        throw Object.assign(new Error("Artwork not found"), { status: 404 });
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.match(result.error, /not found/i);
  }
});
