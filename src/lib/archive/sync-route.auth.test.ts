import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";

describe("POST /api/admin/archive/[slug]/sync auth", () => {
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;
  const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
  const previousOwner = process.env.GITHUB_ARCHIVE_OWNER;
  const previousRepo = process.env.GITHUB_ARCHIVE_REPO;

  afterEach(() => {
    for (const [key, value] of [
      ["ADMIN_INGEST_ENABLED", previousEnabled],
      ["ADMIN_INGEST_SECRET", previousSecret],
      ["GITHUB_ARCHIVE_TOKEN", previousToken],
      ["GITHUB_ARCHIVE_OWNER", previousOwner],
      ["GITHUB_ARCHIVE_REPO", previousRepo],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function loadPost() {
    const href = pathToFileURL(
      path.join(process.cwd(), "src/app/api/admin/archive/[slug]/sync/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  it("returns 403 when admin ingestion is disabled", async () => {
    process.env.ADMIN_INGEST_ENABLED = "false";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/sync", { method: "POST" }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 403);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /disabled/i);
  });

  it("returns 403 when ADMIN_INGEST_ENABLED is unset", async () => {
    delete process.env.ADMIN_INGEST_ENABLED;
    delete process.env.ADMIN_INGEST_SECRET;
    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/sync", { method: "POST" }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 403);
  });

  it("returns 401 when flag is on but no secret or bearer is provided", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    const POST = await loadPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/sync", { method: "POST" }),
      { params: Promise.resolve({ slug: "some-slug" }) },
    );
    assert.equal(res.status, 401);
  });
});
