# Phase 9 - Production initialization checklist

Run **only** after dig (dev D1 + `dev/` R2 prefix) completes an E2E accession and public listing via Worker. Each step needs explicit human confirmation.

Do **not** run these against dig while developing. Nothing in this checklist deletes data.

## Preconditions

- [ ] Dig Worker (`anekaroopam-archive-api-dev`, env `dev`) healthy: `GET /health` with D1 `ok`
- [ ] Dig accession published; public `GET /public/artworks` returns it
- [ ] Vercel preview uses `ARCHIVE_WORKER_URL` / `ARCHIVE_WORKER_TOKEN` pointing at dig
- [ ] Production Worker + D1 + R2 credentials ready but unused until below

## Production initialization (manual)

1. [ ] Confirm target is **prod** D1 `anekaroopam-archive-prod` (not dig `anekaroopam-archive-dev`)
2. [ ] Create a new empty prod D1 `anekaroopam-archive-prod` (never reuse or wipe the dev database); set its real `database_id` in `workers/archive-api/wrangler.toml`, then apply migrations with `ARCHIVE_PROD_CONFIRM=anekaroopam-archive-prod npm run d1:migrate:prod`. If the prod D1 already contains data, stop and escalate.
3. [ ] Do not delete any R2 objects. Prod writes go under `prod/archive/`. The unprefixed `archive/` prefix holds existing dev data and must be left untouched. Verify that `prod/` is empty by listing only.
4. [ ] Deploy Worker env `prod` (`ARCHIVE_PROD_CONFIRM=anekaroopam-archive-prod npm run deploy:prod`) with prod D1 binding, then set its own `WORKER_ADMIN_TOKEN` (`npx wrangler secret put WORKER_ADMIN_TOKEN --env prod`)
5. [ ] Point Vercel **Production** `ARCHIVE_WORKER_URL` / `ARCHIVE_WORKER_TOKEN` at the prod Worker; set `R2_KEY_PREFIX=prod/` on Production only
6. [ ] Set `ARCHIVE_PREFER_GITHUB_STORE` unset/false so D1 is preferred
7. [ ] Remove `GITHUB_ARCHIVE_*` from the Production target only, after confirming Worker mode is active; keep them on Preview if a rollback path is wanted.
8. [ ] Repository content trees (`content/archive`, `public/archive`, `public/artworks`) are never deleted as part of the reset. Any removal goes in a separate, reviewed PR with explicit approval. The three curated originals are never deleted.
9. [ ] Initialize curated visibility for the three originals in prod (Admin > Curated originals)
10. [ ] E2E on prod: create draft -> prepare -> R2 upload -> verify/register -> publish -> public list/detail
11. [ ] Confirm gallery thumbs use CDN URLs from Worker public payload

## Explicit non-goals

- Do not recycle accession IDs
- Do not delete dig D1 or `dev/` R2 objects as part of prod initialization
- Never delete, move or overwrite objects under the unprefixed `archive/` prefix
- Never touch `public/artworks/`
- Do not move R2 presign into Worker in this phase
