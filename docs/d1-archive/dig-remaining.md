# Remaining dig checklist (after Worker + D1 are live)

Code path is complete for Phases 0–8 on dig. Phase 9 prod reset stays manual.

## After redeploying Worker with latest code

```bash
cd workers/archive-api
npm run deploy:dev
```

Confirm Preview env:

| Var | Dig value |
|-----|-----------|
| `ARCHIVE_WORKER_URL` | deployed workers.dev URL |
| `ARCHIVE_WORKER_TOKEN` | same as `WORKER_ADMIN_TOKEN` |
| `R2_KEY_PREFIX` | `dev/` |

Redeploy Vercel Preview after env changes.

## Smoke

1. `GET $WORKER_URL/health` → `db: true`
2. Admin session → `d1Archive: true`
3. Upload in wizard → draft has `AR-YYYY-NNNN` from D1
4. Commit → R2 keys under `dev/archive/...` when `R2_KEY_PREFIX=dev/`
5. Publish → `GET $WORKER_URL/public/artworks` lists the work
6. `/archive` on Preview shows the thumb from CDN

## Not in this PR

- Deleting GitHub content-store modules (gated; remove only after dig E2E sign-off)
- Moving R2 presign into Worker
- Production reset (`phase-9-prod-reset.md`)
