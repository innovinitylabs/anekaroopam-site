import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAdminIngestSecret,
  isAdminIngestEnabled,
} from "./admin-guard.ts";
import { requireAdminIngest } from "./admin-ingest-response.ts";

describe("requireAdminIngest", () => {
  const originalEnabled = process.env.ADMIN_INGEST_ENABLED;
  const originalSecret = process.env.ADMIN_INGEST_SECRET;

  function restore() {
    if (originalEnabled === undefined) delete process.env.ADMIN_INGEST_ENABLED;
    else process.env.ADMIN_INGEST_ENABLED = originalEnabled;
    if (originalSecret === undefined) delete process.env.ADMIN_INGEST_SECRET;
    else process.env.ADMIN_INGEST_SECRET = originalSecret;
  }

  it("fails closed when ingestion is disabled", () => {
    process.env.ADMIN_INGEST_ENABLED = "false";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    const denied = requireAdminIngest(new Request("http://localhost/api/admin/drafts"));
    assert.ok(denied);
    assert.equal(denied.status, 403);
    restore();
  });

  it("fails closed when secret is unset even if flag is true", () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    delete process.env.ADMIN_INGEST_SECRET;
    assert.equal(isAdminIngestEnabled(), true);
    assert.equal(getAdminIngestSecret(), null);
    const denied = requireAdminIngest(new Request("http://localhost/api/admin/drafts"));
    assert.ok(denied);
    assert.equal(denied.status, 403);
    restore();
  });

  it("rejects requests without bearer or cookie", () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    const denied = requireAdminIngest(new Request("http://localhost/api/admin/drafts"));
    assert.ok(denied);
    assert.equal(denied.status, 401);
    restore();
  });

  it("accepts a matching bearer token", () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    const denied = requireAdminIngest(
      new Request("http://localhost/api/admin/drafts", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    assert.equal(denied, null);
    restore();
  });
});
