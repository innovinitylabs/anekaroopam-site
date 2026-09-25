import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraft,
  deleteArtwork,
  HttpError,
  listAllArtworkAssets,
  listArtworks,
  patchWorkingRevision,
  publishRevision,
  registerAsset,
  freezeWorkingRevision,
  setVisibility,
  validateIdentity,
} from "./db";
import { openMemoryDb } from "./sqlite";
import { DEFAULT_REQUIRED_ROLES } from "./types";

async function seedPublished(
  db: ReturnType<typeof openMemoryDb>["db"],
  input: { draftId: string; title: string; year?: number; process?: string; key: string },
) {
  const { artwork } = await createDraft(db, {
    draftId: input.draftId,
    title: input.title,
    idempotencyKey: input.key,
  });
  const meta = {
    title: input.title,
    year: input.year ?? 2026,
    process: input.process ?? "Valiroopam",
  };
  await patchWorkingRevision(db, artwork.id, {
    metadata_json: JSON.stringify(meta),
  });
  for (const role of DEFAULT_REQUIRED_ROLES) {
    await registerAsset(db, {
      artworkId: artwork.id,
      role,
      objectKey: `test/${input.draftId}/${role}.bin`,
      mimeType: "application/octet-stream",
      byteSize: 10,
      verifiedAt: new Date().toISOString(),
    });
  }
  const { frozen } = await freezeWorkingRevision(db, artwork.id);
  await publishRevision(db, artwork.id, frozen.revision, DEFAULT_REQUIRED_ROLES);
  return artwork.id;
}

test("listArtworks search by title is case-insensitive", async () => {
  const { raw, db } = openMemoryDb();
  await seedPublished(db, {
    draftId: "d1",
    title: "Devil May Cry",
    key: "k1",
  });
  await seedPublished(db, {
    draftId: "d2",
    title: "Other Work",
    key: "k2",
  });

  const hit = await listArtworks(db, { status: "published", q: "devil" });
  assert.equal(hit.total, 1);
  assert.equal(hit.artworks[0].title, "Devil May Cry");

  const miss = await listArtworks(db, { status: "published", q: "zzzz" });
  assert.equal(miss.total, 0);
  assert.equal(miss.artworks.length, 0);
  raw.close();
});

test("listArtworks search by accession and slug", async () => {
  const { raw, db } = openMemoryDb();
  const id = await seedPublished(db, {
    draftId: "d-acc",
    title: "Accession Search",
    key: "k-acc",
  });
  const listed = await listArtworks(db, { status: "published", limit: 10 });
  const row = listed.artworks.find((a) => a.id === id)!;
  assert.ok(row);

  const byAccession = await listArtworks(db, {
    status: "published",
    q: row.accession_id.slice(-4),
  });
  assert.ok(byAccession.artworks.some((a) => a.id === id));

  const bySlug = await listArtworks(db, {
    status: "published",
    q: row.slug.slice(0, 8),
  });
  assert.ok(bySlug.artworks.some((a) => a.id === id));
  raw.close();
});

test("listArtworks combines year and process with AND", async () => {
  const { raw, db } = openMemoryDb();
  await seedPublished(db, {
    draftId: "d-y1",
    title: "A",
    year: 2025,
    process: "Alpha",
    key: "ky1",
  });
  await seedPublished(db, {
    draftId: "d-y2",
    title: "B",
    year: 2026,
    process: "Alpha",
    key: "ky2",
  });
  await seedPublished(db, {
    draftId: "d-y3",
    title: "C",
    year: 2026,
    process: "Beta",
    key: "ky3",
  });

  const both = await listArtworks(db, {
    status: "published",
    year: 2026,
    process: "alpha",
  });
  assert.equal(both.total, 1);
  assert.equal(both.artworks[0].title, "B");

  const cleared = await listArtworks(db, { status: "published" });
  assert.equal(cleared.total, 3);
  raw.close();
});

test("listArtworks rejects non-published when status forced; multi-status admin", async () => {
  const { raw, db } = openMemoryDb();
  const { artwork } = await createDraft(db, {
    draftId: "draft-only",
    title: "Draft Only",
    idempotencyKey: "kd",
  });
  await seedPublished(db, {
    draftId: "pub",
    title: "Published",
    key: "kp",
  });

  const pub = await listArtworks(db, { status: "published" });
  assert.equal(pub.total, 1);
  assert.ok(!pub.artworks.some((a) => a.id === artwork.id));

  const drafts = await listArtworks(db, {
    status: ["draft", "uploading"],
  });
  assert.ok(drafts.artworks.some((a) => a.id === artwork.id));
  raw.close();
});

