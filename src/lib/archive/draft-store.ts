import fs from "fs/promises";
import path from "path";
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
import {
  contentArchiveDir,
  contentArchivePreparedDir,
  contentArchiveSourceDir,
  contentDraftDir,
  contentDraftSourceDir,
  contentDraftWorkingDir,
  contentDraftsDir,
  publicArchiveDir,
} from "./paths";
import {
  accessionDraftToArchiveDraft,
  archiveEntryToAccessionDraft,
} from "./adapters";
import {
  archiveStatusFromDraft,
  assertArchiveDiscardable,
  bytesForArchiveDerivativeGenerate,
  bytesForArchiveSourceDeposit,
  hasDepositedArchiveSource,
  keepExplicitPatchKeys,
  preferDraftSourceForRegenerate,
  shouldDepositDraftSourceInArchive,
} from "./archive-policy";
import { runArchiveExport } from "./export-orchestrator";
import { loadArchiveEntry } from "./load-entry";
import { exportMintPackage } from "./mint-package";
import {
  addArchiveRedirect,
  assertSlugAllowed,
  redirectTargetExists,
  removeArchiveRedirectsForSlug,
} from "./redirects";
import { assertArchiveRegenerable } from "./visibility";
import {
  prepareDraftSource,
  readPreparedDraftBuffer,
} from "./prepare-pipeline";

const DRAFT_FILE = "draft.json";
const STATES_FILE = "states.json";
const DELETED_DIR = ".deleted";

function nowIso(): string {
  return new Date().toISOString();
}

function yearNow(): number {
  return new Date().getFullYear();
}

function draftJsonPath(draftId: string): string {
  return path.join(contentDraftDir(draftId), DRAFT_FILE);
}

function draftStatesPath(draftId: string): string {
  return path.join(contentDraftDir(draftId), STATES_FILE);
}

