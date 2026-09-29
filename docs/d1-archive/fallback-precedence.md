# Archive data fallback precedence

Status: **implemented for gated public paths** (Worker infrastructure failure only).

## Goals

- Keep Cloudflare Worker + D1 + R2 as the source of truth when configured (`preferArchiveWorker()`).
- Avoid silent wrong data (stale FS / legacy content) when Worker returns a definitive miss.
- Allow bounded recovery only for infrastructure failure (5xx / network), never for not-found.

## Precedence

| Surface | Primary | Fallback | When fallback may run | Banner |
|---|---|---|---|---|
| Public listing | Worker published list | Empty list + log (no legacy merge) | Worker unavailable | Listing may show empty |
| Public detail | Worker published by slug | Local `content/archive` then legacy `artworks.ts` | Worker **5xx** or **network/timeout** | “Showing local archive copy” |
| Public detail | Worker | None | Worker **404** / unpublished / hidden | No — missing |
| Admin write | Worker / R2 / D1 only | Never | N/A | N/A |

## Implementation notes

- Classification: [`src/lib/archive/worker-outcome.ts`](../../src/lib/archive/worker-outcome.ts)
- Resolve: [`src/lib/content/resolve-artwork.ts`](../../src/lib/content/resolve-artwork.ts)
- Logging: structured `console.warn` with `archive_fallback_active` / `archive_list_worker_unavailable`
