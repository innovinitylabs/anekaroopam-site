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

type StoredRow = {
  slug: string;
  visible: number;
  updated_at: string;
  updated_by: string | null;
};

function storedRows(raw: ReturnType<typeof memoryEnv>["raw"]): StoredRow[] {
  return raw
    .prepare(
      "SELECT slug, visible, updated_at, updated_by FROM curated_visibility ORDER BY slug",
    )
    .all() as StoredRow[];
}

function putVisibility(env: Env, slug: string, body: unknown, auth = true) {
  return call(
    env,
    `/admin/curated-visibility/${encodeURIComponent(slug)}`,
    { method: "PUT", body: JSON.stringify(body) },
    auth,
  );
}

test("no rows are stored until a visibility change is made", async () => {
  const { raw, env } = memoryEnv();
  await listEntries(env);
  assert.deepEqual(storedRows(raw), []);
  raw.close();
});

test("each change persists as one D1 row per work; other rows are untouched", async () => {
  const { raw, env } = memoryEnv();
  const [crown, vali, aazh] = CURATED_SLUGS;

  assert.equal((await putVisibility(env, crown, { visible: false, updatedBy: "a" })).status, 200);
  assert.equal((await putVisibility(env, aazh, { visible: false, updatedBy: "b" })).status, 200);
  assert.equal((await putVisibility(env, vali, { visible: true, updatedBy: "c" })).status, 200);

  let rows = storedRows(raw);
  assert.deepEqual(
    rows.map((r) => [r.slug, r.visible, r.updated_by]),
    [
      [aazh, 0, "b"],
      [crown, 0, "a"],
      [vali, 1, "c"],
    ],
  );
  assert.ok(rows.every((r) => !Number.isNaN(Date.parse(r.updated_at))));
  const aazhBefore = rows.find((r) => r.slug === aazh)!;
  const valiBefore = rows.find((r) => r.slug === vali)!;

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await putVisibility(env, crown, { visible: true, updatedBy: "d" })).status, 200);

  rows = storedRows(raw);
  assert.equal(rows.length, 3, "upsert must not add a second row for the same work");
  const crownAfter = rows.find((r) => r.slug === crown)!;
  assert.equal(crownAfter.visible, 1);
  assert.equal(crownAfter.updated_by, "d");
  assert.deepEqual(rows.find((r) => r.slug === aazh), aazhBefore);
  assert.deepEqual(rows.find((r) => r.slug === vali), valiBefore);

  const entries = new Map((await listEntries(env)).map((e) => [e.slug, e]));
  assert.equal(entries.get(crown)?.visible, true);
  assert.equal(entries.get(vali)?.visible, true);
  assert.equal(entries.get(aazh)?.visible, false);
  assert.equal(entries.get(aazh)?.updatedBy, "b");
  raw.close();
});

test("the PUT response echoes the persisted row", async () => {
  const { raw, env } = memoryEnv();
  const res = await putVisibility(env, "valiroopam", { visible: false, updatedBy: "curator" });
  const { entry } = (await res.json()) as { entry: Entry };
  const [row] = storedRows(raw);
  assert.deepEqual(entry, {
    slug: row.slug,
    visible: row.visible === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });
  raw.close();
});

test("a wrong admin token is rejected and changes nothing", async () => {
  const { raw, env } = memoryEnv();
  const wrong = await worker.fetch(
    new Request("https://worker.test/admin/curated-visibility/valiroopam", {
      method: "PUT",
      headers: { authorization: "Bearer not-the-token" },
      body: JSON.stringify({ visible: false }),
    }),
    env,
  );
  assert.equal(wrong.status, 401);
  const list = await worker.fetch(
    new Request("https://worker.test/admin/curated-visibility", {
      headers: { authorization: "Bearer not-the-token" },
    }),
    env,
  );
  assert.equal(list.status, 401);
  assert.deepEqual(storedRows(raw), []);
  raw.close();
});

test("invalid bodies are rejected without writing", async () => {
  const { raw, env } = memoryEnv();
  for (const body of ["not json", "{}", JSON.stringify({ visible: 0 }), JSON.stringify({ visible: null })]) {
    const res = await call(env, "/admin/curated-visibility/valiroopam", {
      method: "PUT",
      body,
    });
    assert.equal(res.status, 400, body);
  }
  assert.deepEqual(storedRows(raw), []);
  raw.close();
});

test("updatedBy is trimmed, capped at 120 characters, and optional", async () => {
  const { raw, env } = memoryEnv();
  await putVisibility(env, "valiroopam", { visible: false, updatedBy: `  ${"x".repeat(200)}  ` });
  await putVisibility(env, "aazhmaarrattam", { visible: false, updatedBy: 42 });
  await putVisibility(env, "the-one-who-is-crown-among-the-kings", { visible: false, updatedBy: "   " });
  const rows = new Map(storedRows(raw).map((r) => [r.slug, r]));
  assert.equal(rows.get("valiroopam")?.updated_by, "x".repeat(120));
  assert.equal(rows.get("aazhmaarrattam")?.updated_by, null);
  assert.equal(rows.get("the-one-who-is-crown-among-the-kings")?.updated_by, null);
  raw.close();
});

test("D1 only accepts 0 or 1 for visible", () => {
  const { raw } = memoryEnv();
  assert.throws(() =>
    raw
      .prepare(
        "INSERT INTO curated_visibility (slug, visible, updated_at) VALUES (?, ?, ?)",
      )
      .run("valiroopam", 2, new Date().toISOString()),
  );
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
