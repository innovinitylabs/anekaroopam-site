import { NextResponse } from "next/server";
import {
  GitHubCommitConflictError,
  GitHubNotConfiguredError,
} from "@/lib/github/errors";

export function githubErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof GitHubNotConfiguredError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof GitHubCommitConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.message.includes("GitHub archive not configured")) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  return null;
}
