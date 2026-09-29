import { NextResponse } from "next/server";
import {
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminSessionCookieOptions,
  createOAuthState,
  getGitHubOAuthConfig,
  isAdminIngestEnabled,
} from "@/lib/archive/admin-guard";

export const runtime = "nodejs";

function resolveCallbackUrl(request: Request, configured: string | null): string {
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/api/admin/auth/callback`;
}

export async function GET(request: Request) {
  if (!isAdminIngestEnabled()) {
    return NextResponse.json({ error: "Admin ingestion disabled" }, { status: 403 });
  }

  const oauth = getGitHubOAuthConfig();
  if (!oauth) {
    return NextResponse.json(
      { error: "GitHub OAuth is not configured" },
      { status: 503 },
    );
  }

  const state = createOAuthState();
  const callbackUrl = resolveCallbackUrl(request, oauth.callbackUrl);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", oauth.clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize.toString(), 302);
  response.cookies.set(
    ADMIN_OAUTH_STATE_COOKIE,
    state,
    adminSessionCookieOptions(600),
  );
  return response;
}
