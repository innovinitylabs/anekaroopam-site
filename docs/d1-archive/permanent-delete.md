# Permanent deletion (never-published drafts)

Hard-delete removes **never-published** Worker/D1 artworks and their **D1-owned** R2 objects. It is irreversible. It is **not** Unpublish, Hide, or Withdraw.

## Eligibility

Allowed only when **all** are true:

- Status is `draft`, `uploading`, or `ready`
- `publishedRevision` is null
- `publishedAt` is null

Published, hidden, or withdrawn artworks (or any record that has ever held a published pointer/timestamp) must use Unpublish / Hide / Withdraw / Restore instead.

## Confirmation

Both layers require `confirm=permanent`:

- Next.js: `DELETE /api/admin/archive/artworks/:id?confirm=permanent` (or JSON body `{ "confirm": "permanent" }`) plus admin ingest auth
- Worker: `DELETE /admin/artworks/:id?confirm=permanent` (or body) plus `Authorization: Bearer <WORKER_ADMIN_TOKEN>`

Missing or invalid confirm → **400**. Browser `window.confirm` is UX only and is not a server gate.

## Flow (Next.js orchestration)

1. Authenticate admin  
2. Require `confirm=permanent`  
3. Load artwork; reject if not never-published (**409**)  
4. List owned assets from D1 (`revision_assets` join)  
5. Validate every `object_key` belongs to this accession (exact keys; abort on foreign accession)  
6. Delete those R2 keys with exact-key `DeleteObjects` (**never** list-by-prefix / bucket wipe)  
7. If any R2 delete fails → **502**; **D1 is not deleted**  
8. Call Worker DELETE with `confirm=permanent` for D1 cleanup  

Worker DELETE does **not** delete R2. It only removes D1 rows after Next has cleaned owned objects (or when there were no keys).

## Ownership and what is not deleted

- Only keys present in D1 asset relationships for this artwork, after accession validation  
- No accession-prefix sweep; orphan objects under the accession path that were never registered in D1 are left  
- Legacy filesystem and GitHub archive content are **out of this path** and are not deleted  

## Repeated deletion

A second delete against a removed artwork returns **404** (artwork not found). That is the documented contract: safe and predictable, not idempotent **200**.

## Failure guarantees (not cross-store transactional)

| Failure | Behavior |
| --- | --- |
| Auth / confirm | 401/403/400; nothing deleted |
| Published / not eligible | 409; nothing deleted |
| Foreign / invalid owned key | 409; nothing deleted |
| R2 partial/total failure | 502; D1 remains; response may list deleted vs failed keys |
| D1 failure after R2 success | Error status from Worker; some R2 keys may already be gone — retry after fixing D1, or reconcile manually |

There is **no** distributed transaction across R2 and D1. Guarantees are ordered fail-stop: D1 is not removed if R2 cleanup reports failure.

## Admin UI

**Delete permanently** appears only for eligible never-published drafts and is labeled separately from **Unpublish**, **Hide**, **Withdraw**, and **Restore**.
