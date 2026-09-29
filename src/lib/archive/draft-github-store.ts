import {
  assertArchiveDiscardable,
  hasDepositedArchiveSource,
  keepExplicitPatchKeys,
} from "./archive-policy";
import { encodePreparedMaster } from "./prepare-pipeline";
import {
  ARCHIVE_VERSION,
  AccessionDraftSchema,
  AccessionDraftUpdateSchema,
  ArchiveEntrySchema,
  CreateAccessionDraftSchema,
  SlugUpdateSchema,
  archiveMasterFilename,
  buildArchiveSlug,
  createDefaultDraftArtwork,
  emptyProvenance,
  formatAccessionId,
  formatDraftId,
  normalizeArchiveSlug,
  sourceFilenameForUpload,
  type AccessionDraft,
  type AccessionDraftUpdate,
  type ArchiveEntry,
  type CreateAccessionDraftInput,
  type DraftStatus,
  type SlugUpdateInput,
} from "./schema";
import { commitFiles, isGitCommitHookActiveForTests } from "@/lib/github/git-commit";
import { GitHubNotConfiguredError } from "@/lib/github/errors";
import { preferArchiveWorker } from "@/lib/archive/worker-config";
import { listRepoPaths, readRepoFile } from "@/lib/github/git-read";
import { getGitHubArchiveConfig } from "@/lib/github/types";
import {
  ArchiveDiscardConfirmationError,
  ArchiveDiscardNotFoundError,
  ArchiveSourceImmutableError,
  listAccessionDrafts,
  loadAccessionDraft,
} from "./draft-store";
import { loadArchiveEntry } from "./load-entry";
import { assertSlugAllowed } from "./redirects";

const DRAFTS_PREFIX = "content/drafts";
const ARCHIVE_PREFIX = "content/archive";
const PUBLIC_PREFIX = "public/archive";

function nowIso(): string {
  return new Date().toISOString();
}

function yearNow(): number {
  return new Date().getFullYear();
}

function draftJsonRepoPath(draftId: string): string {
  return `${DRAFTS_PREFIX}/${draftId}/draft.json`;
}

function draftStatesRepoPath(draftId: string): string {
  return `${DRAFTS_PREFIX}/${draftId}/states.json`;
}

function draftSourceRepoPath(draftId: string, storedFilename: string): string {
  return `${DRAFTS_PREFIX}/${draftId}/source/${storedFilename}`;
}

function draftPreparedRepoPath(draftId: string): string {
  return `${DRAFTS_PREFIX}/${draftId}/working/master-prepared.avif`;
}

function draftTombstoneRepoPath(draftId: string): string {
  return `${DRAFTS_PREFIX}/.deleted/${draftId}.json`;
}

function statesSidecar(draft: AccessionDraft) {
  return {
    version: ARCHIVE_VERSION,
    draftId: draft.draftId,
    accessionId: draft.accessionId,
    perception: {
      states: draft.artwork.states,
      background: draft.artwork.background,
      initialAngle: draft.artwork.initialAngle,
      snapToState: draft.artwork.snapToState,
      showMetadataOverlay: draft.artwork.showMetadataOverlay,
      overlayFields: draft.artwork.overlayFields,
    },
    updatedAt: draft.updatedAt,
  };
}

function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function requireGitHubArchive(): void {
  if (getGitHubArchiveConfig() || isGitCommitHookActiveForTests()) return;
  throw new GitHubNotConfiguredError();
}

export async function loadAccessionDraftFromGitHub(
  draftId: string,
): Promise<AccessionDraft | null> {
  const raw = await readRepoFile(draftJsonRepoPath(draftId));
  if (!raw) return null;
  try {
    return AccessionDraftSchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    return null;
  }
}