async function ensureDraftFolders(draftId: string): Promise<void> {
  await fs.mkdir(contentDraftDir(draftId), { recursive: true });
  await fs.mkdir(contentDraftSourceDir(draftId), { recursive: true });
  await fs.mkdir(contentDraftWorkingDir(draftId), { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function existingDraftIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(contentDraftsDir(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function existingArchiveAccessionSequences(year: number): Promise<number[]> {
  const archiveRoot = path.join(process.cwd(), "content", "archive");
  try {
    const entries = await fs.readdir(archiveRoot, { withFileTypes: true });
    const sequences: number[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const raw = await fs.readFile(
          path.join(archiveRoot, entry.name, "metadata.json"),
          "utf8",
        );
        const archiveEntry = ArchiveEntrySchema.parse(JSON.parse(raw));
        const accessionId =
          archiveEntry.metadata.accessionId ?? archiveEntry.accessionId;
        const sequence = sequenceFromAccessionId(accessionId, year);
        if (sequence) sequences.push(sequence);
      } catch {
        /* ignore incomplete archive records */
      }
    }
    return sequences;
  } catch {
    return [];
  }
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

async function nextSequence(year: number): Promise<number> {
  const prefix = `draft-${year}-`;
  const ids = await existingDraftIds();
  const draftSequences = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((value) => Number.isFinite(value));
  const archiveSequences = await existingArchiveAccessionSequences(year);
  const used = [...draftSequences, ...archiveSequences];
  return (used.length ? Math.max(...used) : 0) + 1;
}

export async function listAccessionDrafts(): Promise<AccessionDraft[]> {
  const ids = await existingDraftIds();
  const drafts: AccessionDraft[] = [];
  for (const id of ids) {
    const draft = await loadAccessionDraft(id);
    if (draft) drafts.push(draft);
  }
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadAccessionDraft(
  draftId: string,
): Promise<AccessionDraft | null> {
  try {
    const raw = await fs.readFile(draftJsonPath(draftId), "utf8");
    return AccessionDraftSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveArchiveEntry(entry: ArchiveEntry): Promise<ArchiveEntry> {
  const parsed = ArchiveEntrySchema.parse(entry);
  await writeJson(path.join(contentArchiveDir(parsed.slug), "metadata.json"), parsed);
  return parsed;
}

export async function archiveSlugExists(slug: string): Promise<boolean> {
  try {
    await fs.access(path.join(contentArchiveDir(slug), "metadata.json"));
    return true;
  } catch {
    return false;
  }
}

async function archiveSlugBelongsToAccession(
  slug: string,
  accessionId: string,
): Promise<boolean> {
  try {
    const raw = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    const entry = ArchiveEntrySchema.parse(JSON.parse(raw));
    return (
      entry.accessionId === accessionId ||
      entry.metadata.accessionId === accessionId
    );
  } catch {
    return false;
  }
}

export async function draftSlugExists(
  slug: string,
  exceptDraftId?: string,
): Promise<boolean> {
  const drafts = await listAccessionDrafts();
  return drafts.some(
    (draft) => draft.slug === slug && draft.draftId !== exceptDraftId,
  );
}

export async function validateSlugUnique(
  slug: string,
  exceptDraftId?: string,
  accessionId?: string,
): Promise<void> {
  const normalized = normalizeArchiveSlug(slug);
  if (!normalized) throw new Error("Slug cannot be empty.");
  if (await archiveSlugExists(normalized)) {
    if (accessionId && await archiveSlugBelongsToAccession(normalized, accessionId)) {
      return;
    }
    throw new Error(`Slug already exists in archive: ${normalized}`);
  }
  if (await draftSlugExists(normalized, exceptDraftId)) {
    throw new Error(`Slug already exists in drafts: ${normalized}`);
  }
}

export async function createAccessionDraft(
  input: CreateAccessionDraftInput = {},
): Promise<AccessionDraft> {
  const parsed = CreateAccessionDraftSchema.parse(input);
  const year = yearNow();
  const sequence = await nextSequence(year);
  const draftId = formatDraftId(year, sequence);
  const accessionId = formatAccessionId(year, sequence);
  const date = parsed.date ?? new Date().toISOString().slice(0, 10);
  const slug = normalizeArchiveSlug(
    parsed.slug ?? buildArchiveSlug(date, parsed.title ?? accessionId),
  );
  await validateSlugUnique(slug);

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

  await saveAccessionDraft(draft);
  return draft;
}

export async function createAccessionDraftFromSource(
  file: File,
): Promise<AccessionDraft> {
  const draft = await createAccessionDraft();
  try {
    return await storeDraftSource(draft.draftId, file);
  } catch (error) {
    await fs.rm(contentDraftDir(draft.draftId), { recursive: true, force: true });
    throw error;
  }
}

export async function saveAccessionDraft(
  draft: AccessionDraft,
): Promise<AccessionDraft> {
  const parsed = AccessionDraftSchema.parse(draft);
  await ensureDraftFolders(parsed.draftId);
  await writeJson(draftJsonPath(parsed.draftId), parsed);
  await writeJson(draftStatesPath(parsed.draftId), {
    version: ARCHIVE_VERSION,
    draftId: parsed.draftId,
    accessionId: parsed.accessionId,
    perception: {
      states: parsed.artwork.states,
      background: parsed.artwork.background,
      initialAngle: parsed.artwork.initialAngle,
      snapToState: parsed.artwork.snapToState,
      showMetadataOverlay: parsed.artwork.showMetadataOverlay,
      overlayFields: parsed.artwork.overlayFields,
    },
    updatedAt: parsed.updatedAt,
  });
  return parsed;
}

export async function archiveDraftForDeletion(
  draftId: string,
): Promise<{ tombstonePath: string }> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  const tombstone = {
    ...draft,
    deletedAt: nowIso(),
  };
  const deletedDir = path.join(contentDraftsDir(), DELETED_DIR);
  await fs.mkdir(deletedDir, { recursive: true });
  const tombstonePath = path.join(deletedDir, `${draftId}.json`);
  await writeJson(tombstonePath, tombstone);
  return { tombstonePath };
}

export async function deleteDraft(
  draftId: string,
  confirmation: string,
): Promise<void> {
  if (confirmation !== draftId) {
    throw new Error("Draft deletion requires exact draft ID confirmation.");
  }
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  await archiveDraftForDeletion(draftId);
  await fs.rm(contentDraftDir(draftId), { recursive: true, force: true });
}

export async function prepareAccessionDraft(
  draftId: string,
): Promise<AccessionDraft> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  const prepared = await prepareDraftSource(draft);
  return updateAccessionDraft(draftId, {
    processing: prepared.processing,
    status: "prepared",
    preparedAt: prepared.processing.preparedAt,
  });
}

/**
 * True when draft.source metadata claims an original deposit and the file
 * is actually readable under content/drafts/{id}/source/.
 */
export async function draftSourceBytesExist(
  draft: AccessionDraft,
): Promise<boolean> {
  if (draft.source.kind !== "original" || !draft.source.storedFilename) {
    return false;
  }
  try {
    await fs.access(
      path.join(contentDraftSourceDir(draft.draftId), draft.source.storedFilename),
    );
    return true;
  } catch {
    return false;
  }
}

async function materializeArchiveAssetsIntoDraft(
  entry: ArchiveEntry,
  draftId: string,
): Promise<{
  source: AccessionDraft["source"];
  processing: AccessionDraft["processing"];
}> {
  await ensureDraftFolders(draftId);

  let source: AccessionDraft["source"] = { kind: "migration-required" };
  let processing: AccessionDraft["processing"] = entry.processing
    ? { ...entry.processing }
    : {};

  if (entry.source?.kind === "original" && entry.source.storedFilename) {
    const archivePath = path.join(
      contentArchiveSourceDir(entry.slug),
      entry.source.storedFilename,
    );
    const draftStored = sourceFilenameForUpload(
      entry.source.originalFilename ?? entry.source.storedFilename,
    );
    const draftPath = path.join(contentDraftSourceDir(draftId), draftStored);
    try {
      await fs.copyFile(archivePath, draftPath);
      const stat = await fs.stat(draftPath);
      source = {
        kind: "original",
        originalFilename: entry.source.originalFilename,
        storedFilename: draftStored,
        mimeType: entry.source.mimeType,
        byteSize: entry.source.byteSize ?? stat.size,
        importedAt: entry.source.importedAt ?? nowIso(),
      };
    } catch {
      source = entry.source.storedFilename
        ? { ...entry.source }
        : { kind: "migration-required" };
    }
  }

  const preparedName = entry.processing?.preparedSource
    ? path.basename(entry.processing.preparedSource)
    : "master-prepared.avif";
  const archivePreparedPath = path.join(
    contentArchivePreparedDir(entry.slug),
    preparedName,
  );
  const draftPreparedPath = path.join(
    contentDraftWorkingDir(draftId),
    "master-prepared.avif",
  );
  try {
    await fs.copyFile(archivePreparedPath, draftPreparedPath);
    processing = {
      ...processing,
      preparedSource: "working/master-prepared.avif",
      preparedAt: processing.preparedAt ?? nowIso(),
    };
  } catch {
    /* prepared is optional for hydrate */
  }

  return { source, processing };
}

export async function hydrateDraftFromArchiveSlug(
  slug: string,
): Promise<AccessionDraft> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);

  const hydrated = archiveEntryToAccessionDraft(entry);
  const existing = await loadAccessionDraft(hydrated.draftId);
  let draft = existing
    ? AccessionDraftSchema.parse({
        ...existing,
        ...hydrated,
        source: existing.source.storedFilename ? existing.source : hydrated.source,
        updatedAt: nowIso(),
      })
    : hydrated;

  const bytesReady = await draftSourceBytesExist(draft);
  if (!bytesReady) {
    const materialized = await materializeArchiveAssetsIntoDraft(
      entry,
      draft.draftId,
    );
    draft = AccessionDraftSchema.parse({
      ...draft,
      source: materialized.source,
      processing: {
        ...draft.processing,
        ...materialized.processing,
      },
      updatedAt: nowIso(),
    });
  } else if (
    draft.processing.preparedSource &&
    !(await readPreparedDraftBuffer(draft))
  ) {
    const materialized = await materializeArchiveAssetsIntoDraft(
      entry,
      draft.draftId,
    );
    if (materialized.processing.preparedSource) {
      draft = AccessionDraftSchema.parse({
        ...draft,
        processing: {
          ...draft.processing,
          ...materialized.processing,
        },
        updatedAt: nowIso(),
      });
    }
  }

  return saveAccessionDraft(draft);
}

export async function loadDraftForPublishedSlug(
  slug: string,
): Promise<AccessionDraft | null> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) return null;
  const draftId = archiveEntryToAccessionDraft(entry).draftId;
  return loadAccessionDraft(draftId);
}

export async function updateAccessionDraft(
  draftId: string,
  patch: AccessionDraftUpdate,
): Promise<AccessionDraft> {
  const existing = await loadAccessionDraft(draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);

  const parsed = AccessionDraftUpdateSchema.parse(patch);
  const assigned = keepExplicitPatchKeys(patch, parsed);
  const nextSlug = typeof assigned.slug === "string"
    ? assertSlugAllowed(assigned.slug)
    : existing.slug;
  if (nextSlug !== existing.slug) {
    await validateSlugUnique(nextSlug, draftId);
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

  return saveAccessionDraft(updated);
}

export async function updateDraftSlug(
  draftId: string,
  input: SlugUpdateInput,
): Promise<AccessionDraft> {
  const parsed = SlugUpdateSchema.parse(input);
  return updateAccessionDraft(draftId, {
    slug: assertSlugAllowed(parsed.slug),
    slugLocked: parsed.lock,
  });
}

export async function updateDraftStatus(
  draftId: string,
  status: DraftStatus,
): Promise<AccessionDraft> {
  const timestamp = nowIso();
  const patch: AccessionDraftUpdate = { status };
  if (status === "prepared") patch.preparedAt = timestamp;
  if (status === "generated") patch.generatedAt = timestamp;
  if (status === "published") patch.publishedAt = timestamp;
  if (status === "minted") patch.mintedAt = timestamp;
  if (status === "hidden") patch.hiddenAt = timestamp;
  if (status === "withdrawn") patch.withdrawnAt = timestamp;
  return updateAccessionDraft(draftId, patch);
}

export async function updateArchiveVisibility(
  slug: string,
  status: DraftStatus,
): Promise<ArchiveEntry> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  const updated = buildArchiveVisibilityUpdate(entry, status);
  return saveArchiveEntry(updated);
}

export function buildArchiveVisibilityUpdate(
  entry: ArchiveEntry,
  status: DraftStatus,
): ArchiveEntry {
  const timestamp = nowIso();
  return ArchiveEntrySchema.parse({
    ...entry,
    status,
    hiddenAt: status === "hidden" ? timestamp : entry.hiddenAt,
    withdrawnAt: status === "withdrawn" ? timestamp : entry.withdrawnAt,
    updatedAt: timestamp,
  });
}

export async function markArchiveRecordPublished(
  slug: string,
): Promise<ArchiveEntry> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  if (
    entry.status === "hidden" ||
    entry.status === "withdrawn" ||
    entry.status === "minted"
  ) {
    return entry;
  }
  const timestamp = nowIso();
  return saveArchiveEntry(
    ArchiveEntrySchema.parse({
      ...entry,
      status: "published",
      publishedAt: entry.publishedAt ?? timestamp,
      updatedAt: timestamp,
    }),
  );
}

export async function storeDraftSource(
  draftId: string,
  file: File,
): Promise<AccessionDraft> {
  const existing = await loadAccessionDraft(draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);

  await ensureDraftFolders(draftId);
  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFilename = sourceFilenameForUpload(file.name);
  await fs.writeFile(path.join(contentDraftSourceDir(draftId), storedFilename), buffer);

  return updateAccessionDraft(draftId, {
    source: {
      kind: "original",
      originalFilename: file.name,
      storedFilename,
      mimeType: file.type || "application/octet-stream",
      byteSize: buffer.length,
      importedAt: nowIso(),
    },
  });
}

export class ArchiveSourceImmutableError extends Error {
  constructor() {
    super(
      "Archive source is immutable once deposited. Update the draft source instead.",
    );
    this.name = "ArchiveSourceImmutableError";
  }
}

export async function storeArchiveSource(
  slug: string,
  file: File,
): Promise<ArchiveEntry> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  if (hasDepositedArchiveSource(entry)) {
    throw new ArchiveSourceImmutableError();
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storedFilename = archiveMasterFilename(file.name);
  const sourceDir = contentArchiveSourceDir(slug);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, storedFilename), buffer);

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
  await writeJson(path.join(contentArchiveDir(slug), "metadata.json"), updated);
  await writeJson(path.join(sourceDir, "source.json"), source);

  const draft = await loadDraftForPublishedSlug(slug);
  if (draft) {
    await updateAccessionDraft(draft.draftId, { source });
  }

  return updated;
}

