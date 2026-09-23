import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import type { ArchiveImageBuffers } from "./image-pipeline";
import {
  ARCHIVE_IMAGE_OUTPUTS,
  archiveImageOutputFilenames,
} from "./image-specs";
import { getRepoRoot, publicArchiveDir } from "./paths";

export interface WrittenPublicFile {
  path: string;
  bytes: number;
}

export interface PublicPromoteResult {
  liveDir: string;
  retiredDir: string | null;
}

export function publicArchiveStagingRoot(): string {
  return path.join(getRepoRoot(), "public", "archive", ".staging");
}

export function canonicalPublicDerivativeFilenames(): string[] {
  return archiveImageOutputFilenames();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writePublicDerivativesToStaging(
  slug: string,
  buffers: ArchiveImageBuffers,
): Promise<{ stagingDir: string; written: WrittenPublicFile[] }> {
  const stagingDir = path.join(publicArchiveStagingRoot(), `${slug}-${randomUUID()}`);
  await fs.mkdir(stagingDir, { recursive: true });

  const written: WrittenPublicFile[] = [];
  for (const [key, buffer] of Object.entries(buffers) as [
    keyof ArchiveImageBuffers,
    Buffer,
  ][]) {
    const filename = ARCHIVE_IMAGE_OUTPUTS[key].filename;
    const outPath = path.join(stagingDir, filename);
    await fs.writeFile(outPath, buffer);
    written.push({ path: outPath, bytes: buffer.length });
  }

  return { stagingDir, written };
}

export async function validatePublicStaging(stagingDir: string): Promise<void> {
  for (const filename of canonicalPublicDerivativeFilenames()) {
    const filePath = path.join(stagingDir, filename);
    if (!(await pathExists(filePath))) {
      throw new Error(`Staging validation failed: missing ${filename}`);
    }
    const stat = await fs.stat(filePath);
    if (stat.size <= 0) {
      throw new Error(`Staging validation failed: empty ${filename}`);
    }
  }
}

export async function promotePublicDerivatives(
  slug: string,
  stagingDir: string,
): Promise<PublicPromoteResult> {
  await validatePublicStaging(stagingDir);

  const liveDir = publicArchiveDir(slug);
  let retiredDir: string | null = null;

  try {
    if (await pathExists(liveDir)) {
      retiredDir = `${liveDir}.retired-${randomUUID()}`;
      await fs.rename(liveDir, retiredDir);
    }
    await fs.rename(stagingDir, liveDir);
    return { liveDir, retiredDir };
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    if (retiredDir && (await pathExists(retiredDir))) {
      await fs.rename(retiredDir, liveDir).catch(() => {});
    }
    throw error;
  }
}

export async function finalizePublicPromote(retiredDir: string | null): Promise<void> {
  if (!retiredDir) return;
  await fs.rm(retiredDir, { recursive: true, force: true });
}

export async function rollbackPublicPromote(
  slug: string,
  retiredDir: string | null,
): Promise<void> {
  const liveDir = publicArchiveDir(slug);
  if (retiredDir && (await pathExists(retiredDir))) {
    const brokenDir = `${liveDir}.failed-${randomUUID()}`;
    if (await pathExists(liveDir)) {
      await fs.rename(liveDir, brokenDir);
    }
    await fs.rename(retiredDir, liveDir);
    if (await pathExists(brokenDir)) {
      await fs.rm(brokenDir, { recursive: true, force: true });
    }
    return;
  }

  if (await pathExists(liveDir)) {
    await fs.rm(liveDir, { recursive: true, force: true });
  }
}

export async function cleanupPublicStagingDir(stagingDir: string): Promise<void> {
  await fs.rm(stagingDir, { recursive: true, force: true });
}