test("listArtworks pagination and sorting", async () => {
  const { raw, db } = openMemoryDb();
  await seedPublished(db, { draftId: "p1", title: "Zebra", year: 2020, key: "s1" });
  await seedPublished(db, { draftId: "p2", title: "Alpha", year: 2024, key: "s2" });
  await seedPublished(db, { draftId: "p3", title: "Middle", year: 2022, key: "s3" });

  const page1 = await listArtworks(db, {
    status: "published",
    sort: "title_asc",
    limit: 2,
    offset: 0,
  });
  assert.equal(page1.total, 3);
  assert.equal(page1.artworks.length, 2);
  assert.equal(page1.artworks[0].title, "Alpha");

  const page2 = await listArtworks(db, {
    status: "published",
    sort: "title_asc",
    limit: 2,
    offset: 2,
  });
  assert.equal(page2.artworks.length, 1);
  assert.equal(page2.artworks[0].title, "Zebra");
  raw.close();
});

test("validateIdentity checks format and uniqueness", async () => {
  const { raw, db } = openMemoryDb();
  const a = await createDraft(db, {
    draftId: "va",
    title: "One",
    idempotencyKey: "va",
  });
  const b = await createDraft(db, {
    draftId: "vb",
    title: "Two",
    idempotencyKey: "vb",
  });

  const ok = await validateIdentity(db, a.artwork.id, { slug: a.artwork.slug });
  assert.equal(ok.ok, true);
  assert.equal(ok.accessionValid, true);

  const conflict = await validateIdentity(db, a.artwork.id, {
    slug: b.artwork.slug,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.slugAvailable, false);

  const reserved = await validateIdentity(db, a.artwork.id, { slug: "admin" });
  assert.equal(reserved.ok, false);
  raw.close();
});

test("deleteArtwork only allows never-published drafts and removes owned assets", async () => {
  const { raw, db } = openMemoryDb();
  const draft = await createDraft(db, {
    draftId: "del",
    title: "Delete me",
    idempotencyKey: "del",
  });
  await registerAsset(db, {
    artworkId: draft.artwork.id,
    role: "artwork",
    objectKey: `archive/${draft.artwork.accession_id}/r1/derivatives/artwork.avif`,
    mimeType: "image/avif",
    byteSize: 10,
    verifiedAt: new Date().toISOString(),
  });
  const before = await listAllArtworkAssets(db, draft.artwork.id);
  assert.equal(before.length, 1);

  const deleted = await deleteArtwork(db, draft.artwork.id);
  assert.equal(deleted.assetIdsRemoved.length, 1);
  const gone = await listArtworks(db, { q: "Delete me" });
  assert.equal(gone.total, 0);
  const assetsLeft = await db
    .prepare(`SELECT COUNT(*) AS n FROM assets`)
    .bind()
    .first<{ n: number }>();
  assert.equal(Number(assetsLeft?.n ?? -1), 0);

  const pubId = await seedPublished(db, {
    draftId: "no-del",
    title: "Keep",
    key: "no-del",
  });
  await assert.rejects(
    () => deleteArtwork(db, pubId),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );

  await setVisibility(db, pubId, "withdrawn");
  await assert.rejects(
    () => deleteArtwork(db, pubId),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
  raw.close();
});

test("deleteArtwork second call returns 404 (documented repeated-delete contract)", async () => {
  const { raw, db } = openMemoryDb();
  const draft = await createDraft(db, {
    draftId: "del2",
    title: "Delete twice",
    idempotencyKey: "del2",
  });
  await deleteArtwork(db, draft.artwork.id);
  await assert.rejects(
    () => deleteArtwork(db, draft.artwork.id),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
  raw.close();
});

test("deleteArtwork rejects ready artwork with published_revision set", async () => {
  const { raw, db } = openMemoryDb();
  const pubId = await seedPublished(db, {
    draftId: "rev-block",
    title: "Has revision",
    key: "rev-block",
  });
  const row = await db
    .prepare(`SELECT status, published_revision, published_at FROM artworks WHERE id = ?`)
    .bind(pubId)
    .first<{
      status: string;
      published_revision: number | null;
      published_at: string | null;
    }>();
  assert.ok(row?.published_revision != null);
  await assert.rejects(
    () => deleteArtwork(db, pubId),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
  raw.close();
});

test("setVisibility withdrawn emits withdrawn event", async () => {
  const { raw, db } = openMemoryDb();
  const id = await seedPublished(db, {
    draftId: "wd",
    title: "Withdraw",
    key: "wd",
  });
  await setVisibility(db, id, "withdrawn");
  const events = raw
    .prepare(
      `SELECT event_type FROM accession_events WHERE artwork_id = ? ORDER BY created_at DESC`,
    )
    .all(id) as Array<{ event_type: string }>;
  assert.ok(events.some((e) => e.event_type === "withdrawn"));
  assert.ok(!events.some((e) => e.event_type === "error"));
  raw.close();
});