async function readArchiveSourceBuffer(entry: ArchiveEntry): Promise<Buffer> {
  if (!entry.source?.storedFilename || entry.source.kind !== "original") {
    throw new Error("source_required: Deposit an original source before regeneration.");
  }
  return fs.readFile(
    path.join(contentArchiveSourceDir(entry.slug), entry.source.storedFilename),
  );
}

export async function readDraftSourceBuffer(draft: AccessionDraft): Promise<Buffer> {
  if (!draft.source.storedFilename) {
    throw new Error("Draft does not have a preserved source file.");
  }
  return fs.readFile(
    path.join(contentDraftSourceDir(draft.draftId), draft.source.storedFilename),
  );
}

async function preserveDraftSourceInArchive(draft: AccessionDraft): Promise<void> {
  if (!draft.source.storedFilename) return;
  const originalBuffer = await readDraftSourceBuffer(draft);
  const preparedBuffer = await readPreparedDraftBuffer(draft);
  const sourceDir = contentArchiveSourceDir(draft.slug);
  await fs.mkdir(sourceDir, { recursive: true });
  const sourceBuffer = bytesForArchiveSourceDeposit(originalBuffer, preparedBuffer);
  const storedFilename = archiveMasterFilename(
    draft.source.originalFilename ?? draft.source.storedFilename,
  );
  await fs.writeFile(path.join(sourceDir, storedFilename), sourceBuffer);
  await writeJson(path.join(sourceDir, "source.json"), {
    ...draft.source,
    kind: "original",
    storedFilename,
  });
  if (preparedBuffer) {
    const preparedDir = contentArchivePreparedDir(draft.slug);
    await fs.mkdir(preparedDir, { recursive: true });
    await fs.writeFile(path.join(preparedDir, "master-prepared.avif"), preparedBuffer);
  }
}

