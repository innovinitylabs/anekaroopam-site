import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  checkAdminIngest,
  checkAdminSessionToken,
  signAdminSession,
} from "./admin-guard.ts";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
} from "./admin-test-auth.ts";

const ENV_KEYS = ["ADMIN_INGEST_ENABLED", "ADMIN_SESSION_SECRET"] as const;

describe("checkAdminSessionToken (server components)", () => {
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) previous[key] = process.env[key];
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("rejects a missing cookie", () => {
    assert.equal(checkAdminSessionToken(undefined)?.status, 401);
    assert.equal(checkAdminSessionToken(null)?.status, 401);
    assert.equal(checkAdminSessionToken("")?.status, 401);
  });

  it("rejects a forged or tampered token", () => {
    const valid = mintTestAdminBearer({ login: "alice", method: "oauth" });
    const [payload] = valid.split(".");
    assert.equal(checkAdminSessionToken(`${payload}.forged`)?.status, 401);
    assert.equal(checkAdminSessionToken("not-a-token")?.status, 401);
  });

  it("rejects an expired token", () => {
    const expired = signAdminSession({
      sub: "1",
      login: "alice",
      method: "oauth",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    assert.equal(checkAdminSessionToken(expired)?.status, 401);
  });

  it("rejects a token signed with a different secret", () => {
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    process.env.ADMIN_SESSION_SECRET = "rotated-secret";
    assert.equal(checkAdminSessionToken(token)?.status, 401);
  });

  it("fails closed when admin ingestion is disabled", () => {
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    process.env.ADMIN_INGEST_ENABLED = "false";
    assert.equal(checkAdminSessionToken(token)?.status, 403);
  });

  it("fails closed when the session secret is unset", () => {
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    delete process.env.ADMIN_SESSION_SECRET;
    assert.equal(checkAdminSessionToken(token)?.status, 403);
  });

  it("accepts a valid signed session", () => {
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    assert.equal(checkAdminSessionToken(token), null);
  });

  it("matches checkAdminIngest for cookie-borne sessions", () => {
    const token = mintTestAdminBearer({ login: "alice", method: "oauth" });
    const withCookie = new Request("http://localhost/admin", {
      headers: { cookie: `anek_admin_session=${encodeURIComponent(token)}` },
    });
    const without = new Request("http://localhost/admin");
    assert.equal(checkAdminIngest(withCookie), null);
    assert.equal(checkAdminIngest(without)?.status, 401);
  });
});

const APP_DIR = join(process.cwd(), "src", "app");

function walk(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, name));
    else if (entry === name) out.push(full);
  }
  return out;
}

const PRIVATE_DATA_CALLS = [
  "workerListArtworks(",
  "workerGetArtwork(",
  "workerListEvents(",
  "listAccessionDraftsDurable(",
  "listArchiveEntriesFromGitHub(",
  "getAllArchiveEntries(",
  "loadWorkerDashboard(",
  "loadLegacyDashboard(",
  "loadCuratedVisibility(",
];

describe("admin pages gate private data server-side", () => {
  const pages = walk(join(APP_DIR, "admin"), "page.tsx");

  it("finds the admin pages", () => {
    assert.ok(pages.length >= 2);
  });

  for (const file of pages) {
    const source = readFileSync(file, "utf8");
    const exportIdx = source.indexOf("export default");
    const body = exportIdx >= 0 ? source.slice(exportIdx) : "";
    const firstDataCall = PRIVATE_DATA_CALLS.map((c) => body.indexOf(c))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (firstDataCall === undefined) continue;

    it(`${relative(process.cwd(), file)} checks the session before fetching`, () => {
      const guardIdx = body.indexOf("await getAdminPageAuthFailure()");
      assert.ok(guardIdx >= 0, "page must call getAdminPageAuthFailure()");
      assert.ok(
        guardIdx < firstDataCall,
        "session check must precede private data access",
      );
    });
  }
});

describe("admin API routes enforce auth independently", () => {
  const routes = walk(join(APP_DIR, "api", "admin"), "route.ts").filter(
    (file) => {
      const rel = relative(join(APP_DIR, "api", "admin"), file);
      return !rel.startsWith("auth") && !rel.startsWith("session");
    },
  );

  for (const file of routes) {
    it(`${relative(process.cwd(), file)} guards every handler`, () => {
      const source = readFileSync(file, "utf8");
      const handlers =
        source.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ??
        [];
      const guards = source.match(/requireAdminIngest\(request\)/g) ?? [];
      assert.ok(handlers.length > 0, "route exports no handlers");
      assert.ok(
        guards.length >= handlers.length,
        `${handlers.length} handlers but ${guards.length} requireAdminIngest calls`,
      );
    });
  }
});
