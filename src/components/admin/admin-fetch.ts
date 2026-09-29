/** Browser fetch for /api/admin that always sends the unlock cookie. */
export function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}
