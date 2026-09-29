# GitHub content-store retirement (Phase 8)

When `ARCHIVE_WORKER_URL` + `ARCHIVE_WORKER_TOKEN` are set and `ARCHIVE_PREFER_GITHUB_STORE` is not `true`:

- `preferArchiveWorker()` is true
- `githubStorageAvailable()` returns **false** (GitHub is no longer durable SoT)
- Hot paths use Worker / D1 instead

| Former GitHub SoT path | Status when Worker preferred |
|------------------------|------------------------------|
| `POST /api/admin/drafts` | Worker `POST /admin/artworks` (wizard creates here) |
| `PATCH /api/admin/drafts/:id` | Worker patch working revision (wizard autosave) |
| `upload-auth` mint | Worker accession + working revision |
| `upload-verify` | R2 HEAD + Worker asset register |
| `metadata-commit` | Worker patch + ready + publish |
| `publish` | Worker publish |
| `commit-bundle` | **410** retired |
| Public `resolve-artwork` | Worker `/public/artworks` |

Modules under `src/lib/archive/draft-github-store.ts`, `src/lib/github/publish-entry.ts`, and related commit helpers remain in-tree for emergency rollback (`ARCHIVE_PREFER_GITHUB_STORE=true`) and are not deleted until dig E2E is signed off and a dedicated cleanup PR is approved.
