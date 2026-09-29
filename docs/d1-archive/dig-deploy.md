# Dig (dev) deploy steps — Phase 1–7 ops

Do **not** touch prod D1 / prod R2 prefix here.

## 1. D1 database

Already created:

- name: `anekaroopam-archive-dev`
- id: `00cb9e8c-275a-4f22-b24c-39c671ebfd6c` (in `workers/archive-api/wrangler.toml` env `dev`)

Apply migrations:

```bash
cd workers/archive-api
npx wrangler d1 migrations apply anekaroopam-archive-dev --env dev --remote
```

## 2. Worker secret

```bash
cd workers/archive-api
npx wrangler secret put WORKER_ADMIN_TOKEN --env dev
# paste a long random token
```

## 3. Deploy Worker (dev)

```bash
cd workers/archive-api
npm run deploy:dev
# note the workers.dev URL
```

Smoke:

```bash
curl -sS "$WORKER_URL/health"
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: dig-smoke-1" \
  -H "Content-Type: application/json" \
  -d '{"draftId":"draft-smoke-1","title":"Smoke"}' \
  "$WORKER_URL/admin/artworks"
```

## 4. Vercel Preview env

| Variable | Value |
|----------|--------|
| `ARCHIVE_WORKER_URL` | Worker URL from step 3 (no trailing slash) |
| `ARCHIVE_WORKER_TOKEN` | Same as `WORKER_ADMIN_TOKEN` |
| `R2_ARCHIVE_ENABLED` | `true` + existing R2 credentials |
| `R2_KEY_PREFIX` | `dev/` (must match Worker `env.dev` `R2_KEY_PREFIX`) |
| `R2_*` | Dig/dev bucket credentials as already configured |

Leave `ARCHIVE_PREFER_GITHUB_STORE` unset so D1 is preferred.

## 5. Wizard E2E (dig)

1. Open admin ingest on Preview
2. Upload → Prepare → Review → Commit (R2 PUT still via Vercel)
3. Confirm Worker `GET /admin/artworks` shows accession `AR-YYYY-NNNN`
4. Confirm public `GET /public/artworks` lists after publish
5. Confirm gallery thumb uses CDN URL

## 6. Explicit non-goals

- No prod D1 wipe
- No deletion of existing dig R2 objects outside new uploads
- No moving R2 presign into Worker yet
