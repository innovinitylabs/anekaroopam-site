import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "anek_admin_session";
/** Legacy cookie that stored the raw ingest secret — cleared on logout. */
export const ADMIN_INGEST_COOKIE_LEGACY = "anek_admin_ingest";
export const ADMIN_OAUTH_STATE_COOKIE = "anek_admin_oauth_state";

export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type AdminSessionMethod = "oauth" | "secret";

export interface AdminSessionPayload {
  sub: string;
  login: string;
  method: AdminSessionMethod;
  exp: number;
}

export function getAdminSessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  return secret ? secret : null;
}

export function isAdminSecretFallbackAllowed(): boolean {
  return process.env.ADMIN_INGEST_ALLOW_SECRET === "true";
}

export function getGitHubOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  callbackUrl: string | null;
} | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim() || null;
  return { clientId, clientSecret, callbackUrl };
}

export function parseAdminAllowlist(): { logins: Set<string>; ids: Set<string> } {
  const raw = process.env.GITHUB_ADMIN_ALLOWLIST?.trim() ?? "";
  const logins = new Set<string>();
  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      ids.add(token);
    } else {
      logins.add(token.toLowerCase());
    }
  }
  return { logins, ids };
}

export function isGitHubUserAllowlisted(user: {
  id: number | string;
  login: string;
}): boolean {
  const { logins, ids } = parseAdminAllowlist();
  if (logins.size === 0 && ids.size === 0) return false;
  if (ids.has(String(user.id))) return true;
  return logins.has(user.login.toLowerCase());
}

function base64UrlEncode(value: Buffer | string): string {
  const buf = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function signAdminSession(
  payload: Omit<AdminSessionPayload, "exp"> & { exp?: number },
  maxAgeSeconds = ADMIN_SESSION_MAX_AGE_SECONDS,
): string {
  const secret = getAdminSessionSecret();
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured");
  }
  const body: AdminSessionPayload = {
    sub: payload.sub,
    login: payload.login,
    method: payload.method,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encoded = base64UrlEncode(JSON.stringify(body));
  const sig = createHmac("sha256", secret).update(encoded).digest();
  return `${encoded}.${base64UrlEncode(sig)}`;
}

export function verifyAdminSessionToken(
  token: string,
): AdminSessionPayload | null {
  const secret = getAdminSessionSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sigPart] = parts;
  if (!encoded || !sigPart) return null;

  const expected = createHmac("sha256", secret).update(encoded).digest();
  let provided: Buffer;
  try {
    provided = base64UrlDecode(sigPart);
  } catch {
    return null;
  }
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(encoded).toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.sub !== "string" ||
    typeof record.login !== "string" ||
    (record.method !== "oauth" && record.method !== "secret") ||
    typeof record.exp !== "number"
  ) {
    return null;
  }
  if (record.exp < Math.floor(Date.now() / 1000)) return null;
  return {
    sub: record.sub,
    login: record.login,
    method: record.method,
    exp: record.exp,
  };
}

export function createOAuthState(): string {
  return base64UrlEncode(randomBytes(24));
}

export function adminSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** TEMPORARY emergency/dev fallback — require ADMIN_INGEST_ALLOW_SECRET=true. */
export function canUseSecretFallback(): boolean {
  return (
    isAdminSecretFallbackAllowed() &&
    Boolean(process.env.ADMIN_INGEST_SECRET?.trim()) &&
    Boolean(getAdminSessionSecret())
  );
}
