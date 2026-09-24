# GitHub content-store retirement (Phase 8)

When `ARCHIVE_WORKER_URL` + `ARCHIVE_WORKER_TOKEN` are set and `ARCHIVE_PREFER_GITHUB_STORE` is not `true`, the app uses D1 via the archive Worker as metadata SoT:

| Former GitHub SoT path | Status when Worker preferred |
|------------------------|------------------------------|
| `POST /api/admin/drafts` | Worker `POST /admin/artworks` |
| `PATCH /api/admin/drafts/:id` | Worker patch working revision |
| `upload-auth` mint | Worker accession + working revision |
| `upload-verify` | R2 HEAD + Worker asset register |
| `metadata-commit` | Worker patch + ready + publish |
| `publish` | Worker publish |
| `commit-bundle` | **410** retired |
| Public `resolve-artwork` | Worker `/public/artworks` |

Modules under `src/lib/archive/draft-github-store.ts`, `src/lib/github/publish-entry.ts`, and related commit helpers remain in-tree for rollback (`ARCHIVE_PREFER_GITHUB_STORE=true`) and are not deleted in this phase.
