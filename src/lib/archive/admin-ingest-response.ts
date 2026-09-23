import { NextResponse } from "next/server";
import { checkAdminIngest } from "./admin-guard";

/** Fail-closed Next.js response wrapper for /api/admin handlers. */
export function requireAdminIngest(request: Request): NextResponse | null {
  const failure = checkAdminIngest(request);
  if (!failure) return null;
  return NextResponse.json({ error: failure.error }, { status: failure.status });
}
