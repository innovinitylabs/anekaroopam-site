import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  type AccessionDraft,
  type DraftProcessing,
} from "./schema";
import {
  contentDraftSourceDir,
  contentDraftWorkingDir,
} from "./paths";

export const PREPARE_VERSION = "prepare-v1";

export interface PreparedDraftSource {
  buffer: Buffer;
  processing: DraftProcessing;
  filePath: string;
  byteSize: number;
  width?: number;
  height?: number;
}

export async function prepareDraftSource(
  draft: AccessionDraft,
): Promise<PreparedDraftSource> {
  if (!draft.source.storedFilename) {
    throw new Error("source_required: Deposit source before preparation.");
  }

  const sourcePath = path.join(
    contentDraftSourceDir(draft.draftId),
    draft.source.storedFilename,
  );
  const sourceBuffer = await fs.readFile(sourcePath);
  const workingDir = contentDraftWorkingDir(draft.draftId);
  await fs.mkdir(workingDir, { recursive: true });

  const preparedPath = path.join(workingDir, "master-prepared.avif");
  const buffer = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .avif({ quality: 86, effort: 6, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await fs.writeFile(preparedPath, buffer);

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    filePath: preparedPath,
    byteSize: buffer.length,
    width: meta.width,
    height: meta.height,
    processing: {
      preparedSource: "working/master-prepared.avif",
      preparedAt: new Date().toISOString(),
      prepareVersion: PREPARE_VERSION,
    },
  };
}

export async function readPreparedDraftBuffer(
  draft: AccessionDraft,
): Promise<Buffer | null> {
  if (!draft.processing.preparedSource) return null;
  try {
    return await fs.readFile(
      path.join(
        contentDraftWorkingDir(draft.draftId),
        path.basename(draft.processing.preparedSource),
      ),
    );
  } catch {
    return null;
  }
}