export async function listAccessionDraftsFromGitHub(): Promise<AccessionDraft[]> {
  const paths = await listRepoPaths(DRAFTS_PREFIX);
  const ids = [
    ...new Set(
      paths
        .map((filePath) => {
          const match = filePath.match(/^content\/drafts\/([^/.][^/]*)\/draft\.json$/);
          return match?.[1];
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const drafts: AccessionDraft[] = [];
  for (const id of ids) {
    const draft = await loadAccessionDraftFromGitHub(id);
    if (draft) drafts.push(draft);
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadArchiveEntryFromGitHub(
  slug: string,
): Promise<ArchiveEntry | null> {
  const raw = await readRepoFile(`${ARCHIVE_PREFIX}/${slug}/metadata.json`);
  if (!raw) return null;
  try {
    return ArchiveEntrySchema.parse(JSON.parse(raw.toString("utf8")));
  } catch {
    return null;
  }
}

export async function listArchiveEntriesFromGitHub(): Promise<ArchiveEntry[]> {
  const paths = await listRepoPaths(ARCHIVE_PREFIX);
  const slugs = [
    ...new Set(
      paths
        .map((filePath) => {
          const match = filePath.match(/^content\/archive\/([^/.][^/]*)\/metadata\.json$/);
          return match?.[1];
        })
        .filter((slug): slug is string => Boolean(slug)),
    ),
  ];
  const entries: ArchiveEntry[] = [];
  for (const slug of slugs) {
    const entry = await loadArchiveEntryFromGitHub(slug);
    if (entry) entries.push(entry);
  }
  return entries;
}

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

async function draftSlugExistsOnGitHub(
  slug: string,
  exceptDraftId?: string,
): Promise<boolean> {
  const drafts = await listAccessionDraftsFromGitHub();
  return drafts.some(
    (draft) => draft.slug === slug && draft.draftId !== exceptDraftId,
  );
}

async function validateSlugUniqueOnGitHub(
  slug: string,
  exceptDraftId?: string,
  accessionId?: string,
): Promise<void> {
  const normalized = normalizeArchiveSlug(slug);
  if (!normalized) throw new Error("Slug cannot be empty.");
  const existingArchive = await loadArchiveEntryFromGitHub(normalized);
  if (existingArchive) {
    const archiveAccession =
      existingArchive.metadata.accessionId ?? existingArchive.accessionId;
    if (accessionId && archiveAccession === accessionId) return;
    throw new Error(`Slug already exists in archive: ${normalized}`);
  }
  if (await draftSlugExistsOnGitHub(normalized, exceptDraftId)) {
    throw new Error(`Slug already exists in drafts: ${normalized}`);
  }
}

export async function saveAccessionDraftOnGitHub(
  draft: AccessionDraft,
  extraUpserts: { path: string; content: Buffer | string }[] = [],
  message?: string,
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const parsed = AccessionDraftSchema.parse(draft);
  await commitFiles({
    message: message ?? `draft: save ${parsed.draftId}`,
    upserts: [
      { path: draftJsonRepoPath(parsed.draftId), content: jsonFile(parsed) },
      {
        path: draftStatesRepoPath(parsed.draftId),
        content: jsonFile(statesSidecar(parsed)),
      },
      ...extraUpserts,
    ],
  });
  return parsed;
}

export async function createAccessionDraftOnGitHub(
  input: CreateAccessionDraftInput = {},
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const parsed = CreateAccessionDraftSchema.parse(input);
  const year = yearNow();
  const sequence = await nextSequenceFromGitHub(year);
  const draftId = formatDraftId(year, sequence);
  const accessionId = formatAccessionId(year, sequence);
  const date = parsed.date ?? new Date().toISOString().slice(0, 10);
  const slug = normalizeArchiveSlug(
    parsed.slug ?? buildArchiveSlug(date, parsed.title ?? accessionId),
  );
  await validateSlugUniqueOnGitHub(slug);

  const timestamp = nowIso();
  const artwork = createDefaultDraftArtwork(parsed.title ?? "", accessionId);
  artwork.id = draftId;
  artwork.metadata.accessionId = accessionId;
  artwork.metadata.date = date;

  const draft = AccessionDraftSchema.parse({
    version: ARCHIVE_VERSION,
    draftId,
    accessionId,
    status: "draft",
    slug,
    slugLocked: Boolean(parsed.slug),
    slugHistory: [],
    source: {},
    processing: {},
    artwork,
    provenance: emptyProvenance(),
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return saveAccessionDraftOnGitHub(draft, [], `draft: create ${draftId}`);
}

export async function createAccessionDraftFromSourceOnGitHub(
  file: File,
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const year = yearNow();
  const sequence = await nextSequenceFromGitHub(year);
  const draftId = formatDraftId(year, sequence);
  const accessionId = formatAccessionId(year, sequence);
  const date = new Date().toISOString().slice(0, 10);
  const slug = normalizeArchiveSlug(buildArchiveSlug(date, accessionId));
  await validateSlugUniqueOnGitHub(slug);

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFilename = sourceFilenameForUpload(file.name);
  const timestamp = nowIso();
  const artwork = createDefaultDraftArtwork("", accessionId);
  artwork.id = draftId;
  artwork.metadata.accessionId = accessionId;
  artwork.metadata.date = date;
  artwork.metadata.title = file.name.replace(/\.[^.]+$/, "");

  const draft = AccessionDraftSchema.parse({
    version: ARCHIVE_VERSION,
    draftId,
    accessionId,
    status: "draft",
    slug,
    slugLocked: false,
    slugHistory: [],
    source: {
      kind: "original",
      originalFilename: file.name,
      storedFilename,
      mimeType: file.type || "application/octet-stream",
      byteSize: buffer.length,
      importedAt: timestamp,
    },
    processing: {},
    artwork,
    provenance: emptyProvenance(),
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await commitFiles({
    message: `draft: create ${draftId} from source`,
    upserts: [
      { path: draftJsonRepoPath(draftId), content: jsonFile(draft) },
      { path: draftStatesRepoPath(draftId), content: jsonFile(statesSidecar(draft)) },
      { path: draftSourceRepoPath(draftId, storedFilename), content: buffer },
    ],
  });
  return draft;
}

export async function updateAccessionDraftOnGitHub(
  draftId: string,
  patch: AccessionDraftUpdate,
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const existing = await loadAccessionDraftFromGitHub(draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);

  const parsed = AccessionDraftUpdateSchema.parse(patch);
  const assigned = keepExplicitPatchKeys(patch, parsed);
  const nextSlug =
    typeof assigned.slug === "string"
      ? assertSlugAllowed(assigned.slug)
      : existing.slug;
  if (nextSlug !== existing.slug) {
    await validateSlugUniqueOnGitHub(nextSlug, draftId, existing.accessionId);
  }

  const assignedArtwork = assigned.artwork as AccessionDraft["artwork"] | undefined;
  const updated = AccessionDraftSchema.parse({
    ...existing,
    ...assigned,
    draftId: existing.draftId,
    accessionId: existing.accessionId,
    slug: nextSlug,
    artwork: assignedArtwork
      ? {
          ...assignedArtwork,
          metadata: {
            ...assignedArtwork.metadata,
            accessionId: existing.accessionId,
          },
        }
      : {
          ...existing.artwork,
          metadata: {
            ...existing.artwork.metadata,
            accessionId: existing.accessionId,
          },
        },
    slugHistory:
      nextSlug !== existing.slug
        ? [...existing.slugHistory, existing.slug]
        : existing.slugHistory,
    updatedAt: nowIso(),
  });
  return saveAccessionDraftOnGitHub(updated, [], `draft: update ${draftId}`);
}

export async function updateDraftSlugOnGitHub(
  draftId: string,
  input: SlugUpdateInput,
): Promise<AccessionDraft> {
  const parsed = SlugUpdateSchema.parse(input);
  return updateAccessionDraftOnGitHub(draftId, {
    slug: assertSlugAllowed(parsed.slug),
    slugLocked: parsed.lock,
  });
}

export async function storeDraftSourceOnGitHub(
  draftId: string,
  file: File,
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const existing = await loadAccessionDraftFromGitHub(draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFilename = sourceFilenameForUpload(file.name);
  const deletes: string[] = [];
  if (
    existing.source.storedFilename &&
    existing.source.storedFilename !== storedFilename
  ) {
    deletes.push(draftSourceRepoPath(draftId, existing.source.storedFilename));
  }

  const updated = AccessionDraftSchema.parse({
    ...existing,
    source: {
      kind: "original",
      originalFilename: file.name,
      storedFilename,
      mimeType: file.type || "application/octet-stream",
      byteSize: buffer.length,
      importedAt: nowIso(),
    },
    updatedAt: nowIso(),
  });

  await commitFiles({
    message: `draft: source ${draftId}`,
    upserts: [
      { path: draftJsonRepoPath(draftId), content: jsonFile(updated) },
      { path: draftStatesRepoPath(draftId), content: jsonFile(statesSidecar(updated)) },
      { path: draftSourceRepoPath(draftId, storedFilename), content: buffer },
    ],
    deletes,
  });
  return updated;
}

export async function prepareAccessionDraftOnGitHub(
  draftId: string,
): Promise<AccessionDraft> {
  requireGitHubArchive();
  const draft = await loadAccessionDraftFromGitHub(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  if (!draft.source.storedFilename) {
    throw new Error("source_required: Deposit source before preparation.");
  }
  const source = await readRepoFile(
    draftSourceRepoPath(draftId, draft.source.storedFilename),
  );
  if (!source) {
    throw new Error("source_required: Deposit source before preparation.");
  }
  const encoded = await encodePreparedMaster(source);
  const updated = AccessionDraftSchema.parse({
    ...draft,
    processing: encoded.processing,
    status: "prepared" as DraftStatus,
    preparedAt: encoded.processing.preparedAt,
    updatedAt: nowIso(),
  });
  await commitFiles({
    message: `draft: prepare ${draftId}`,
    upserts: [
      { path: draftJsonRepoPath(draftId), content: jsonFile(updated) },
      { path: draftStatesRepoPath(draftId), content: jsonFile(statesSidecar(updated)) },
      { path: draftPreparedRepoPath(draftId), content: encoded.buffer },
    ],
  });
  return updated;
}

export async function readDraftSourceFromGitHub(
  draft: AccessionDraft,
): Promise<Buffer> {
  if (!draft.source.storedFilename) {
    throw new Error("Draft does not have a preserved source file.");
  }
  const buffer = await readRepoFile(
    draftSourceRepoPath(draft.draftId, draft.source.storedFilename),
  );
  if (!buffer) throw new Error("Draft does not have a preserved source file.");
  return buffer;
}

export async function deleteDraftOnGitHub(
  draftId: string,
  confirmation: string,
): Promise<void> {
  requireGitHubArchive();
  if (confirmation !== draftId) {
    throw new Error("Draft deletion requires exact draft ID confirmation.");
  }
  const draft = await loadAccessionDraftFromGitHub(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);

  const livePaths = (await listRepoPaths(`${DRAFTS_PREFIX}/${draftId}`)).filter(
    (filePath) => filePath.startsWith(`${DRAFTS_PREFIX}/${draftId}/`),
  );
  const tombstone = { ...draft, deletedAt: nowIso() };
  await commitFiles({
    message: `draft: delete ${draftId}`,
    upserts: [
      { path: draftTombstoneRepoPath(draftId), content: jsonFile(tombstone) },
    ],
    deletes: livePaths,
  });
}

export async function saveArchiveEntryOnGitHub(
  entry: ArchiveEntry,
  message?: string,
): Promise<{ entry: ArchiveEntry; commitSha: string }> {
  requireGitHubArchive();
  const parsed = ArchiveEntrySchema.parse(entry);
  const result = await commitFiles({
    message: message ?? `archive: metadata ${parsed.slug}`,
    upserts: [
      {
        path: `${ARCHIVE_PREFIX}/${parsed.slug}/metadata.json`,
        content: jsonFile(parsed),
      },
    ],
  });
  return { entry: parsed, commitSha: result.commitSha };
}

export function archivePrefix(slug: string): string {
  return `${ARCHIVE_PREFIX}/${slug}`;
}

export function publicPrefix(slug: string): string {
  return `${PUBLIC_PREFIX}/${slug}`;
}

export async function updateDraftStatusOnGitHub(
  draftId: string,
  status: DraftStatus,
): Promise<AccessionDraft> {
  const timestamp = nowIso();
  const patch: AccessionDraftUpdate = { status };
  if (status === "prepared") patch.preparedAt = timestamp;
  if (status === "generated") patch.generatedAt = timestamp;
  if (status === "published") patch.publishedAt = timestamp;
  return updateAccessionDraftOnGitHub(draftId, patch);
}

export async function markArchiveRecordPublishedOnGitHub(
  slug: string,
): Promise<{ entry: ArchiveEntry; commitSha: string }> {
  requireGitHubArchive();
  const entry = await loadArchiveEntryFromGitHub(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  if (
    entry.status === "hidden" ||
    entry.status === "withdrawn" ||
    entry.status === "minted"
  ) {
    return { entry, commitSha: "" };
  }
  const timestamp = nowIso();
  return saveArchiveEntryOnGitHub(
    ArchiveEntrySchema.parse({
      ...entry,
      status: "published",
      publishedAt: entry.publishedAt ?? timestamp,
      updatedAt: timestamp,
    }),
    `archive: publish ${slug}`,
  );
}

export async function storeArchiveSourceOnGitHub(
  slug: string,
  file: File,
): Promise<ArchiveEntry> {
  requireGitHubArchive();
  const entry = await loadArchiveEntryFromGitHub(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  if (hasDepositedArchiveSource(entry)) {
    throw new ArchiveSourceImmutableError();
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFilename = archiveMasterFilename(file.name);
  const source = {
    kind: "original" as const,
    originalFilename: file.name,
    storedFilename,
    mimeType: file.type || "application/octet-stream",
    byteSize: buffer.length,
    importedAt: nowIso(),
  };
  const updated = ArchiveEntrySchema.parse({
    ...entry,
    source,
    updatedAt: nowIso(),
  });

  const upserts: { path: string; content: Buffer | string }[] = [
    {
      path: `${ARCHIVE_PREFIX}/${slug}/metadata.json`,
      content: jsonFile(updated),
    },
    {
      path: `${ARCHIVE_PREFIX}/${slug}/source/${storedFilename}`,
      content: buffer,
    },
    {
      path: `${ARCHIVE_PREFIX}/${slug}/source/source.json`,
      content: jsonFile(source),
    },
  ];

  const drafts = await listAccessionDraftsFromGitHub();
  const matching = drafts.find(
    (draft) =>
      draft.slug === slug ||
      draft.accessionId === (updated.accessionId ?? updated.metadata.accessionId),
  );
  if (matching) {
    const draftUpdated = AccessionDraftSchema.parse({
      ...matching,
      source,
      updatedAt: nowIso(),
    });
    upserts.push(
      {
        path: draftJsonRepoPath(matching.draftId),
        content: jsonFile(draftUpdated),
      },
      {
        path: draftStatesRepoPath(matching.draftId),
        content: jsonFile(statesSidecar(draftUpdated)),
      },
    );
  }

  await commitFiles({
    message: `archive: deposit source ${slug}`,
    upserts,
  });
  return updated;
}

export async function discardGeneratedArchiveOnGitHub(
  slug: string,
  confirmation: string,
): Promise<{ slug: string; accessionId?: string }> {
  requireGitHubArchive();
  const normalized = assertSlugAllowed(slug);
  const entry = await loadArchiveEntryFromGitHub(normalized);
  if (!entry) throw new ArchiveDiscardNotFoundError(normalized);
  if (confirmation !== entry.slug) {
    throw new ArchiveDiscardConfirmationError();
  }
  assertArchiveDiscardable(entry);

  const fresh = await loadArchiveEntryFromGitHub(entry.slug);
  if (!fresh) throw new ArchiveDiscardNotFoundError(entry.slug);
  assertArchiveDiscardable(fresh);
  if (confirmation !== fresh.slug) {
    throw new ArchiveDiscardConfirmationError();
  }

  const accessionId = fresh.accessionId ?? fresh.metadata.accessionId;
  const discardSlug = fresh.slug;
  const deletes = [
    ...(await listRepoPaths(`${ARCHIVE_PREFIX}/${discardSlug}`)),
    ...(await listRepoPaths(`${PUBLIC_PREFIX}/${discardSlug}`)),
  ];

  const upserts: { path: string; content: string }[] = [];
  const drafts = await listAccessionDraftsFromGitHub();
  for (const draft of drafts) {
    const matches =
      draft.slug === discardSlug ||
      (Boolean(accessionId) && draft.accessionId === accessionId);
    if (!matches || draft.status !== "generated") continue;

    const prepared = await readRepoFile(draftPreparedRepoPath(draft.draftId));
    const nextStatus: DraftStatus = prepared ? "prepared" : "draft";
    const withoutGeneratedAt: AccessionDraft = { ...draft };
    delete withoutGeneratedAt.generatedAt;
    const reset = AccessionDraftSchema.parse({
      ...withoutGeneratedAt,
      status: nextStatus,
      updatedAt: nowIso(),
    });
    upserts.push(
      { path: draftJsonRepoPath(draft.draftId), content: jsonFile(reset) },
      {
        path: draftStatesRepoPath(draft.draftId),
        content: jsonFile(statesSidecar(reset)),
      },
    );
  }

  await commitFiles({
    message: `archive: discard ${discardSlug}`,
    upserts,
    deletes,
  });

  return { slug: discardSlug, accessionId };
}

export function githubStorageAvailable(): boolean {
  // D1 Worker is preferred SoT when configured — do not use GitHub as content store.
  if (preferArchiveWorker()) return false;
  if (isGitCommitHookActiveForTests()) return true;
  if (!getGitHubArchiveConfig()) return false;
  // Durable GitHub SoT is required on Vercel (ephemeral FS). Local/dev keeps FS
  // unless explicitly opted in so unit tests with GITHUB_ARCHIVE_* in the shell
  // still exercise the filesystem lifecycle paths.
  return (
    process.env.VERCEL === "1" || process.env.GITHUB_ARCHIVE_DURABLE === "1"
  );
}

export async function listAccessionDraftsDurable(): Promise<AccessionDraft[]> {
  if (githubStorageAvailable()) {
    try {
      return await listAccessionDraftsFromGitHub();
    } catch {
      /* fall back to deploy/local snapshot */
    }
  }
  return listAccessionDrafts();
}

export async function loadAccessionDraftDurable(
  draftId: string,
): Promise<AccessionDraft | null> {
  if (githubStorageAvailable()) {
    try {
      const draft = await loadAccessionDraftFromGitHub(draftId);
      if (draft) return draft;
    } catch {
      /* fall back */
    }
  }
  return loadAccessionDraft(draftId);
}

export async function loadArchiveEntryDurable(
  slug: string,
): Promise<ArchiveEntry | null> {
  if (githubStorageAvailable()) {
    try {
      const fromGitHub = await loadArchiveEntryFromGitHub(slug);
      if (fromGitHub) return fromGitHub;
    } catch {
      /* fall back */
    }
  }
  return loadArchiveEntry(slug);
}
