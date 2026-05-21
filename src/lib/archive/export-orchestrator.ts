import fs from "fs/promises";
import path from "path";
import {
  ArchiveDraftSchema,
  type ArchiveDraft,
  type ArchiveEntry,
} from "./schema";
import { draftToArchiveEntry, archiveEntryToExportPayload } from "./adapters";
import { buildArchiveBundleFiles } from "./generate-entry";
import { runArchiveImagePipeline } from "./image-pipeline";
import { ARCHIVE_IMAGE_OUTPUTS } from "./image-specs";
import { contentArchiveDir, publicArchiveDir } from "./paths";
import { buildStandaloneHtmlFromBuffers } from "./standalone-html";

export interface ArchiveExportInput {
  draft: ArchiveDraft;
  sourceBuffer: Buffer;
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  const stat = await fs.stat(filePath);
  return { path: filePath, bytes: stat.size };
}

export async function runArchiveExport(
  input: ArchiveExportInput,
): Promise<ArchiveExportResult> {
  const parsed = ArchiveDraftSchema.parse(input.draft);
  const entry = draftToArchiveEntry(parsed);
  const warnings: string[] = [];
  const files: WrittenFile[] = [];

  const buffers = await runArchiveImagePipeline(input.sourceBuffer);
  const publicDir = publicArchiveDir(entry.slug);
  const contentDir = contentArchiveDir(entry.slug);

  for (const [key, buffer] of Object.entries(buffers) as [
    keyof typeof buffers,
    Buffer,
  ][]) {
    const filename = ARCHIVE_IMAGE_OUTPUTS[key].filename;
    const outPath = path.join(publicDir, filename);
    files.push(await writeFileEnsuringDir(outPath, buffer));
  }

  const bundle = buildArchiveBundleFiles(entry);
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

  const payload = archiveEntryToExportPayload(entry);
  const html = await buildStandaloneHtmlFromBuffers(
    payload,
    buffers.artwork,
    buffers.previewAvif,
  );
  files.push(
    await writeFileEnsuringDir(
      path.join(contentDir, entry.export.standaloneHtml),
      html,
    ),
  );

  if (!entry.metadata.title.trim()) {
    warnings.push("Title is empty; slug may be the only public label.");
  }

  if (entry.perception.states.length === 0) {
    warnings.push("No perceptual states defined.");
  }

  return { slug: entry.slug, entry, files, warnings };
}
