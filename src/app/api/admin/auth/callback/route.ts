import { NextResponse } from "next/server";
import {
  ADMIN_INGEST_COOKIE_LEGACY,
  ADMIN_OAUTH_STATE_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminSessionCookieOptions,
  getGitHubOAuthConfig,
  isAdminIngestEnabled,
  isGitHubUserAllowlisted,
  signAdminSession,
} from "@/lib/archive/admin-guard";
import { getAdminSessionSecret } from "@/lib/archive/admin-session";

export const runtime = "nodejs";

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

function resolveCallbackUrl(request: Request, configured: string | null): string {
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/api/admin/auth/callback`;
}

function clearOAuthState(response: NextResponse): void {
  response.cookies.set(ADMIN_OAUTH_STATE_COOKIE, "", {
    ...adminSessionCookieOptions(0),
    maxAge: 0,
  });
}

function unauthorizedRedirect(origin: string): NextResponse {
  const response = NextResponse.redirect(`${origin}/admin/unauthorized`, 302);
  clearOAuthState(response);
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  if (!isAdminIngestEnabled()) {
    return NextResponse.redirect(`${origin}/admin/unauthorized`, 302);
  }

  const oauth = getGitHubOAuthConfig();
  if (!oauth || !getAdminSessionSecret()) {
    return NextResponse.redirect(`${origin}/admin/unauthorized`, 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, ADMIN_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return unauthorizedRedirect(origin);
  }

  const callbackUrl = resolveCallbackUrl(request, oauth.callbackUrl);

  let accessToken: string;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenRes.ok || !tokenData.access_token) {
      return unauthorizedRedirect(origin);
    }
    accessToken = tokenData.access_token;
  } catch {
    return unauthorizedRedirect(origin);
  }

  let user: { id: number; login: string };
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "anekaroopam-admin",
      },
    });
    if (!userRes.ok) {
      return unauthorizedRedirect(origin);
    }
    const userData = (await userRes.json()) as { id?: number; login?: string };
    if (typeof userData.id !== "number" || typeof userData.login !== "string") {
      return unauthorizedRedirect(origin);
    }
    user = { id: userData.id, login: userData.login };
  } catch {
    return unauthorizedRedirect(origin);
  }

  if (!isGitHubUserAllowlisted(user)) {
    return unauthorizedRedirect(origin);
  }

  const sessionToken = signAdminSession({
    sub: String(user.id),
    login: user.login,
    method: "oauth",
  });

  const response = NextResponse.redirect(`${origin}/admin/drafts`, 302);
  clearOAuthState(response);
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
