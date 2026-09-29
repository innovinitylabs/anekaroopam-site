import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.ts";
import { openMemoryDb } from "./sqlite.ts";
import {
  createDraft,
  HttpError,
  patchWorkingRevision,
  validateIdentity,
} from "./db.ts";
import { CURATED_SLUGS } from "./curated.ts";
import type { Env } from "./types.ts";

const TOKEN = "test-admin-token";

function memoryEnv() {
  const { raw, db } = openMemoryDb();
  const memoryAsD1 = {
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
  };
  return {
    raw,
    db,
    env: { DB: memoryAsD1, WORKER_ADMIN_TOKEN: TOKEN } as unknown as Env,
  };
}

function call(env: Env, path: string, init: RequestInit = {}, auth = true) {
  const headers = new Headers(init.headers);
  if (auth) headers.set("authorization", `Bearer ${TOKEN}`);
  return worker.fetch(
    new Request(`https://worker.test${path}`, { ...init, headers }),
    env,
  );
}

type Entry = {
  slug: string;
  visible: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

async function listEntries(env: Env): Promise<Entry[]> {
  const res = await call(env, "/admin/curated-visibility");
  assert.equal(res.status, 200);
  return ((await res.json()) as { entries: Entry[] }).entries;
}

test("curated visibility requires the admin token", async () => {
  const { raw, env } = memoryEnv();
  const res = await call(env, "/admin/curated-visibility", {}, false);
  assert.equal(res.status, 401);
  const put = await call(
    env,
    "/admin/curated-visibility/valiroopam",
    { method: "PUT", body: JSON.stringify({ visible: false }) },
    false,
  );
  assert.equal(put.status, 401);
  raw.close();
});

test("curated visibility is not exposed on the public API", async () => {
  const { raw, env } = memoryEnv();
  const res = await call(env, "/public/curated-visibility", {}, false);
  assert.equal(res.status, 401);
  raw.close();
});

test("all curated works default to visible when no row is stored", async () => {
  const { raw, env } = memoryEnv();
  const entries = await listEntries(env);
  assert.deepEqual(
    entries.map((e) => e.slug),
    [...CURATED_SLUGS],
  );
  assert.ok(entries.every((e) => e.visible && e.updatedAt === null));
  raw.close();
});

test("PUT hides and restores one curated work independently", async () => {
  const { raw, env } = memoryEnv();
  const hide = await call(env, "/admin/curated-visibility/valiroopam", {
    method: "PUT",
    body: JSON.stringify({ visible: false, updatedBy: "admin-login" }),
  });
  assert.equal(hide.status, 200);

  let entries = await listEntries(env);
  const byslug = new Map(entries.map((e) => [e.slug, e]));
  assert.equal(byslug.get("valiroopam")?.visible, false);
  assert.equal(byslug.get("valiroopam")?.updatedBy, "admin-login");
  assert.equal(byslug.get("aazhmaarrattam")?.visible, true);
  assert.equal(
    byslug.get("the-one-who-is-crown-among-the-kings")?.visible,
    true,
  );

  const restore = await call(env, "/admin/curated-visibility/valiroopam", {
    method: "PUT",
    body: JSON.stringify({ visible: true }),
  });
  assert.equal(restore.status, 200);
  entries = await listEntries(env);
  assert.ok(entries.every((e) => e.visible));
  raw.close();
});

test("PUT rejects unknown slugs and non-boolean values", async () => {
  const { raw, env } = memoryEnv();
  const unknown = await call(env, "/admin/curated-visibility/not-curated", {
    method: "PUT",
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(unknown.status, 404);
  const bad = await call(env, "/admin/curated-visibility/valiroopam", {
    method: "PUT",
    body: JSON.stringify({ visible: "no" }),
  });
  assert.equal(bad.status, 400);
  raw.close();
});

test("curated visibility never touches the artworks lifecycle", async () => {
  const { raw, db, env } = memoryEnv();
  const draft = await createDraft(db, {
    draftId: "curated-iso",
    title: "Lifecycle",
    idempotencyKey: "curated-iso",
  });
  const countEvents = () =>
    (raw.prepare("SELECT count(*) AS n FROM accession_events").get() as {
      n: number;
    }).n;
  const eventsBefore = countEvents();

  const res = await call(env, "/admin/curated-visibility/aazhmaarrattam", {
    method: "PUT",
    body: JSON.stringify({ visible: false }),
  });
  assert.equal(res.status, 200);

  const row = raw
    .prepare("SELECT status, updated_at FROM artworks WHERE id = ?")
    .get(draft.artwork.id) as { status: string; updated_at: string };
  assert.equal(row.status, "draft");
  assert.equal(row.updated_at, draft.artwork.updated_at);
  assert.equal(countEvents(), eventsBefore);
  raw.close();
});

test("curated slugs are reserved for D1 artworks", async () => {
  const { raw, db } = memoryEnv();
  await assert.rejects(
    () =>
      createDraft(db, {
        draftId: "reserved-create",
        title: "Clash",
        slug: "valiroopam",
        idempotencyKey: "reserved-create",
      }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );

  const draft = await createDraft(db, {
    draftId: "reserved-patch",
    title: "Clash",
    idempotencyKey: "reserved-patch",
  });
  await assert.rejects(
    () => patchWorkingRevision(db, draft.artwork.id, { slug: "aazhmaarrattam" }),
    (err: unknown) => err instanceof HttpError && err.status === 400,
  );
  const identity = await validateIdentity(db, draft.artwork.id, {
    slug: "the-one-who-is-crown-among-the-kings",
  });
  assert.equal(identity.ok, false);
  assert.equal(identity.slugAvailable, false);
  raw.close();
});
