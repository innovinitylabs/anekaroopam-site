# Archive API Worker (Cloudflare D1)

D1-backed metadata API for Anekaroopam archive. R2 binary signing stays on Vercel in v1.

## Local

```bash
cd workers/archive-api
npm install
npm test
# optional: wrangler secret put WORKER_ADMIN_TOKEN --env dev
# npm run d1:local
# npm run dev
```

## Env

| Name | Purpose |
|------|---------|
| `WORKER_ADMIN_TOKEN` | Bearer token for `/admin/*` |
| `REQUIRED_ROLES` | Comma list; default `original,artwork,preview,thumb` |
| `R2_PUBLIC_BASE_URL` | Public CDN base for URL derivation |
| `R2_KEY_PREFIX` | `dev/` in dig; empty in prod |

## Vercel

Set `ARCHIVE_WORKER_URL` and `ARCHIVE_WORKER_TOKEN` (same value as `WORKER_ADMIN_TOKEN`). When set, Next prefers D1 over GitHub content-store (`preferArchiveWorker()`).

## Routes

- `GET /health`
- `POST /admin/artworks` (+ `Idempotency-Key`)
- `GET|PATCH /admin/artworks/:id`
- `POST /admin/artworks/:id/assets`
- `POST /admin/artworks/:id/assets/verify`
- `POST /admin/artworks/:id/ready`
- `POST /admin/artworks/:id/revisions/freeze`
- `POST /admin/artworks/:id/publish|unpublish|visibility`
- `GET|POST /admin/artworks/:id/events`
- `GET /public/artworks` / `GET /public/artworks/:slug`
