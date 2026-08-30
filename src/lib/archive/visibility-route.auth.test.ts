import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";

describe("PATCH /api/admin/archive/[slug]/visibility auth", () => {
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  afterEach(() => {
    if (previousEnabled === undefined) {
      delete process.env.ADMIN_INGEST_ENABLED;
    } else {
      process.env.ADMIN_INGEST_ENABLED = previousEnabled;
    }
    if (previousSecret === undefined) {
      delete process.env.ADMIN_INGEST_SECRET;
    } else {
      process.env.ADMIN_INGEST_SECRET = previousSecret;
    }
  });

  async function loadPatch() {
    const href = pathToFileURL(
      path.join(process.cwd(), "src/app/api/admin/archive/[slug]/visibility/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.PATCH as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  it("returns 403 when admin ingestion is disabled", async () => {
    process.env.ADMIN_INGEST_ENABLED = "false";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    const PATCH = await loadPatch();
    const res = await PATCH(
      new Request("http://localhost/api/admin/archive/x/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hidden" }),
      }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /disabled/i);
  });

  it("returns 403 when ADMIN_INGEST_ENABLED is unset", async () => {
    delete process.env.ADMIN_INGEST_ENABLED;
    delete process.env.ADMIN_INGEST_SECRET;
    const PATCH = await loadPatch();
    const res = await PATCH(
      new Request("http://localhost/api/admin/archive/x/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hidden" }),
      }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 403);
  });

  it("returns 401 when flag is on but no secret or bearer is provided", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    const PATCH = await loadPatch();
    const res = await PATCH(
      new Request("http://localhost/api/admin/archive/x/visibility", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "hidden" }),
      }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 401);
  });
});
