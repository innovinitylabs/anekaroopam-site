/**
 * Visibility of the curated repository works. These works live in the Next
 * repository (src/lib/content/artworks.ts), not in D1; only their visibility
 * setting is stored here. Keep CURATED_SLUGS in sync with that file.
 */

import type { SqlExecutor } from "./db";

export const CURATED_SLUGS = [
  "the-one-who-is-crown-among-the-kings",
  "valiroopam",
  "aazhmaarrattam",
] as const;

const CURATED_SLUG_SET: ReadonlySet<string> = new Set(CURATED_SLUGS);

export function isCuratedSlug(slug: string): boolean {
  return CURATED_SLUG_SET.has(slug);
}

export type CuratedVisibilityRow = {
  slug: string;
  visible: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type StoredRow = {
  slug: string;
  visible: number;
  updated_at: string;
  updated_by: string | null;
};

/** One row per curated slug; slugs without a stored row default to visible. */
export async function listCuratedVisibility(
  db: SqlExecutor,
): Promise<CuratedVisibilityRow[]> {
  const res = await db
    .prepare(
      `SELECT slug, visible, updated_at, updated_by FROM curated_visibility`,
    )
    .bind()
    .all<StoredRow>();
  const stored = new Map(res.results.map((row) => [row.slug, row]));
  return CURATED_SLUGS.map((slug) => {
    const row = stored.get(slug);
    return {
      slug,
      visible: row ? row.visible === 1 : true,
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    };
  });
}

export async function setCuratedVisibility(
  db: SqlExecutor,
  slug: string,
  visible: boolean,
  updatedBy: string | null,
): Promise<CuratedVisibilityRow> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO curated_visibility (slug, visible, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         visible = excluded.visible,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(slug, visible ? 1 : 0, now, updatedBy)
    .run();
  return { slug, visible, updatedAt: now, updatedBy };
}
