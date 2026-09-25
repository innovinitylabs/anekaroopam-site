# Archive data fallback precedence (design only)

Status: **design documented — not implemented for silent public fallback.**
Do not ship automatic public failover until this doc is approved and a visible banner UX is agreed.

## Goals

- Keep Cloudflare Worker + D1 + R2 as the source of truth when configured (`preferArchiveWorker()`).
- Avoid silent wrong data (stale FS / legacy content) when Worker returns a definitive miss.
- Allow bounded recovery only for infrastructure failure (5xx / network), never for not-found.

## Precedence (proposed)

| Surface | Primary | Fallback | When fallback may run | Banner required |
|---|---|---|---|---|
| Public listing | Worker published list | None | Never | N/A |
| Public detail | Worker published by slug | Local `content/archive` + legacy `artworks.ts` | Only Worker **5xx** or **network/timeout** | Yes — “Showing local archive copy” |
| Public detail | Worker | None | Worker **404** / unpublished / hidden | No — treat as missing |
| Admin read (durable) | Worker / GitHub tip | Existing GitHub→FS catch | Already implemented for durable admin | Optional admin notice |
| Admin write | Worker / R2 / D1 only | **Never** write to FS fallback | N/A | N/A |
| HTML mint package | Published R2 revision (on-demand ZIP) | Local FS mint-package only for legacy non-D1 | D1 path never writes `content/archive/` | N/A |

## Explicit non-goals

- No broad silent public fallback on 404.
- No admin commits or lifecycle mutations against fallback trees.
- No changes to accession allocation, frozen revision immutability, or R2 key identity.
- Do not delete legacy trees (`content/archive/`, `public/archive/`, `content/drafts/`) as part of fallback work.

## Implementation gate (Phase 3+)

Approve before coding:

1. Exact HTTP statuses that trigger fallback (recommend: network error, 502/503/504 only).
2. Banner copy and placement on public detail.
3. Telemetry / log line when fallback activates.
4. Confirmation that listing stays Worker-only (no FS merge).

Until approved, keep `preferArchiveWorker()` as a hard switch for public data with no automatic FS failover.
