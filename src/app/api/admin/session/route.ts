import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ADMIN_INGEST_COOKIE,
  adminSessionCookieOptions,
  getAdminIngestSecret,
  isAdminIngestEnabled,
  isPresentedAdminSecretValid,
} from "@/lib/archive/admin-guard";

export const runtime = "nodejs";

const SESSION_MAX_AGE = 60 * 60 * 12;

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json(
      { error: "Admin ingestion disabled" },
      { status: 403 },
    );
  }
  const expected = getAdminIngestSecret();
  if (!expected) {
    return NextResponse.json(
      { error: "Admin ingestion secret not configured" },
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    ADMIN_INGEST_COOKIE,
    expected,
    adminSessionCookieOptions(SESSION_MAX_AGE),
  );
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
  response.cookies.set(ADMIN_INGEST_COOKIE, "", {
    ...adminSessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json(
      { error: "Admin ingestion disabled" },
      { status: 403 },
    );
  }
  if (!getAdminIngestSecret()) {
    return NextResponse.json(
      { error: "Admin ingestion secret not configured" },
      { status: 403 },
    );
  }
  if (!isPresentedAdminSecretValid(request)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}
