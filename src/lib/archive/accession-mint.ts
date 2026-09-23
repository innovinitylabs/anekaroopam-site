/**
 * Allocate permanent accession ids from the GitHub tip (not browser provisional ids).
 */

import {
  formatAccessionId,
  formatDraftId,
  type ArchiveEntry,
} from "./schema";
import {
  listAccessionDraftsFromGitHub,
  listArchiveEntriesFromGitHub,
  loadArchiveEntryFromGitHub,
  requireGitHubArchive,
} from "./draft-github-store";

function sequenceFromAccessionId(
  accessionId: string | undefined,
  year: number,
): number | null {
  const match = accessionId?.match(/^AR-(\d{4})-(\d{4})$/);
  if (!match || Number(match[1]) !== year) return null;
  const sequence = Number(match[2]);
  return Number.isFinite(sequence) ? sequence : null;
}

async function nextSequenceFromGitHub(year: number): Promise<number> {
  const prefix = `draft-${year}-`;
  const drafts = await listAccessionDraftsFromGitHub();
  const draftSequences = drafts
    .map((draft) => draft.draftId)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((value) => Number.isFinite(value));
  const archives = await listArchiveEntriesFromGitHub();
  const archiveSequences = archives
    .map((entry) =>
      sequenceFromAccessionId(
        entry.metadata.accessionId ?? entry.accessionId,
        year,
      ),
    )
    .filter((value): value is number => value != null);
  const used = [...draftSequences, ...archiveSequences];
  return (used.length ? Math.max(...used) : 0) + 1;
}

export async function mintPermanentAccessionIds(): Promise<{
  year: number;
  sequence: number;
  accessionId: string;
  draftId: string;
}> {
  requireGitHubArchive();
  const year = new Date().getFullYear();
  const sequence = await nextSequenceFromGitHub(year);
  return {
    year,
    sequence,
    accessionId: formatAccessionId(year, sequence),
    draftId: formatDraftId(year, sequence),
  };
}

export async function resolveCommitIdentity(input: {
  isExistingArchive: boolean;
  slug: string;
}): Promise<{
  accessionId: string;
  draftId: string;
  revision: number;
  existingEntry: ArchiveEntry | null;
}> {
  requireGitHubArchive();
  const existing = await loadArchiveEntryFromGitHub(input.slug);

  if (input.isExistingArchive || existing) {
    if (!existing) {
      throw new Error(`Archive not found for revision: ${input.slug}`);
    }
    const accessionId =
      existing.metadata.accessionId ?? existing.accessionId ?? null;
    if (!accessionId || !/^AR-\d{4}-\d{4}$/.test(accessionId)) {
      throw new Error(
        `Existing archive ${input.slug} is missing a permanent accessionId`,
      );
    }
    const revision = existing.media?.storage === "r2"
      ? existing.media.revision + 1
      : 1;
    const year = Number(accessionId.slice(3, 7));
    const seq = Number(accessionId.slice(8));
    return {
      accessionId,
      draftId: formatDraftId(year, seq),
      revision,
      existingEntry: existing,
    };
  }

  const minted = await mintPermanentAccessionIds();
  return {
    accessionId: minted.accessionId,
    draftId: minted.draftId,
    revision: 1,
    existingEntry: null,
  };
}