export async function generateArchiveFromDraft(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  await validateSlugUnique(draft.slug, draft.draftId, draft.accessionId);

  const existingEntry = await loadArchiveEntry(draft.slug);
  if (existingEntry) {
    assertArchiveRegenerable(existingEntry);
  }

  const originalBuffer = await readDraftSourceBuffer(draft);
  const sourceBuffer = bytesForArchiveDerivativeGenerate(originalBuffer, null);
  const archiveDraft = accessionDraftToArchiveDraft(draft);
  archiveDraft.status = archiveStatusFromDraft("generated");
  const result = await runArchiveExport({
    draft: archiveDraft,
    sourceBuffer,
    existingEntry: existingEntry ?? undefined,
    source: {
      ...draft.source,
      kind: draft.source.kind ?? "original",
      storedFilename: archiveMasterFilename(
        draft.source.originalFilename ?? draft.source.storedFilename ?? "source.bin",
      ),
    },
  });
  if (shouldDepositDraftSourceInArchive(existingEntry)) {
    await preserveDraftSourceInArchive(draft);
  }
  const previousSlug = draft.slugHistory.at(-1);
  if (previousSlug && previousSlug !== draft.slug) {
    await addArchiveRedirect(previousSlug, draft.slug, draft.accessionId);
    await fs.rm(contentArchiveDir(previousSlug), { recursive: true, force: true });
    await fs.rm(path.join(process.cwd(), "public", "archive", previousSlug), {
      recursive: true,
      force: true,
    });
  }

  await updateAccessionDraft(draftId, {
    status: "generated",
    generatedAt: nowIso(),
  });

  try {
    await exportMintPackage(draft.slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mint package failed";
    result.warnings.push(`Mint package skipped: ${message}`);
  }

  return result;
}

export async function regenerateDraftArchive(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);

  const existingEntry = await loadArchiveEntry(draft.slug);
  if (existingEntry) {
    assertArchiveRegenerable(existingEntry);
    return regeneratePublishedEntryFromDraft(draftId);
  }
  return generateArchiveFromDraft(draftId);
}

