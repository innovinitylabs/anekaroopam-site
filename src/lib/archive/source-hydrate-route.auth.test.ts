import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";
import {
  ensureTestAdminSessionSecret,
  testAdminAuthHeaders,
} from "./admin-test-auth.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("GET /api/admin/archive/artworks/[id]/source auth", () => {
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

  async function loadRoute() {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    ensureTestAdminSessionSecret();
    const routePath = path.join(
      repoRoot,
      "src/app/api/admin/archive/artworks/[id]/source/route.ts",
    );
    return import(`${pathToFileURL(routePath).href}?t=${Date.now()}`);
  }

  it("rejects unauthenticated requests", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request(
        "http://localhost/api/admin/archive/artworks/art-1/source?role=original",
      ),
      { params: Promise.resolve({ id: "art-1" }) },
    );
    assert.equal(res.status, 401);
  });

  it("rejects preview and thumb roles", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request(
        "http://localhost/api/admin/archive/artworks/art-1/source?role=thumb",
        { headers: testAdminAuthHeaders() },
      ),
      { params: Promise.resolve({ id: "art-1" }) },
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? "", /original|prepared/i);
  });

  it("source route streams via GetObject and never public CDN", () => {
    const routePath = path.join(
      repoRoot,
      "src/app/api/admin/archive/artworks/[id]/source/route.ts",
    );
    const src = readFileSync(routePath, "utf8");
    assert.match(src, /GetObjectCommand/);
    assert.match(src, /ALLOWED_ROLES/);
    assert.match(src, /isSourceWithinLimit/);
    assert.doesNotMatch(src, /publicUrlForR2Key/);
  });
});
