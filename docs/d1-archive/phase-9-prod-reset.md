# Phase 9 — Production reset checklist

Run **only** after dig (dev D1 + `dev/` R2 prefix) completes an E2E accession and public listing via Worker. Each step needs explicit human confirmation.

Do **not** run these against dig while developing.

## Preconditions

- [ ] Dig Worker (`archive-api` env `dev`) healthy: `GET /health` with D1 `ok`
- [ ] Dig accession published; public `GET /public/artworks` returns it
- [ ] Vercel preview uses `ARCHIVE_WORKER_URL` / `ARCHIVE_WORKER_TOKEN` pointing at dig
- [ ] Production Worker + D1 + R2 credentials ready but unused until below

## Production reset (manual)

1. [ ] Confirm target is **prod** D1 `anekaroopam-archive-prod` (not dig)
2. [ ] Wipe/recreate prod D1; apply `workers/archive-api/migrations/0001_init.sql`
3. [ ] Empty **prod** R2 prefix `archive/` only (leave dig `dev/archive/` untouched)
4. [ ] Deploy Worker env `prod` with prod D1 binding + `WORKER_ADMIN_TOKEN`
5. [ ] Point Vercel production `ARCHIVE_WORKER_URL` / `ARCHIVE_WORKER_TOKEN` at prod Worker
6. [ ] Set `ARCHIVE_PREFER_GITHUB_STORE` unset/false so D1 is preferred
7. [ ] Remove or leave unused GitHub content-store env (`GITHUB_ARCHIVE_*`) — source code remains; hot paths are gated
8. [ ] Optional: delete disposable `content/archive` placeholder trees from the repo in a dedicated PR
9. [ ] E2E on prod: create draft → prepare → R2 upload → verify/register → publish → public list/detail
10. [ ] Confirm gallery thumbs use CDN URLs from Worker public payload

## Explicit non-goals

- Do not recycle accession IDs
- Do not delete dig D1 or `dev/` R2 objects as part of prod reset
- Do not move R2 presign into Worker in this phase
