import fs from "fs/promises";
import path from "path";
import {
  ARCHIVE_VERSION,
  AccessionDraftSchema,
  AccessionDraftUpdateSchema,
  ArchiveEntrySchema,
  CreateAccessionDraftSchema,
  SlugUpdateSchema,
  buildArchiveSlug,
  createDefaultDraftArtwork,
  emptyProvenance,
  formatAccessionId,
  formatDraftId,
  normalizeArchiveSlug,
  sourceFilenameForUpload,
  type AccessionDraft,
  type AccessionDraftUpdate,
  type CreateAccessionDraftInput,
  type DraftStatus,
  type SlugUpdateInput,
} from "./schema";
import {
  contentArchiveDir,
  contentDraftDir,
  contentDraftSourceDir,
  contentDraftWorkingDir,
  contentDraftsDir,
} from "./paths";
import { accessionDraftToArchiveDraft } from "./adapters";
import { runArchiveExport } from "./export-orchestrator";
import { buildArchiveBundleFiles } from "./generate-entry";

const DRAFT_FILE = "draft.json";
const STATES_FILE = "states.json";

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

export async function updateAccessionDraft(
  draftId: string,
  patch: AccessionDraftUpdate,
): Promise<AccessionDraft> {
  const existing = await loadAccessionDraft(draftId);
  if (!existing) throw new Error(`Draft not found: ${draftId}`);

  const parsed = AccessionDraftUpdateSchema.parse(patch);
  const nextSlug = parsed.slug
    ? normalizeArchiveSlug(parsed.slug)
    : existing.slug;
  if (nextSlug !== existing.slug) {
    await validateSlugUnique(nextSlug, draftId);
  }

  const updated = AccessionDraftSchema.parse({
    ...existing,
    ...parsed,
    draftId: existing.draftId,
    accessionId: existing.accessionId,
    slug: nextSlug,
    artwork: parsed.artwork
      ? {
          ...parsed.artwork,
          metadata: {
            ...parsed.artwork.metadata,
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
    slug: normalizeArchiveSlug(parsed.slug),
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
  if (status === "withdrawn") patch.withdrawnAt = timestamp;
  return updateAccessionDraft(draftId, patch);
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
      originalFilename: file.name,
      storedFilename,
      mimeType: file.type || "application/octet-stream",
      byteSize: buffer.length,
      importedAt: nowIso(),
    },
    status: "prepared",
    preparedAt: nowIso(),
  });
}

export async function readDraftSourceBuffer(draft: AccessionDraft): Promise<Buffer> {
  if (!draft.source.storedFilename) {
    throw new Error("Draft does not have a preserved source file.");
  }
  return fs.readFile(
    path.join(contentDraftSourceDir(draft.draftId), draft.source.storedFilename),
  );
}

export async function generateArchiveFromDraft(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  const draft = await loadAccessionDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  await validateSlugUnique(draft.slug, draft.draftId, draft.accessionId);

  const sourceBuffer = await readDraftSourceBuffer(draft);
  const result = await runArchiveExport({
    draft: accessionDraftToArchiveDraft(draft),
    sourceBuffer,
  });

  await updateAccessionDraft(draftId, {
    status: "generated",
    generatedAt: nowIso(),
  });

  return result;
}

export async function regenerateArchiveDerivatives(
  draftId: string,
): Promise<Awaited<ReturnType<typeof runArchiveExport>>> {
  return generateArchiveFromDraft(draftId);
}

export function draftSourcePublicLabel(draft: AccessionDraft): string {
  return draft.source.originalFilename ?? "No source deposited";
}

