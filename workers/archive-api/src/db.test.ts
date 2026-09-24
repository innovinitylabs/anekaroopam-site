import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  allocateAccessionId,
  createDraft,
  findByIdempotencyKey,
  freezeWorkingRevision,
  getArtwork,
  patchWorkingRevision,
  publishRevision,
  registerAsset,
  revisionHasRequiredAssets,
} from "./db";
import { migrationSqlPath, openMemoryDb } from "./sqlite";
import { DEFAULT_REQUIRED_ROLES, formatAccessionId } from "./types";

test("migration SQL applies cleanly", () => {
  const { raw } = openMemoryDb();
  const tables = raw
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    )
    .all() as Array<{ name: string }>;
  const names = tables.map((t) => t.name);
  // tables asserted below
  assert.ok(names.includes("accession_counters"));
  assert.ok(names.includes("artworks"));
  assert.ok(names.includes("artwork_revisions"));
  assert.ok(names.includes("assets"));
  assert.ok(names.includes("revision_assets"));
  assert.ok(names.includes("accession_events"));
  assert.ok(names.includes("idempotency_keys"));
  assert.ok(readFileSync(migrationSqlPath(), "utf8").includes("CREATE TABLE"));
  raw.close();
});


test("formatAccessionId pads and extends width", () => {
  assert.equal(formatAccessionId(2026, 1), "AR-2026-0001");
  assert.equal(formatAccessionId(2026, 42), "AR-2026-0042");
  assert.equal(formatAccessionId(2026, 9999), "AR-2026-9999");
  assert.equal(formatAccessionId(2026, 10000), "AR-2026-10000");
});

test("allocateAccessionId returns AR-YYYY-0001 then increments", async () => {
  const { raw, db } = openMemoryDb();
  const year = 2026;
  const first = await allocateAccessionId(db, year);
  const second = await allocateAccessionId(db, year);
  assert.equal(first, "AR-2026-0001");
  assert.equal(second, "AR-2026-0002");
  const row = raw
    .prepare(`SELECT next_seq FROM accession_counters WHERE year = ?`)
    .get(year) as { next_seq: number };
  assert.equal(row.next_seq, 2);
  raw.close();
});

test("createDraft allocates accession; Idempotency-Key does not bump counter", async () => {
  const { raw, db } = openMemoryDb();
  const year = new Date().getUTCFullYear();

  const a = await createDraft(db, {
    draftId: "draft-a",
    title: "First",
    idempotencyKey: "key-a",
  });
  assert.equal(a.created, true);
  assert.equal(a.artwork.accession_id, `AR-${year}-0001`);
  assert.equal(a.revision.kind, "working");
  assert.equal(a.revision.revision, 1);

  const replay = await createDraft(db, {
    draftId: "draft-a-retry",
    title: "Should ignore",
    idempotencyKey: "key-a",
  });
  assert.equal(replay.created, false);
  assert.equal(replay.artwork.id, a.artwork.id);
  assert.equal(replay.artwork.accession_id, a.artwork.accession_id);

  const counter = raw
    .prepare(`SELECT next_seq FROM accession_counters WHERE year = ?`)
    .get(year) as { next_seq: number };
  assert.equal(counter.next_seq, 1, "idempotent retry must not bump counter");

  const b = await createDraft(db, {
    draftId: "draft-b",
    title: "Second",
    idempotencyKey: "key-b",
  });
  assert.equal(b.artwork.accession_id, `AR-${year}-0002`);

  const found = await findByIdempotencyKey(db, "key-a");
  assert.equal(found, a.artwork.id);
  raw.close();
});

test("patch updates working revision JSON and artworks projections", async () => {
  const { raw, db } = openMemoryDb();
  const { artwork } = await createDraft(db, {
    draftId: "draft-patch",
    title: "Before",
    idempotencyKey: "key-patch",
  });

  const patched = await patchWorkingRevision(db, artwork.id, {
    metadata_json: JSON.stringify({
      title: "After Title",
      year: 2024,
      process: "oil",
    }),
  });
  assert.equal(patched.artwork.title, "After Title");
  assert.equal(patched.artwork.year, 2024);
  assert.equal(patched.artwork.process, "oil");
  assert.match(patched.revision.metadata_json, /After Title/);
  raw.close();
});

test("freeze + register required assets + publish", async () => {
  const { raw, db } = openMemoryDb();
  const { artwork } = await createDraft(db, {
    draftId: "draft-pub",
    title: "Publish Me",
    idempotencyKey: "key-pub",
  });

  const roles = ["original", "artwork", "preview", "thumb"] as const;
  for (const role of roles) {
    await registerAsset(db, {
      artworkId: artwork.id,
      role,
      objectKey: `dev/archive/${artwork.accession_id}/r1/${role}.bin`,
      mimeType: role === "original" ? "image/tiff" : "image/webp",
      byteSize: 100,
      verifiedAt: new Date().toISOString(),
    });
  }

  const ready = await revisionHasRequiredAssets(
    db,
    artwork.id,
    1,
    [...DEFAULT_REQUIRED_ROLES],
  );
  assert.equal(ready.ok, true);

  const { frozen, working } = await freezeWorkingRevision(db, artwork.id);
  assert.equal(frozen.kind, "frozen");
  assert.equal(frozen.revision, 1);
  assert.equal(working.kind, "working");
  assert.equal(working.revision, 2);

  const published = await publishRevision(
    db,
    artwork.id,
    1,
    [...DEFAULT_REQUIRED_ROLES],
  );
  assert.equal(published.status, "published");
  assert.equal(published.published_revision, 1);
  assert.ok(published.thumb_object_key?.includes("/thumb."));

  const again = await getArtwork(db, artwork.id);
  assert.equal(again?.status, "published");
  raw.close();
});
