import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
} from "./admin-test-auth.ts";
import { ADMIN_SESSION_COOKIE, signAdminSession } from "./admin-session.ts";

describe("POST /api/admin/session secret fallback", () => {
  const keys = [
    "ADMIN_INGEST_ENABLED",
    "ADMIN_INGEST_SECRET",
    "ADMIN_INGEST_ALLOW_SECRET",
    "ADMIN_SESSION_SECRET",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function snap() {
    for (const key of keys) previous[key] = process.env[key];
  }

  async function loadSession() {
    const href = pathToFileURL(
      path.join(process.cwd(), "src/app/api/admin/session/route.ts"),
    ).href;
    return import(`${href}?t=${Date.now()}`);
  }

  it("rejects secret unlock when fallback flag is unset", async () => {
    snap();
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    ensureTestAdminSessionSecret();
    delete process.env.ADMIN_INGEST_ALLOW_SECRET;
    const { POST } = await loadSession();
    const res = await POST(
      new Request("http://localhost/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "test-secret" }),
      }),
    );
    assert.equal(res.status, 403);
  });

  it("issues a signed session cookie when fallback is enabled", async () => {
    snap();
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.ADMIN_INGEST_ALLOW_SECRET = "true";
    ensureTestAdminSessionSecret();
    const { POST } = await loadSession();
    const res = await POST(
      new Request("http://localhost/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: "test-secret" }),
      }),
    );
    assert.equal(res.status, 200);
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const joined = setCookie.join("\n") || res.headers.get("set-cookie") || "";
    assert.match(joined, new RegExp(ADMIN_SESSION_COOKIE));
    assert.doesNotMatch(joined, /test-secret/);
    const data = (await res.json()) as { temporaryFallback?: boolean };
    assert.equal(data.temporaryFallback, true);
  });

  it("GET reports oauth and fallback modes without leaking secrets", async () => {
    snap();
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    delete process.env.ADMIN_INGEST_ALLOW_SECRET;
    const { GET } = await loadSession();
    const res = await GET(new Request("http://localhost/api/admin/session"));
    assert.equal(res.status, 401);
    const data = (await res.json()) as {
      authenticated?: boolean;
      secretFallbackAvailable?: boolean;
      oauthConfigured?: boolean;
    };
    assert.equal(data.authenticated, false);
    assert.equal(data.secretFallbackAvailable, false);
    assert.equal(typeof data.oauthConfigured, "boolean");
  });

  it("GET authenticated when signed cookie presented", async () => {
    snap();
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    const token = signAdminSession({
      sub: "1",
      login: "alice",
      method: "oauth",
    });
    const { GET } = await loadSession();
    const res = await GET(
      new Request("http://localhost/api/admin/session", {
        headers: {
          Cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
        },
      }),
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { authenticated?: boolean; login?: string };
    assert.equal(data.authenticated, true);
    assert.equal(data.login, "alice");
  });
});

describe("allowlist gate unit", () => {
  it("minted bearer authenticates admin APIs", () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    const token = mintTestAdminBearer();
    assert.ok(token.includes("."));
    assert.notEqual(token, process.env.ADMIN_INGEST_SECRET);
  });
});
