import {
  ensureTestAdminSessionSecret,
  testAdminAuthHeaders,
} from "./admin-test-auth.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";

describe("POST /api/admin/archive/metadata-commit auth", () => {
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  afterEach(() => {
    if (previousEnabled === undefined) delete process.env.ADMIN_INGEST_ENABLED;
    else process.env.ADMIN_INGEST_ENABLED = previousEnabled;
    if (previousSecret === undefined) delete process.env.ADMIN_INGEST_SECRET;
    else process.env.ADMIN_INGEST_SECRET = previousSecret;
  });

  async function loadPost() {
    const href = pathToFileURL(
      path.join(
        process.cwd(),
        "src/app/api/admin/archive/metadata-commit/route.ts",
      ),
    ).href;
    const mod = await import(`${href}?auth=${Date.now()}`);
    return mod.POST as (request: Request) => Promise<Response>;
  }

  it("returns 401 when unauthenticated", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    ensureTestAdminSessionSecret();
    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/metadata-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "x" }),
      }),
    );
    assert.equal(res.status, 401);
  });

  it("returns 403 when admin ingestion is disabled", async () => {
    process.env.ADMIN_INGEST_ENABLED = "false";
    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/metadata-commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...testAdminAuthHeaders(),
        },
        body: JSON.stringify({ slug: "x" }),
      }),
    );
    assert.equal(res.status, 403);
  });
});
