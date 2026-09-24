import assert from "node:assert/strict";
import test from "node:test";
import {
  createDraft,
  freezeWorkingRevision,
  getArtwork,
  getRevision,
  HttpError,
  patchWorkingRevision,
  publishRevision,
  registerAsset,
  unpublishArtwork,
} from "./db";
import { openMemoryDb } from "./sqlite";
import { DEFAULT_REQUIRED_ROLES } from "./types";

async function seedPublished(
  db: ReturnType<typeof openMemoryDb>["db"],
  input: { draftId: string; title: string; key: string },
) {
  const { artwork } = await createDraft(db, {
    draftId: input.draftId,
    title: input.title,
    idempotencyKey: input.key,
  });
  await patchWorkingRevision(db, artwork.id, {
    metadata_json: JSON.stringify({
      title: input.title,
      year: 2026,
      process: "Valiroopam",
    }),
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
  return getArtwork(db, artwork.id);
}

test("unpublish then republish keeps accession and freezes a new tip", async () => {
  const { raw, db } = openMemoryDb();
  const year = new Date().getUTCFullYear();
  const beforeCounter = raw
    .prepare(`SELECT next_seq FROM accession_counters WHERE year = ?`)
    .get(year) as { next_seq: number } | undefined;

  const published = await seedPublished(db, {
    draftId: "republish-a",
    title: "Republish Me",
    key: "republish-a",
  });
  assert.ok(published);
  assert.equal(published!.status, "published");
  const accessionId = published!.accession_id;
  const firstPublishedRev = published!.published_revision;
  assert.ok(firstPublishedRev != null);

  const frozenBefore = await getRevision(db, published!.id, firstPublishedRev!);
  assert.equal(frozenBefore?.kind, "frozen");

  const unpublished = await unpublishArtwork(db, published!.id);
  assert.equal(unpublished.status, "ready");
  assert.equal(unpublished.published_revision, null);
  assert.equal(unpublished.accession_id, accessionId);

  const workingRev = unpublished.working_revision;
  const { frozen } = await freezeWorkingRevision(db, unpublished.id);
  assert.equal(frozen.revision, workingRev);
  assert.equal(frozen.kind, "frozen");

  const republished = await publishRevision(
    db,
    unpublished.id,
    frozen.revision,
    DEFAULT_REQUIRED_ROLES,
  );
  assert.equal(republished.status, "published");
  assert.equal(republished.accession_id, accessionId);
  assert.equal(republished.published_revision, frozen.revision);
  assert.notEqual(republished.published_revision, firstPublishedRev);

  const historical = await getRevision(db, unpublished.id, firstPublishedRev!);
  assert.equal(historical?.kind, "frozen");
  assert.equal(historical?.metadata_json, frozenBefore?.metadata_json);

  const afterCounter = raw
    .prepare(`SELECT next_seq FROM accession_counters WHERE year = ?`)
    .get(year) as { next_seq: number };
  const expectedNext = (beforeCounter?.next_seq ?? 0) + 1;
  assert.equal(
    afterCounter.next_seq,
    expectedNext,
    "republish must not allocate another accession",
  );
  raw.close();
});

test("publish after unpublish rejects missing required assets", async () => {
  const { raw, db } = openMemoryDb();
  const { artwork } = await createDraft(db, {
    draftId: "republish-missing",
    title: "No Assets",
    idempotencyKey: "republish-missing",
  });
  const { frozen } = await freezeWorkingRevision(db, artwork.id);
  await assert.rejects(
    () => publishRevision(db, artwork.id, frozen.revision, DEFAULT_REQUIRED_ROLES),
    (err: unknown) =>
      err instanceof HttpError &&
      err.status === 409 &&
      /Missing verified required assets/i.test(err.message),
  );
  raw.close();
});