/** @deprecated Use regenerateDraftArchive */
export async function regenerateArchiveDerivatives(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  return regenerateDraftArchive(draftId);
}

/** Canonical source-byte resolution for existing-archive export/regeneration. */
export async function resolveRegenerateSource(
  draft: AccessionDraft,
  existingEntry: ArchiveEntry,
): Promise<{
  sourceBuffer: Buffer;
  source: NonNullable<ArchiveEntry["source"]>;
  usedDraftBytes: boolean;
}> {
  if (hasDepositedArchiveSource(existingEntry)) {
    const archiveBuffer = await readArchiveSourceBuffer(existingEntry);
    if (!existingEntry.source) {
      throw new Error("source_required: Deposit an original source before regeneration.");
    }
    return {
      sourceBuffer: bytesForArchiveDerivativeGenerate(archiveBuffer, null),
      source: existingEntry.source,
      usedDraftBytes: false,
    };
  }

  if (
    preferDraftSourceForRegenerate(
      Boolean(draft.source.storedFilename),
      await draftSourceBytesExist(draft),
    )
  ) {
    const originalBuffer = await readDraftSourceBuffer(draft);
    return {
      sourceBuffer: bytesForArchiveDerivativeGenerate(originalBuffer, null),
      source: {
        ...draft.source,
        kind: draft.source.kind ?? "original",
      },
      usedDraftBytes: true,
    };
  }

  const archiveBuffer = await readArchiveSourceBuffer(existingEntry);
  if (!existingEntry.source) {
    throw new Error("source_required: Deposit an original source before regeneration.");
  }
  return {
    sourceBuffer: archiveBuffer,
    source: existingEntry.source,
    usedDraftBytes: false,
  };
}

