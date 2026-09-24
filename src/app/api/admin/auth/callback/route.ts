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
  parseAdminAllowlist,
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

/** TEMPORARY diagnostics — remove after Preview OAuth allowlist investigation. */
function logOAuthDiag(
  reason: string,
  details: Record<string, string | number | boolean | string[] | null | undefined> = {},
): void {
  console.info("[admin-oauth-diag]", {
    reason,
    hasOauthConfig: Boolean(getGitHubOAuthConfig()),
    hasSessionSecret: Boolean(getAdminSessionSecret()),
    allowlistConfigured: Boolean(process.env.GITHUB_ADMIN_ALLOWLIST?.trim()),
    ...details,
  });
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
    logOAuthDiag("admin_ingest_disabled");
    return NextResponse.redirect(`${origin}/admin/unauthorized`, 302);
  }

  const oauth = getGitHubOAuthConfig();
  if (!oauth || !getAdminSessionSecret()) {
    logOAuthDiag("missing_oauth_or_session_secret", {
      hasOauthConfig: Boolean(oauth),
      hasSessionSecret: Boolean(getAdminSessionSecret()),
    });
    return NextResponse.redirect(`${origin}/admin/unauthorized`, 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, ADMIN_OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    logOAuthDiag("invalid_oauth_state_or_code", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasExpectedStateCookie: Boolean(expectedState),
      stateMatches: Boolean(state && expectedState && state === expectedState),
    });
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
      logOAuthDiag("token_exchange_failed", {
        httpOk: tokenRes.ok,
        githubError: tokenData.error ?? null,
      });
      return unauthorizedRedirect(origin);
    }
    accessToken = tokenData.access_token;
  } catch {
    logOAuthDiag("token_exchange_exception");
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
      logOAuthDiag("github_user_fetch_failed", { status: userRes.status });
      return unauthorizedRedirect(origin);
    }
    const userData = (await userRes.json()) as { id?: number; login?: string };
    if (typeof userData.id !== "number" || typeof userData.login !== "string") {
      logOAuthDiag("github_user_payload_invalid");
      return unauthorizedRedirect(origin);
    }
    user = { id: userData.id, login: userData.login };
  } catch {
    logOAuthDiag("github_user_fetch_exception");
    return unauthorizedRedirect(origin);
  }

  const { logins, ids } = parseAdminAllowlist();
  const loginNormalized = user.login.toLowerCase();
  const allowlisted = isGitHubUserAllowlisted(user);
  logOAuthDiag(allowlisted ? "allowlist_accepted" : "allowlist_rejected", {
    githubLogin: user.login,
    githubLoginNormalized: loginNormalized,
    githubId: user.id,
    allowlistLogins: [...logins],
    allowlistIds: [...ids],
    allowlisted,
  });

  if (!allowlisted) {
    return unauthorizedRedirect(origin);
  }

  const sessionToken = signAdminSession({
    sub: String(user.id),
    login: user.login,
    method: "oauth",
  });

  const response = NextResponse.redirect(`${origin}/admin`, 302);
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
