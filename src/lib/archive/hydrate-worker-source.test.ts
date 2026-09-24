import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  hydrateOriginalFile,
  hydratePreparedLocal,
} from "./hydrate-worker-source.ts";

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
