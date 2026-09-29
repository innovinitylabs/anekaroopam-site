import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.ts";
import { openMemoryDb } from "./sqlite.ts";
import { createDraft, deleteArtwork, HttpError } from "./db.ts";
import type { Env } from "./types.ts";

function memoryD1Env(token = "test-admin-token"): {
  env: Env;
  close: () => void;
  createDraftArtwork: () => Promise<{ id: string }>;
} {
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
    async batch(
      statements: Array<{
        run: () => Promise<unknown>;
      }>,
    ) {
      for (const statement of statements) {
        await statement.run();
      }
    },
  };

  return {
    env: {
      DB: memoryAsD1,
      WORKER_ADMIN_TOKEN: token,
      PUBLIC_R2_BASE_URL: "https://example.test",
    } as unknown as Env,
    close: () => raw.close(),
    async createDraftArtwork() {
      const draft = await createDraft(db, {
        draftId: `http-${Date.now()}`,
        title: "HTTP delete",
        idempotencyKey: `http-${Date.now()}`,
      });
      return { id: draft.artwork.id };
    },
  };
}

test("Worker DELETE without confirm=permanent returns 400", async () => {
  const { env, close } = memoryD1Env();
  const res = await worker.fetch(
    new Request("https://worker.test/admin/artworks/any-id", {
      method: "DELETE",
      headers: { authorization: "Bearer test-admin-token" },
    }),
    env,
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.match(body.error ?? "", /confirm=permanent/);
  close();
});

test("Worker DELETE without Bearer returns 401", async () => {
  const { env, close } = memoryD1Env();
  const res = await worker.fetch(
    new Request(
      "https://worker.test/admin/artworks/any-id?confirm=permanent",
      { method: "DELETE" },
    ),
    env,
  );
  assert.equal(res.status, 401);
  close();
});

test("Worker DELETE with confirm permanently removes draft; repeat is 404", async () => {
  const { env, close, createDraftArtwork } = memoryD1Env();
  const artwork = await createDraftArtwork();
  const res = await worker.fetch(
    new Request(
      `https://worker.test/admin/artworks/${encodeURIComponent(artwork.id)}?confirm=permanent`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer test-admin-token" },
      },
    ),
    env,
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { deleted?: boolean };
  assert.equal(body.deleted, true);

  const again = await worker.fetch(
    new Request(
      `https://worker.test/admin/artworks/${encodeURIComponent(artwork.id)}?confirm=permanent`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer test-admin-token" },
      },
    ),
    env,
  );
  assert.equal(again.status, 404);
  close();
});

test("deleteArtwork itself rejects missing artwork with 404 HttpError", async () => {
  const { raw, db } = openMemoryDb();
  await assert.rejects(
    () => deleteArtwork(db, "missing-id"),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
  raw.close();
});