export async function regeneratePublishedEntryFromDraft(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);

  const existingEntry = await loadArchiveEntry(draft.slug);
  if (!existingEntry) throw new Error(`Archive entry not found: ${draft.slug}`);
  assertArchiveRegenerable(existingEntry);

  const resolved = await resolveRegenerateSource(draft, existingEntry);

  const result = await runArchiveExport({
    draft: accessionDraftToArchiveDraft(draft),
    sourceBuffer: resolved.sourceBuffer,
    existingEntry,
    source: resolved.source,
  });
  if (resolved.usedDraftBytes && shouldDepositDraftSourceInArchive(existingEntry)) {
    await preserveDraftSourceInArchive(draft);
  }

  const archiveStatus = existingEntry.status as DraftStatus;
  await updateAccessionDraft(draftId, {
    status: archiveStatus,
    generatedAt: nowIso(),
  });

  try {
    await exportMintPackage(draft.slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mint package failed";
    result.warnings.push(`Mint package skipped: ${message}`);
  }

  return result;
}

export async function publishDraftMutation(
  draftId: string,
): Promise<Awaited<ReturnType<typeof regeneratePublishedEntryFromDraft>>> {
  return regeneratePublishedEntryFromDraft(draftId);
}

export async function renamePublishedArchiveSlug(
  slug: string,
  nextSlugInput: string,
): Promise<ArchiveEntry> {
  const entry = await loadArchiveEntry(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);

  const nextSlug = assertSlugAllowed(nextSlugInput);
  if (nextSlug === slug) return entry;
  await validateSlugUnique(nextSlug, undefined, entry.accessionId ?? entry.metadata.accessionId);
  if (await redirectTargetExists(nextSlug)) {
    throw new Error(`Slug is already used in redirects: ${nextSlug}`);
  }

  const oldDir = contentArchiveDir(slug);
  const nextDir = contentArchiveDir(nextSlug);
  await fs.cp(oldDir, nextDir, { recursive: true });

  const publicOld = path.join(process.cwd(), "public", "archive", slug);
  const publicNext = path.join(process.cwd(), "public", "archive", nextSlug);
  try {
    await fs.cp(publicOld, publicNext, { recursive: true });
  } catch {
    /* public derivatives can be regenerated later */
  }

  const updated = ArchiveEntrySchema.parse({
    ...entry,
    slug: nextSlug,
    assets: {
      ...entry.assets,
      artwork: `/archive/${nextSlug}/artwork.avif`,
      preview: `/archive/${nextSlug}/preview.avif`,
      previewWebp: `/archive/${nextSlug}/preview.webp`,
      social: `/archive/${nextSlug}/social.jpg`,
      socialJpg: `/archive/${nextSlug}/social.jpg`,
      thumb: `/archive/${nextSlug}/thumb.jpg`,
    },
    updatedAt: nowIso(),
  });
  await writeJson(path.join(nextDir, "metadata.json"), updated);
  await addArchiveRedirect(slug, nextSlug, updated.accessionId ?? updated.metadata.accessionId);
  await fs.rm(oldDir, { recursive: true, force: true });

  return updated;
}

