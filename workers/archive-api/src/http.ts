import type { Env } from "./types";

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function errorJson(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status);
}

export function requireAdmin(request: Request, env: Env): Response | null {
  const header = request.headers.get("authorization") || "";
  const expected = env.WORKER_ADMIN_TOKEN;
  if (!expected) {
    return errorJson(500, "WORKER_ADMIN_TOKEN is not configured");
  }
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return errorJson(401, "Unauthorized");
  }
  return null;
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
