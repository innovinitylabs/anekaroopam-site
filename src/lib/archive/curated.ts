/**
 * Curated repository works (src/lib/content/artworks.ts) and their visibility.
 *
 * In Worker mode the visibility of each work is stored in D1
 * (curated_visibility) and read through the Worker. Any failure to read it
 * hides every curated work: an outage must never expose a hidden work.
 * Without a Worker there is no visibility store and all curated works show.
 */

import type { PerceptionArtwork } from "@/lib/perception/types";
import { archiveArtworks } from "@/lib/content/artworks";
import {
  workerListCuratedVisibility,
  type WorkerCuratedVisibility,
} from "./worker-client";
import { preferArchiveWorker } from "./worker-config";

export const CURATED_SLUGS: readonly string[] = archiveArtworks.map((a) => a.id);

const CURATED_SLUG_SET: ReadonlySet<string> = new Set(CURATED_SLUGS);

export function isCuratedSlug(slug: string): boolean {
  return CURATED_SLUG_SET.has(slug);
}

export type CuratedVisibility =
  | {
      known: true;
      visible: ReadonlySet<string>;
      entries: WorkerCuratedVisibility[];
    }
  | { known: false; reason: string };

function parseEntries(value: unknown): WorkerCuratedVisibility[] | null {
  if (!value || typeof value !== "object") return null;
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  const parsed: WorkerCuratedVisibility[] = [];
  for (const item of entries) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as { slug?: unknown }).slug !== "string" ||
      typeof (item as { visible?: unknown }).visible !== "boolean"
    ) {
      return null;
    }
    const row = item as WorkerCuratedVisibility;
    parsed.push({
      slug: row.slug,
      visible: row.visible,
      updatedAt: row.updatedAt ?? null,
      updatedBy: row.updatedBy ?? null,
    });
  }
  return parsed;
}

export async function loadCuratedVisibility(): Promise<CuratedVisibility> {
  if (!preferArchiveWorker()) {
    return {
      known: true,
      visible: CURATED_SLUG_SET,
      entries: CURATED_SLUGS.map((slug) => ({
        slug,
        visible: true,
        updatedAt: null,
        updatedBy: null,
      })),
    };
  }
  try {
    const entries = parseEntries(await workerListCuratedVisibility());
    if (!entries) {
      return { known: false, reason: "malformed curated visibility payload" };
    }
    // Slugs the Worker does not report stay hidden.
    const visible = new Set(
      entries
        .filter((e) => e.visible && CURATED_SLUG_SET.has(e.slug))
        .map((e) => e.slug),
    );
    return { known: true, visible, entries };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.warn(
      JSON.stringify({ event: "curated_visibility_unavailable", reason }),
    );
    return { known: false, reason };
  }
}

export function isCuratedVisible(
  visibility: CuratedVisibility,
  slug: string,
): boolean {
  return visibility.known && visibility.visible.has(slug);
}

export function visibleCuratedArtworks(
  visibility: CuratedVisibility,
): PerceptionArtwork[] {
  if (!visibility.known) return [];
  return archiveArtworks.filter((a) => visibility.visible.has(a.id));
}
