import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  checkAdminIngest,
  getAdminAuthModes,
  isAdminIngestEnabled,
  isGitHubUserAllowlisted,
  parseAdminAllowlist,
  signAdminSession,
  verifyAdminSessionToken,
} from "./admin-guard.ts";
import { canUseSecretFallback } from "./admin-session.ts";
import { requireAdminIngest } from "./admin-ingest-response.ts";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
} from "./admin-test-auth.ts";

describe("admin signed session + allowlist", () => {
  const keys = [
    "ADMIN_INGEST_ENABLED",
    "ADMIN_INGEST_SECRET",
    "ADMIN_INGEST_ALLOW_SECRET",
    "ADMIN_SESSION_SECRET",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "GITHUB_ADMIN_ALLOWLIST",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  function snapshot() {
    for (const key of keys) previous[key] = process.env[key];
  }

  function restore() {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }

  afterEach(() => {
    restore();
  });

  it("fails closed when ingestion is disabled", () => {
    snapshot();
    process.env.ADMIN_INGEST_ENABLED = "false";
    process.env.ADMIN_SESSION_SECRET = "sess";
    const denied = requireAdminIngest(
      new Request("http://localhost/api/admin/drafts"),
    );
    assert.ok(denied);
    assert.equal(denied!.status, 403);
  });

  it("fails closed when ADMIN_SESSION_SECRET is unset", () => {
    snapshot();
    process.env.ADMIN_INGEST_ENABLED = "true";
    delete process.env.ADMIN_SESSION_SECRET;
    assert.equal(isAdminIngestEnabled(), true);
    const denied = requireAdminIngest(
      new Request("http://localhost/api/admin/drafts"),
    );
    assert.ok(denied);
    assert.equal(denied!.status, 403);
  });

  it("rejects requests without a signed session", () => {
    snapshot();
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    const denied = requireAdminIngest(
      new Request("http://localhost/api/admin/drafts"),
    );
    assert.ok(denied);
    assert.equal(denied!.status, 401);
  });

  it("accepts a signed session bearer", () => {
    snapshot();
    process.env.ADMIN_INGEST_ENABLED = "true";
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    const denied = checkAdminIngest(
      new Request("http://localhost/api/admin/drafts", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    assert.equal(denied, null);
  });

  it("rejects bearer equal to raw ADMIN_INGEST_SECRET", () => {
    snapshot();
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "raw-ingest-secret-value";
    process.env.ADMIN_INGEST_ALLOW_SECRET = "true";
    ensureTestAdminSessionSecret();
    const denied = checkAdminIngest(
      new Request("http://localhost/api/admin/drafts", {
        headers: { Authorization: "Bearer raw-ingest-secret-value" },
      }),
    );
    assert.ok(denied);
    assert.equal(denied!.status, 401);
  });

  it("round-trips signed session payload", () => {
    snapshot();
    ensureTestAdminSessionSecret();
    const token = signAdminSession({
      sub: "99",
      login: "bob",
      method: "oauth",
    });
    const payload = verifyAdminSessionToken(token);
    assert.ok(payload);
    assert.equal(payload!.login, "bob");
    assert.equal(payload!.method, "oauth");
    assert.notEqual(token, "raw-ingest-secret-value");
  });

  it("allowlists by login and numeric id", () => {
    snapshot();
    process.env.GITHUB_ADMIN_ALLOWLIST = "Alice,12345";
    const parsed = parseAdminAllowlist();
    assert.ok(parsed.logins.has("alice"));
    assert.ok(parsed.ids.has("12345"));
    assert.equal(isGitHubUserAllowlisted({ id: 1, login: "alice" }), true);
    assert.equal(isGitHubUserAllowlisted({ id: 12345, login: "other" }), true);
    assert.equal(isGitHubUserAllowlisted({ id: 2, login: "eve" }), false);
  });

  it("empty allowlist rejects everyone", () => {
    snapshot();
    delete process.env.GITHUB_ADMIN_ALLOWLIST;
    assert.equal(isGitHubUserAllowlisted({ id: 1, login: "alice" }), false);
  });

  it("secret fallback is off by default", () => {
    snapshot();
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    ensureTestAdminSessionSecret();
    delete process.env.ADMIN_INGEST_ALLOW_SECRET;
    assert.equal(canUseSecretFallback(), false);
  });

  it("secret fallback requires explicit flag", () => {
    snapshot();
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.ADMIN_INGEST_ALLOW_SECRET = "true";
    ensureTestAdminSessionSecret();
    assert.equal(canUseSecretFallback(), true);
    const modes = getAdminAuthModes();
    assert.equal(modes.secretFallbackAvailable, true);
  });
});
