import { NextResponse } from "next/server";
import {
  ADMIN_INGEST_COOKIE_LEGACY,
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminSessionCookieOptions,
  canUseSecretFallback,
  getAdminAuthModes,
  getAdminIngestSecret,
  isAdminIngestEnabled,
  readAdminSession,
  secretsEqual,
  signAdminSession,
} from "@/lib/archive/admin-guard";
import { getAdminSessionSecret } from "@/lib/archive/admin-session";
import { githubStorageAvailable } from "@/lib/archive/draft-github-store";
import { r2ArchiveReady } from "@/lib/r2/config";
import { preferArchiveWorker } from "@/lib/archive/worker-config";

export const runtime = "nodejs";

/**
 * TEMPORARY emergency/dev secret unlock.
 * Requires ADMIN_INGEST_ALLOW_SECRET=true. Issues a signed session; never stores
 * the raw ADMIN_INGEST_SECRET in the cookie.
 */
export async function POST(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json(
      { error: "Admin ingestion disabled" },
      { status: 403 },
    );
  }

  if (!canUseSecretFallback()) {
    return NextResponse.json(
      { error: "Secret unlock is disabled. Sign in with GitHub." },
      { status: 403 },
    );
  }

  const expected = getAdminIngestSecret();
  if (!expected || !getAdminSessionSecret()) {
    return NextResponse.json(
      { error: "Secret unlock is not available" },
      { status: 403 },
    );
  }

  let body: { secret?: string };
  try {
    body = (await request.json()) as { secret?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const secret = body.secret?.trim() ?? "";
  if (!secret || !secretsEqual(secret, expected)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const sessionToken = signAdminSession({
    sub: "secret-fallback",
    login: "secret-fallback",
    method: "secret",
  });

  const response = NextResponse.json({
    ok: true,
    method: "secret",
    temporaryFallback: true,
  });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    sessionToken,
    adminSessionCookieOptions(ADMIN_SESSION_MAX_AGE_SECONDS),
  );
  response.cookies.set(ADMIN_INGEST_COOKIE_LEGACY, "", {
    ...adminSessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

export async function DELETE() {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json(
      { error: "Admin ingestion disabled" },
      { status: 403 },
    );
  }
  const response = NextResponse.json({ ok: true });
  const clear = { ...adminSessionCookieOptions(0), maxAge: 0 };
  response.cookies.set(ADMIN_SESSION_COOKIE, "", clear);
  response.cookies.set(ADMIN_INGEST_COOKIE_LEGACY, "", clear);
  response.cookies.set(ADMIN_OAUTH_STATE_COOKIE, "", clear);
  return response;
}

export async function GET(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json(
      { error: "Admin ingestion disabled" },
      { status: 403 },
    );
  }

  const modes = getAdminAuthModes();
  if (!getAdminSessionSecret() && !modes.oauthConfigured && !modes.secretFallbackAvailable) {
    return NextResponse.json(
      { error: "Admin authentication is not configured" },
      { status: 403 },
    );
  }

  const durableStorage =
    preferArchiveWorker() || githubStorageAvailable();
  const r2Archive = r2ArchiveReady();
  const d1Archive = preferArchiveWorker();
  const session = readAdminSession(request);
  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        oauthConfigured: modes.oauthConfigured,
        secretFallbackAvailable: modes.secretFallbackAvailable,
        durableStorage,
        r2Archive,
        d1Archive,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    login: session.login,
    method: session.method,
    oauthConfigured: modes.oauthConfigured,
    secretFallbackAvailable: modes.secretFallbackAvailable,
    durableStorage,
    r2Archive,
    d1Archive,
  });
}
