import { NextResponse } from "next/server";
import {
  ADMIN_INGEST_COOKIE_LEGACY,
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  isAdminIngestEnabled,
} from "@/lib/archive/admin-guard";

export const runtime = "nodejs";

export async function POST() {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  const clear = { ...adminSessionCookieOptions(0), maxAge: 0 };
  response.cookies.set(ADMIN_SESSION_COOKIE, "", clear);
  response.cookies.set(ADMIN_INGEST_COOKIE_LEGACY, "", clear);
  response.cookies.set(ADMIN_OAUTH_STATE_COOKIE, "", clear);
  return response;
}
