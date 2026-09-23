/** Safe parsing of admin API responses (handles 413 HTML/plaintext). */

export async function readAdminJson<T extends { error?: string }>(
  res: Response,
): Promise<{ ok: boolean; status: number; data: T; rawText: string }> {
  const rawText = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  let data = {} as T;
  if (rawText && (contentType.includes("application/json") || rawText.trimStart().startsWith("{"))) {
    try {
      data = JSON.parse(rawText) as T;
    } catch {
      /* fall through to text error */
    }
  }

  if (!res.ok) {
    const fromJson = typeof data.error === "string" ? data.error : null;
    let message = fromJson;
    if (!message) {
      if (res.status === 413) {
        message =
          "Request too large (413). Reduce source size or re-prepare a smaller master. Supported: source under 2.5 MB, total binary bundle under 3.8 MB.";
      } else if (rawText.trim()) {
        message = rawText.trim().slice(0, 280);
      } else {
        message = `Request failed (${res.status})`;
      }
    }
    return {
      ok: false,
      status: res.status,
      data: { ...data, error: message } as T,
      rawText,
    };
  }

  return { ok: true, status: res.status, data, rawText };
}
