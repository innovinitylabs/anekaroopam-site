import fs from "fs/promises";
import path from "path";
import {
  ArchiveDraftSchema,
  type ArchiveDraft,
  type ArchiveEntry,
  type DraftSource,
} from "./schema";
import { draftToArchiveEntry, archiveEntryToExportPayload } from "./adapters";
import { buildArchiveBundleFiles } from "./generate-entry";
import {
  derivativeAssetFromBuffer,
  runArchiveImagePipeline,
} from "./image-pipeline";
import { ARCHIVE_IMAGE_OUTPUTS } from "./image-specs";
import { contentArchiveDir } from "./paths";
import { buildStandaloneHtmlFromBuffers } from "./standalone-html";
import { generateAccessionManifest, writeAccessionManifest } from "./manifest";
import { buildAccessionRuntime } from "./runtime";
import {
  finalizePublicPromote,
  promotePublicDerivatives,
  rollbackPublicPromote,
  writePublicDerivativesToStaging,
} from "./public-derivative-export";

export interface ArchiveExportInput {
  draft: ArchiveDraft;
  sourceBuffer: Buffer;
  existingEntry?: ArchiveEntry;
  source?: DraftSource;
}

export interface WrittenFile {
  path: string;
  bytes: number;
}

export interface ArchiveExportResult {
  slug: string;
  entry: ArchiveEntry;
  files: WrittenFile[];
  warnings: string[];
}

async function writeFileEnsuringDir(
  filePath: string,
  data: string | Buffer,
): Promise<WrittenFile> {
  if (testContentWriteHook) {
    testContentWriteHook(filePath);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  const stat = await fs.stat(filePath);
  return { path: filePath, bytes: stat.size };
}

let testContentWriteHook: ((filePath: string) => void) | undefined;

/** Test-only hook invoked before each content write during export. */
export function setArchiveExportContentWriteHookForTests(
  hook?: (filePath: string) => void,
): void {
  testContentWriteHook = hook;
}

export async function runArchiveExport(
  input: ArchiveExportInput,
): Promise<ArchiveExportResult> {
  const parsed = ArchiveDraftSchema.parse(input.draft);
  const generatedEntry = draftToArchiveEntry(parsed);
  const entry: ArchiveEntry = {
    ...generatedEntry,
    createdAt: input.existingEntry?.createdAt ?? generatedEntry.createdAt,
    status: input.existingEntry?.status ?? generatedEntry.status,
    publishedAt: input.existingEntry?.publishedAt ?? generatedEntry.publishedAt,
    mintedAt: input.existingEntry?.mintedAt ?? generatedEntry.mintedAt,
    hiddenAt: input.existingEntry?.hiddenAt ?? generatedEntry.hiddenAt,
    withdrawnAt: input.existingEntry?.withdrawnAt ?? generatedEntry.withdrawnAt,
    provenance: input.existingEntry?.provenance ?? generatedEntry.provenance,
    exports: input.existingEntry?.exports ?? generatedEntry.exports,
    accessionId: input.existingEntry?.accessionId ?? generatedEntry.accessionId,
    source: input.source ?? input.existingEntry?.source ?? generatedEntry.source,
    processing: generatedEntry.processing?.preparedSource
      ? {
          ...generatedEntry.processing,
          preparedSource: "prepared/master-prepared.avif",
        }
      : input.existingEntry?.processing,
    metadata: {
      ...generatedEntry.metadata,
      accessionId:
        input.existingEntry?.metadata.accessionId ??
        input.existingEntry?.accessionId ??
        generatedEntry.metadata.accessionId,
    },
    updatedAt: new Date().toISOString(),
  };
  const warnings: string[] = [];
  const files: WrittenFile[] = [];

  const buffers = await runArchiveImagePipeline(input.sourceBuffer);
  const contentDir = contentArchiveDir(entry.slug);
  const generatedAt = new Date().toISOString();
  const derivatives = [];

  for (const [key, buffer] of Object.entries(buffers) as [
    keyof typeof buffers,
    Buffer,
  ][]) {
    const filename = ARCHIVE_IMAGE_OUTPUTS[key].filename;
    derivatives.push(
      await derivativeAssetFromBuffer(
        key,
        `/archive/${entry.slug}/${filename}`,
        buffer,
        generatedAt,
      ),
    );
  }

  entry.derivatives = derivatives;

  const bundle = buildArchiveBundleFiles(entry);
  const runtime = buildAccessionRuntime(entry);
  const preliminaryManifest = await generateAccessionManifest(entry);
  const payload = archiveEntryToExportPayload(entry);
  const includeWebpFallback = entry.export.includeWebpFallback !== false;
  const html = await buildStandaloneHtmlFromBuffers(
    payload,
    buffers.artwork,
    includeWebpFallback ? buffers.previewWebp : undefined,
    {
      manifest: preliminaryManifest,
      runtime,
      standaloneVersion: "standalone-runtime-v1",
    },
  );

  const { stagingDir, written: stagedPublic } = await writePublicDerivativesToStaging(
    entry.slug,
    buffers,
  );
  files.push(...stagedPublic);

  let promoteResult: Awaited<ReturnType<typeof promotePublicDerivatives>>;
  try {
    promoteResult = await promotePublicDerivatives(entry.slug, stagingDir);
  } catch (error) {
    await rollbackPublicPromote(entry.slug, null);
    throw error;
  }

  try {
    files.push(
      await writeFileEnsuringDir(
        path.join(contentDir, "metadata.json"),
        bundle.metadataJson,
      ),
    );
    files.push(
      await writeFileEnsuringDir(
        path.join(contentDir, "states.json"),
        bundle.statesJson,
      ),
    );
    files.push(
      await writeFileEnsuringDir(path.join(contentDir, "notes.md"), bundle.notesMd),
    );
    files.push(
      await writeFileEnsuringDir(
        path.join(contentDir, entry.export.standaloneHtml),
        html,
      ),
    );

    const manifest = await writeAccessionManifest(entry);
    files.push({
      path: path.join(contentDir, "manifest.json"),
      bytes: Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`),
    });

    await finalizePublicPromote(promoteResult.retiredDir);
  } catch (error) {
    await rollbackPublicPromote(entry.slug, promoteResult.retiredDir);
    throw error;
  }

  if (!entry.metadata.title.trim()) {
    warnings.push("Title is empty; slug may be the only public label.");
  }

  if (entry.perception.states.length === 0) {
    warnings.push("No perceptual states defined.");
  }

  return { slug: entry.slug, entry, files, warnings };
}
