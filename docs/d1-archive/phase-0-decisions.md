# D1 Archive — Phase 0 Product Decisions

Accepted for `feature/d1-archive-architecture` (plan defaults):

1. **Hidden public detail:** `404` for non-published public GETs (no notice page in v1).
2. **Minted status:** Provenance-only; no separate `minted` artwork status in D1 v1.
3. **Social derivative:** Optional role; browser may still generate it; not required to publish.
4. **Original CDN:** Object may live in public bucket; gallery does not list/link original. Treat as non-public product surface.
5. **Public list cache:** `force-dynamic` / no long CDN cache in v1 (short TTL acceptable later).
6. **R2 presign ownership:** Remains on Vercel through asset-register phase; Worker does not sign PUTs in v1.
7. **Abandoned accession IDs:** Never recycled.

Locked earlier by plan:
- Accession ID at draft creation via D1 counter.
- Drafts mutate working revision; publish points at frozen revision.
- Soft hide/unpublish; no hard-delete API in v1.
- Required publish roles: `original`, `artwork`, `preview`, `thumb`.
