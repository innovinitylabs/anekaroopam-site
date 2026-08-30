import { timingSafeEqual } from "node:crypto";

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

function secretsEqual(provided: string, expected: string): boolean {
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

function cookieToken(request: Request): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ADMIN_INGEST_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

export function readPresentedAdminSecret(request: Request): string | null {
  return bearerToken(request) ?? cookieToken(request);
}

export function isPresentedAdminSecretValid(request: Request): boolean {
  const expected = getAdminIngestSecret();
  if (!expected) return false;
  const presented = readPresentedAdminSecret(request);
  if (!presented) return false;
  return secretsEqual(presented, expected);
}

/** Pure auth check without Next.js imports (fail-closed). */
export function checkAdminIngest(request: Request): AdminAuthFailure | null {
  if (!isAdminIngestEnabled()) {
    return { status: 403, error: "Admin ingestion disabled" };
  }
  if (!getAdminIngestSecret()) {
    return { status: 403, error: "Admin ingestion secret not configured" };
  }
  if (!isPresentedAdminSecretValid(request)) {
    return { status: 401, error: "Admin authentication required" };
  }
  return null;
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