export class ArchiveDiscardNotFoundError extends Error {
  constructor(slug: string) {
    super(`Archive not found: ${slug}`);
    this.name = "ArchiveDiscardNotFoundError";
  }
}

export class ArchiveDiscardConfirmationError extends Error {
  constructor() {
    super("Discard requires exact slug confirmation.");
    this.name = "ArchiveDiscardConfirmationError";
  }
}

/**
 * Discard a never-published generated archive (local content + public derivatives).
 * Keeps associated drafts (Option B) but resets generated drafts to prepared/draft.
 */
export async function discardGeneratedArchive(
  slug: string,
  confirmation: string,
): Promise<{ slug: string; accessionId?: string }> {
  const normalized = assertSlugAllowed(slug);
  const entry = await loadArchiveEntry(normalized);
  if (!entry) {
    throw new ArchiveDiscardNotFoundError(normalized);
  }
  if (confirmation !== entry.slug) {
    throw new ArchiveDiscardConfirmationError();
  }
  assertArchiveDiscardable(entry);

  // Re-load immediately before FS delete (TOCTOU).
  const fresh = await loadArchiveEntry(entry.slug);
  if (!fresh) {
    throw new ArchiveDiscardNotFoundError(entry.slug);
  }
  assertArchiveDiscardable(fresh);
  if (confirmation !== fresh.slug) {
    throw new ArchiveDiscardConfirmationError();
  }

  const accessionId = fresh.accessionId ?? fresh.metadata.accessionId;
  const discardSlug = fresh.slug;

  await fs.rm(publicArchiveDir(discardSlug), { recursive: true, force: true });
  await fs.rm(contentArchiveDir(discardSlug), { recursive: true, force: true });
  await removeArchiveRedirectsForSlug(discardSlug);
  await resetDraftsAfterArchiveDiscard(discardSlug, accessionId);

  return { slug: discardSlug, accessionId };
}

async function resetDraftsAfterArchiveDiscard(
  slug: string,
  accessionId?: string,
): Promise<void> {
  const drafts = await listAccessionDrafts();
  for (const draft of drafts) {
    const matches =
      draft.slug === slug ||
      (Boolean(accessionId) && draft.accessionId === accessionId);
    if (!matches) continue;
    if (draft.status !== "generated") continue;

    const prepared = await readPreparedDraftBuffer(draft);
    const nextStatus: DraftStatus = prepared ? "prepared" : "draft";
    const withoutGeneratedAt: AccessionDraft = { ...draft };
    delete withoutGeneratedAt.generatedAt;
    await saveAccessionDraft(
      AccessionDraftSchema.parse({
        ...withoutGeneratedAt,
        status: nextStatus,
        updatedAt: nowIso(),
      }),
    );
  }
}

export function draftSourcePublicLabel(draft: AccessionDraft): string {
  return draft.source.originalFilename ?? "No source deposited";
}

