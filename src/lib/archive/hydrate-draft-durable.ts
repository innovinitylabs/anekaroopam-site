/**
 * Hydrate an edit draft from an archive entry without requiring local FS binaries.
 * Prefer GitHub tip when durable storage is available (R2 / Vercel).
 */

import { archiveEntryToAccessionDraft } from "./adapters";
import {
  githubStorageAvailable,
  loadArchiveEntryFromGitHub,
} from "./draft-github-store";
import { hydrateDraftFromArchiveSlug } from "./draft-store";
import { loadArchiveEntry } from "./load-entry";
import type { AccessionDraft } from "./schema";

/**
 * Returns an AccessionDraft for editing/revising an existing archive.
 * On durable hosts: reads metadata from GitHub and does not materialize
 * source bytes onto ephemeral disk (R2 originals stay in object storage).
 * Local FS mode keeps the existing materializing hydrate path.
 */
export async function hydrateDraftFromArchiveSlugDurable(
  slug: string,
): Promise<AccessionDraft> {
  if (githubStorageAvailable()) {
    const fromGitHub = await loadArchiveEntryFromGitHub(slug);
    if (fromGitHub) {
      return archiveEntryToAccessionDraft(fromGitHub);
    }
    // Fall through: deploy snapshot may still have the entry
    const fromFs = await loadArchiveEntry(slug);
    if (fromFs) {
      return archiveEntryToAccessionDraft(fromFs);
    }
    throw new Error(`Archive entry not found: ${slug}`);
  }

  return hydrateDraftFromArchiveSlug(slug);
}
