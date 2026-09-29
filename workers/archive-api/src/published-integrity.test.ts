import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.ts";
import { openMemoryDb } from "./sqlite.ts";
import {
  createDraft,
  freezeWorkingRevision,
  getArtwork,
  HttpError,
  patchWorkingRevision,
  publishRevision,
  registerAsset,
  type SqlExecutor,
} from "./db.ts";
import { DEFAULT_REQUIRED_ROLES, type Env } from "./types.ts";

const TOKEN = "test-admin-token";
const ROLE_PATH: Record<string, string> = {
  original: "original/original.png",
  prepared: "prepared/master-prepared.avif",
  artwork: "derivatives/artwork.avif",
  preview: "derivatives/preview.avif",
  preview_webp: "derivatives/preview.webp",
  social: "derivatives/social.jpg",
  thumb: "derivatives/thumb.jpg",
};

type ArtworkBody = {
  id: string;
  slug: string;
  status: string;
  title: string;
  year: number | null;
  process: string | null;
  thumbUrl: string | null;
  publishedRevision: number | null;
  metadata: { title?: string };
  assets: Record<string, string>;
};

type JsonBody = {
  error: string;
  artwork: ArtworkBody;
  artworks: ArtworkBody[];
  workingRevision: { metadata: { title?: string } };
};

function keyFor(prefix: string, accessionId: string, revision: number, role: string) {
  return `${prefix}archive/${accessionId}/r${revision}/${ROLE_PATH[role]}`;
}

