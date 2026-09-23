/**
 * Test helper: mint a signed admin Bearer token.
 * Sets ADMIN_SESSION_SECRET when unset so existing route tests can authenticate
 * without using the raw ADMIN_INGEST_SECRET as the session value.
 */
import { signAdminSession } from "./admin-session";

export function ensureTestAdminSessionSecret(): string {
  if (!process.env.ADMIN_SESSION_SECRET?.trim()) {
    process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret";
  }
  return process.env.ADMIN_SESSION_SECRET;
}

export function mintTestAdminBearer(options?: {
  login?: string;
  sub?: string;
  method?: "oauth" | "secret";
}): string {
  ensureTestAdminSessionSecret();
  return signAdminSession({
    sub: options?.sub ?? "42",
    login: options?.login ?? "test-admin",
    method: options?.method ?? "secret",
  });
}

export function testAdminAuthHeaders(options?: {
  login?: string;
  sub?: string;
  method?: "oauth" | "secret";
}): Record<string, string> {
  return {
    Authorization: `Bearer ${mintTestAdminBearer(options)}`,
  };
}
