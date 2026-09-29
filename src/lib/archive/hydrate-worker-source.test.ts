import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isSourceWithinLimit,
  MAX_SOURCE_BYTES,
  sourceOverLimitMessage,
} from "./commit-bundle-limits.ts";
import {
  hydrateOriginalFile,
  hydratePreparedLocal,
} from "./hydrate-worker-source.ts";
import {
  canPrepareWorkingMaster,
  canUpdateAndPublish,
} from "./ingest-source-gates.ts";

/** Real failing original size from D1/R2 (was over the old 2.5MB cap). */
const EXISTING_ORIGINAL_BYTES = 2_685_375;

describe("hydrate-worker-source", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("hydrates original into a browser File", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch = (async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "x-filename": "original.jpg",
          "x-object-key": "acc/r1/original/original.jpg",
        },
      })) as typeof fetch;

    const result = await hydrateOriginalFile("draft-2026-abc");
    assert.ok(!("error" in result));
    assert.equal(result.file.name, "original.jpg");
    assert.equal(result.file.type, "image/jpeg");
    assert.equal(result.file.size, 4);
    assert.equal(result.objectKey, "acc/r1/original/original.jpg");
    assert.equal(result.artworkId, "draft-2026-abc");
  });

  it("hydrates existing 2.69 MB original within the 10 MB limit", async () => {
    assert.ok(isSourceWithinLimit(EXISTING_ORIGINAL_BYTES));
    assert.ok(EXISTING_ORIGINAL_BYTES > 2_500_000);
    assert.ok(EXISTING_ORIGINAL_BYTES <= MAX_SOURCE_BYTES);

    const bytes = new Uint8Array(EXISTING_ORIGINAL_BYTES);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    globalThis.fetch = (async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "x-filename": "original.jpg",
          "x-object-key": "ACC/r2/original/original.jpg",
        },
      })) as typeof fetch;

    const result = await hydrateOriginalFile("draft-2026-large");
    assert.ok(!("error" in result));
    assert.equal(result.file.size, EXISTING_ORIGINAL_BYTES);
    assert.equal(result.file.name, "original.jpg");
  });

  it("returns 413 when hydrated original exceeds the shared limit", async () => {
    const over = MAX_SOURCE_BYTES + 1;
    assert.equal(isSourceWithinLimit(over), false);

    const bytes = new Uint8Array(over);
    globalThis.fetch = (async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "x-filename": "huge.jpg",
        },
      })) as typeof fetch;

    const result = await hydrateOriginalFile("draft-oversize");
    assert.ok("error" in result);
    assert.equal(result.error.status, 413);
    assert.match(result.error.message, /limit/i);
    assert.match(result.error.message, /10\.00 MB|10 MB/i);
  });

  it("maps route 413 over-limit responses", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: sourceOverLimitMessage(MAX_SOURCE_BYTES + 50) }),
        {
          status: 413,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch;

    const result = await hydrateOriginalFile("draft-413");
    assert.ok("error" in result);
    assert.equal(result.error.status, 413);
  });

  it("reports missing original source", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error:
            "Server source: unavailable. No original asset on the working revision.",
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      )) as typeof fetch;

    const result = await hydrateOriginalFile("draft-missing");
    assert.ok("error" in result);
    assert.equal(result.error.status, 404);
    assert.match(result.error.message, /unavailable/i);
  });

  it("reports failed downloads", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "R2 object body was empty" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const result = await hydrateOriginalFile("draft-fail");
    assert.ok("error" in result);
    assert.equal(result.error.status, 502);
    assert.match(result.error.message, /empty|failed|R2/i);
  });

  it("hydrates prepared into LocalPreparedMaster when available", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    globalThis.fetch = (async () =>
      new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "image/avif",
          "x-filename": "prepared.avif",
          "x-width": "1200",
          "x-height": "800",
          "x-object-key": "acc/r1/prepared/prepared.avif",
        },
      })) as typeof fetch;

    const result = await hydratePreparedLocal("draft-2026-abc");
    assert.ok(!("error" in result));
    assert.equal(result.width, 1200);
    assert.equal(result.height, 800);
    assert.equal(result.blob.size, 3);
    assert.ok(result.objectUrl.startsWith("blob:"));
    URL.revokeObjectURL(result.objectUrl);
  });
});

describe("ingest source gates after hydration", () => {
  it("keeps Update & Publish disabled when hydration fails (no sourceFile)", () => {
    assert.equal(
      canUpdateAndPublish({ hasSourceFile: false, hasPreparedLocal: false }),
      false,
    );
    assert.equal(
      canUpdateAndPublish({ hasSourceFile: false, hasPreparedLocal: true }),
      false,
    );
    assert.equal(
      canPrepareWorkingMaster({ hasDraft: true, hasSourceFile: false }),
      false,
    );
  });

  it("allows Prepare after successful hydration provides sourceFile", () => {
    assert.equal(
      canPrepareWorkingMaster({
        hasDraft: true,
        hasSourceFile: true,
        sourceHydrating: false,
      }),
      true,
    );
    assert.equal(
      canPrepareWorkingMaster({
        hasDraft: true,
        hasSourceFile: true,
        sourceHydrating: true,
      }),
      false,
    );
    assert.equal(
      canUpdateAndPublish({ hasSourceFile: true, hasPreparedLocal: true }),
      true,
    );
  });
});

describe("source size limit constants", () => {
  it("uses a 10 MB shared master limit", () => {
    assert.equal(MAX_SOURCE_BYTES, 10 * 1024 * 1024);
    assert.equal(isSourceWithinLimit(EXISTING_ORIGINAL_BYTES), true);
    assert.equal(isSourceWithinLimit(MAX_SOURCE_BYTES), true);
    assert.equal(isSourceWithinLimit(MAX_SOURCE_BYTES + 1), false);
  });
});