function setup(prefix: string | null = "dev/") {
  const { raw, db } = openMemoryDb();
  const d1 = {
    prepare(query: string) {
      const prepared = db.prepare(query);
      return {
        bind(...values: unknown[]) {
          const bound = prepared.bind(...values);
          return {
            first: bound.first.bind(bound),
            all: bound.all.bind(bound),
            run: bound.run.bind(bound),
          };
        },
      };
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      for (const statement of statements) await statement.run();
    },
  };
  const env = {
    DB: d1,
    WORKER_ADMIN_TOKEN: TOKEN,
    R2_PUBLIC_BASE_URL: "https://media.test",
    R2_KEY_PREFIX: prefix ?? undefined,
  } as unknown as Env;

  async function call(method: string, path: string, body?: unknown) {
    const res = await worker.fetch(
      new Request(`https://worker.test${path}`, {
        method,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
      env,
    );
    const data = (await res.json()) as JsonBody;
    return { status: res.status, data };
  }

  return { raw, db, env, call, close: () => raw.close() };
}

let seq = 0;
async function seedDraft(db: SqlExecutor, title = "Original Title") {
  seq += 1;
  const { artwork } = await createDraft(db, {
    draftId: `draft-integrity-${seq}`,
    title,
    slug: `integrity-${seq}`,
    idempotencyKey: `integrity-${seq}`,
  });
  await patchWorkingRevision(db, artwork.id, {
    metadata_json: JSON.stringify({ title, year: 2024, process: "Valiroopam" }),
  });
  return (await getArtwork(db, artwork.id))!;
}

async function registerRequired(
  db: SqlExecutor,
  artworkId: string,
  accessionId: string,
  revision: number,
  prefix = "dev/",
) {
  for (const role of DEFAULT_REQUIRED_ROLES) {
    await registerAsset(db, {
      artworkId,
      role,
      objectKey: keyFor(prefix, accessionId, revision, role),
      mimeType: "application/octet-stream",
      byteSize: 10,
      verifiedAt: new Date().toISOString(),
    });
  }
}

async function seedPublished(db: SqlExecutor) {
  const draft = await seedDraft(db);
  await registerRequired(db, draft.id, draft.accession_id, 1);
  const { frozen } = await freezeWorkingRevision(db, draft.id);
  await publishRevision(db, draft.id, frozen.revision, DEFAULT_REQUIRED_ROLES);
  const published = (await getArtwork(db, draft.id))!;
  assert.equal(published.status, "published");
  assert.equal(published.published_revision, 1);
  assert.equal(published.working_revision, 2);
  return published;
}

test("editing a published artwork keeps public list and detail on the published revision", async () => {
  const { db, call, close } = setup();
  const art = await seedPublished(db);

  const patch = await call("PATCH", `/admin/artworks/${art.id}`, {
    metadata: { title: "Unpublished Retitle", year: 2031, process: "Other" },
  });
  assert.equal(patch.status, 200);

  const ready = await call("POST", `/admin/artworks/${art.id}/ready`, {});
  assert.equal(ready.status, 200);
  assert.equal(ready.data.artwork.status, "published");

  const thumb = await call("POST", `/admin/artworks/${art.id}/assets`, {
    role: "thumb",
    objectKey: keyFor("dev/", art.accession_id, 2, "thumb"),
    mimeType: "image/jpeg",
    byteSize: 20,
    verified: true,
  });
  assert.equal(thumb.status, 201);

  const list = await call("GET", "/public/artworks");
  assert.equal(list.status, 200);
  const listed = list.data.artworks.find((a) => a.id === art.id);
  assert.ok(listed, "published artwork must stay in the public list");
  assert.equal(listed.title, "Original Title");
  assert.equal(listed.year, 2024);
  assert.equal(listed.process, "Valiroopam");
  assert.equal(listed.slug, art.slug);
  assert.match(listed.thumbUrl ?? "", /\/r1\/derivatives\/thumb\.jpg$/);

  const detail = await call("GET", `/public/artworks/${art.slug}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.artwork.title, "Original Title");
  assert.equal(detail.data.artwork.year, 2024);
  assert.equal(detail.data.artwork.metadata.title, "Original Title");
  assert.equal(detail.data.artwork.publishedRevision, 1);
  assert.match(detail.data.artwork.thumbUrl ?? "", /\/r1\/derivatives\/thumb\.jpg$/);

  const admin = await call("GET", `/admin/artworks/${art.id}`);
  assert.equal(admin.data.artwork.status, "published");
  assert.equal(admin.data.workingRevision.metadata.title, "Unpublished Retitle");
  close();
});

test("public slug is locked once an artwork has been published", async () => {
  const { db, call, close } = setup();
  const art = await seedPublished(db);

  const renamed = await call("PATCH", `/admin/artworks/${art.id}`, {
    slug: "a-new-public-slug",
  });
  assert.equal(renamed.status, 409);
  assert.match(renamed.data.error, /locked after publication/);

  const same = await call("PATCH", `/admin/artworks/${art.id}`, {
    slug: art.slug,
  });
  assert.equal(same.status, 200);

  const detail = await call("GET", `/public/artworks/${art.slug}`);
  assert.equal(detail.status, 200);
  close();
});

test("failed republish keeps the last published revision intact", async () => {
  const { db, call, close } = setup();
  const art = await seedPublished(db);

  await call("PATCH", `/admin/artworks/${art.id}`, {
    metadata: { title: "Broken Replacement", year: 2030 },
  });
  const unverified = await call("POST", `/admin/artworks/${art.id}/assets`, {
    role: "artwork",
    objectKey: keyFor("dev/", art.accession_id, 2, "artwork"),
    mimeType: "image/avif",
    byteSize: 30,
    verified: false,
  });
  assert.equal(unverified.status, 201);

  const publish = await call("POST", `/admin/artworks/${art.id}/publish`, {});
  assert.equal(publish.status, 409);
  assert.match(publish.data.error, /artwork/);

  const after = (await getArtwork(db, art.id))!;
  assert.equal(after.status, "published");
  assert.equal(after.published_revision, 1);
  assert.equal(after.working_revision, 2, "rejected publish must not freeze");
  assert.equal(after.title, "Original Title");

  const detail = await call("GET", `/public/artworks/${art.slug}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.data.artwork.publishedRevision, 1);
  assert.equal(detail.data.artwork.title, "Original Title");
  assert.match(detail.data.artwork.assets.artwork, /\/r1\/derivatives\/artwork\.avif$/);
  close();
});

test("successful republish replaces the public projection atomically", async () => {
  const { db, call, close } = setup();
  const art = await seedPublished(db);

  await call("PATCH", `/admin/artworks/${art.id}`, {
    metadata: { title: "Second Edition", year: 2025, process: "Valiroopam" },
  });
  for (const role of DEFAULT_REQUIRED_ROLES) {
    const res = await call("POST", `/admin/artworks/${art.id}/assets`, {
      role,
      objectKey: keyFor("dev/", art.accession_id, 2, role),
      mimeType: "application/octet-stream",
      byteSize: 11,
      verified: true,
    });
    assert.equal(res.status, 201);
  }
  const publish = await call("POST", `/admin/artworks/${art.id}/publish`, {});
  assert.equal(publish.status, 200);
  assert.equal(publish.data.artwork.publishedRevision, 2);

  const detail = await call("GET", `/public/artworks/${art.slug}`);
  assert.equal(detail.data.artwork.title, "Second Edition");
  assert.equal(detail.data.artwork.publishedRevision, 2);
  assert.match(detail.data.artwork.thumbUrl ?? "", /\/r2\/derivatives\/thumb\.jpg$/);
  close();
});

test("/ready only moves never-published drafts into the ready lifecycle", async () => {
  const { db, call, close } = setup();

  const empty = await seedDraft(db, "Empty Draft");
  const missing = await call("POST", `/admin/artworks/${empty.id}/ready`, {});
  assert.equal(missing.status, 409);

  const draft = await seedDraft(db, "Complete Draft");
  await registerRequired(db, draft.id, draft.accession_id, 1);
  const ready = await call("POST", `/admin/artworks/${draft.id}/ready`, {});
  assert.equal(ready.status, 200);
  assert.equal(ready.data.artwork.status, "ready");

  const hiddenArt = await seedPublished(db);
  await call("POST", `/admin/artworks/${hiddenArt.id}/visibility`, {
    status: "hidden",
  });
  const hiddenReady = await call("POST", `/admin/artworks/${hiddenArt.id}/ready`, {});
  assert.equal(hiddenReady.status, 200);
  assert.equal(hiddenReady.data.artwork.status, "hidden");

  const withdrawn = await seedPublished(db);
  await call("POST", `/admin/artworks/${withdrawn.id}/visibility`, {
    status: "withdrawn",
  });
  const withdrawnReady = await call("POST", `/admin/artworks/${withdrawn.id}/ready`, {});
  assert.equal(withdrawnReady.status, 409);
  close();
});

test("asset registration accepts only keys in the Worker namespace for the working revision", async () => {
  const { db, call, close } = setup("dev/");
  const draft = await seedDraft(db);
  const other = await seedDraft(db, "Other");
  const register = (objectKey: string, role = "thumb") =>
    call("POST", `/admin/artworks/${draft.id}/assets`, {
      role,
      objectKey,
      mimeType: "image/jpeg",
      byteSize: 5,
      verified: true,
    });

  assert.equal(
    (await register(keyFor("dev/", draft.accession_id, 1, "thumb"))).status,
    201,
  );
  const rejected = [
    keyFor("", draft.accession_id, 1, "thumb"),
    keyFor("prod/", draft.accession_id, 1, "thumb"),
    keyFor("dev/", other.accession_id, 1, "thumb"),
    keyFor("dev/", draft.accession_id, 2, "thumb"),
    `dev/archive/${draft.accession_id}/r1/derivatives/../thumb.jpg`,
  ];
  for (const key of rejected) {
    const res = await register(key);
    assert.equal(res.status, 400, `expected 400 for ${key}`);
  }
  const wrongRole = await register(
    keyFor("dev/", draft.accession_id, 1, "artwork"),
    "thumb",
  );
  assert.equal(wrongRole.status, 400);
  close();
});

test("asset registration fails closed when the Worker has no namespace prefix", async () => {
  for (const prefix of [null, ""]) {
    const { db, call, close } = setup(prefix);
    const draft = await seedDraft(db);
    const res = await call("POST", `/admin/artworks/${draft.id}/assets`, {
      role: "thumb",
      objectKey: keyFor("dev/", draft.accession_id, 1, "thumb"),
      mimeType: "image/jpeg",
      byteSize: 5,
      verified: true,
    });
    assert.equal(res.status, 503);
    close();
  }
});

test("prod namespace Worker rejects dev keys", async () => {
  const { db, call, close } = setup("prod/");
  const draft = await seedDraft(db);
  const dev = await call("POST", `/admin/artworks/${draft.id}/assets`, {
    role: "thumb",
    objectKey: keyFor("dev/", draft.accession_id, 1, "thumb"),
    mimeType: "image/jpeg",
    byteSize: 5,
  });
  assert.equal(dev.status, 400);
  const prod = await call("POST", `/admin/artworks/${draft.id}/assets`, {
    role: "thumb",
    objectKey: keyFor("prod/", draft.accession_id, 1, "thumb"),
    mimeType: "image/jpeg",
    byteSize: 5,
  });
  assert.equal(prod.status, 201);
  close();
});

test("registerAsset refuses a key already owned by another artwork", async () => {
  const { db, close } = setup();
  const a = await seedDraft(db, "Owner");
  const b = await seedDraft(db, "Intruder");
  const key = keyFor("dev/", a.accession_id, 1, "thumb");
  await registerAsset(db, {
    artworkId: a.id,
    role: "thumb",
    objectKey: key,
    mimeType: "image/jpeg",
    byteSize: 5,
  });
  await assert.rejects(
    () =>
      registerAsset(db, {
        artworkId: b.id,
        role: "thumb",
        objectKey: key,
        mimeType: "image/jpeg",
        byteSize: 5,
      }),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );
  close();
});

test("DELETE and event writes resolve by immutable artwork id only", async () => {
  const { db, call, close } = setup();
  const draft = await seedDraft(db);
  for (const alias of [draft.slug, draft.accession_id, draft.draft_id]) {
    const res = await call(
      "DELETE",
      `/admin/artworks/${encodeURIComponent(alias)}?confirm=permanent`,
    );
    assert.equal(res.status, 404, `DELETE by ${alias} must not resolve`);
  }
  assert.ok(await getArtwork(db, draft.id), "artwork must survive alias deletes");

  const event = await call("POST", "/admin/artworks/unknown-id/events", {
    eventType: "note",
  });
  assert.equal(event.status, 404);
  close();
});
