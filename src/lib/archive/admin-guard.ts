import { timingSafeEqual } from "node:crypto";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  canUseSecretFallback,
  getAdminSessionSecret,
  getGitHubOAuthConfig,
  verifyAdminSessionToken,
  type AdminSessionPayload,
} from "./admin-session";

export {
  ADMIN_SESSION_COOKIE,
  ADMIN_INGEST_COOKIE_LEGACY,
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminSessionCookieOptions,
  canUseSecretFallback,
  getAdminSessionSecret,
  getGitHubOAuthConfig,
  isAdminSecretFallbackAllowed,
  isGitHubUserAllowlisted,
  parseAdminAllowlist,
  signAdminSession,
  verifyAdminSessionToken,
  createOAuthState,
} from "./admin-session";

/** @deprecated Legacy cookie name — cleared on logout only. */
export const ADMIN_INGEST_COOKIE = "anek_admin_ingest";

export type AdminAuthFailure = {
  status: 401 | 403;
  error: string;
};

export function isAdminIngestEnabled(): boolean {
  return process.env.ADMIN_INGEST_ENABLED === "true";
}

export function getAdminIngestSecret(): string | null {
  const secret = process.env.ADMIN_INGEST_SECRET?.trim();
  return secret ? secret : null;
}

export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [cookieName, ...rest] = part.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function readAdminSessionToken(request: Request): string | null {
  return bearerToken(request) ?? readCookie(request, ADMIN_SESSION_COOKIE);
}

export function readAdminSession(
  request: Request,
): AdminSessionPayload | null {
  const token = readAdminSessionToken(request);
  if (!token) return null;
  return verifyAdminSessionToken(token);
}

/**
 * Fail-closed admin auth.
 * Requires ADMIN_INGEST_ENABLED and a valid signed session (OAuth or secret fallback).
 * ADMIN_SESSION_SECRET must be configured to verify sessions.
 */
export function checkAdminIngest(request: Request): AdminAuthFailure | null {
  if (!isAdminIngestEnabled()) {
    return { status: 403, error: "Admin ingestion disabled" };
  }
  if (!getAdminSessionSecret()) {
    return { status: 403, error: "Admin session secret not configured" };
  }
  const session = readAdminSession(request);
  if (!session) {
    return { status: 401, error: "Admin authentication required" };
  }
  return null;
}

/** Auth mode available to the unlock UI (no secrets leaked). */
export function getAdminAuthModes(): {
  oauthConfigured: boolean;
  secretFallbackAvailable: boolean;
} {
  return {
    oauthConfigured: Boolean(getGitHubOAuthConfig()),
    secretFallbackAvailable: canUseSecretFallback(),
  };
}

export { ADMIN_SESSION_MAX_AGE_SECONDS as SESSION_MAX_AGE };
