import fs from "fs/promises";
import path from "path";
import { assertSlugAllowed } from "@/lib/archive/redirects";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import {
  githubStorageAvailable,
  loadArchiveEntryFromGitHub,
} from "@/lib/archive/draft-github-store";
import { contentArchiveDir, publicArchiveDir } from "@/lib/archive/paths";
import { canonicalPublicDerivativeFilenames } from "@/lib/archive/public-derivative-export";
import { commitFiles } from "./git-commit";
import { listRepoPaths, readBranchTipSha, readRepoFile } from "./git-read";

export class ArchiveSyncNotFoundError extends Error {
  constructor(slug: string) {
    super(`Archive entry not found: ${slug}`);
    this.name = "ArchiveSyncNotFoundError";
  }
}

export class ArchiveSyncIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveSyncIncompleteError";
  }
}

export interface ArchiveGitHubPushResult {
  commitSha: string;
  paths: string[];
}

type GitHubPushHook = (
  slug: string,
  commitMessage: string,
  files: { path: string; content: Buffer }[],
) => Promise<ArchiveGitHubPushResult>;

let testGitHubPushHook: GitHubPushHook | undefined;

/** Test-only hook invoked instead of Octokit during archive GitHub push. */
export function setArchiveGitHubPushHookForTests(
  hook?: GitHubPushHook,
): void {
  testGitHubPushHook = hook;
}

async function collectFiles(
  dir: string,
  prefix: string,
): Promise<{ path: string; content: Buffer }[]> {
  const out: { path: string; content: Buffer }[] = [];
  let entries: { name: string; isFile: () => boolean; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    const rel = path.posix.join(prefix, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectFiles(full, rel)));
    } else if (ent.isFile()) {
      out.push({ path: rel, content: await fs.readFile(full) });
    }
  }
  return out;
}

async function collectArchiveBundleFiles(
  slug: string,
): Promise<{ path: string; content: Buffer }[]> {
  const contentDir = contentArchiveDir(slug);
  const publicDir = publicArchiveDir(slug);

  const files: { path: string; content: Buffer }[] = [
    ...(await collectFiles(contentDir, `content/archive/${slug}`)),
    ...(await collectFiles(publicDir, `public/archive/${slug}`)),
  ];

  if (files.length === 0) {
    throw new Error(`No archive files found for slug: ${slug}`);
  }

  return files;
}

export async function validateArchiveBundleForSync(slug: string): Promise<void> {
  const normalized = assertSlugAllowed(slug);
  const entry = await loadArchiveEntry(normalized);
  if (!entry) {
    throw new ArchiveSyncNotFoundError(normalized);
  }

  const metadataPath = path.join(contentArchiveDir(normalized), "metadata.json");
  try {
    await fs.access(metadataPath);
  } catch {
    throw new ArchiveSyncIncompleteError(
      `Archive bundle incomplete: missing metadata.json for ${normalized}`,
    );
  }

  for (const filename of canonicalPublicDerivativeFilenames()) {
    const derivativePath = path.join(publicArchiveDir(normalized), filename);
    try {
      await fs.access(derivativePath);
    } catch {
      throw new ArchiveSyncIncompleteError(
        `Archive bundle incomplete: missing public derivative ${filename} for ${normalized}`,
      );
    }
  }
}

export async function validateArchiveBundleOnGitHub(slug: string): Promise<void> {
  const normalized = assertSlugAllowed(slug);
  const entry = await loadArchiveEntryFromGitHub(normalized);
  if (!entry) {
    throw new ArchiveSyncNotFoundError(normalized);
  }

  const metadata = await readRepoFile(
    `content/archive/${normalized}/metadata.json`,
  );
  if (!metadata) {
    throw new ArchiveSyncIncompleteError(
      `Archive bundle incomplete: missing metadata.json for ${normalized}`,
    );
  }

  for (const filename of canonicalPublicDerivativeFilenames()) {
    const derivative = await readRepoFile(
      `public/archive/${normalized}/${filename}`,
    );
    if (!derivative) {
      throw new ArchiveSyncIncompleteError(
        `Archive bundle incomplete: missing public derivative ${filename} for ${normalized}`,
      );
    }
  }
}

async function pushArchiveBundleToGitHub(
  slug: string,
  commitMessage: string,
): Promise<ArchiveGitHubPushResult> {
  const normalized = assertSlugAllowed(slug);
  const files = await collectArchiveBundleFiles(normalized);

  if (testGitHubPushHook) {
    return testGitHubPushHook(normalized, commitMessage, files);
  }

  const result = await commitFiles({
    message: commitMessage,
    upserts: files.map((file) => ({ path: file.path, content: file.content })),
  });
  return {
    commitSha: result.commitSha,
    paths: files.map((file) => file.path),
  };
}

async function collectArchiveBundleFilesFromGitHub(
  slug: string,
): Promise<{ path: string; content: Buffer }[]> {
  const contentPaths = await listRepoPaths(`content/archive/${slug}`);
  const publicPaths = await listRepoPaths(`public/archive/${slug}`);
  const files: { path: string; content: Buffer }[] = [];

  for (const filePath of [...contentPaths, ...publicPaths]) {
    if (filePath.split("/").some((part) => part.startsWith("."))) continue;
    const content = await readRepoFile(filePath);
    if (!content) continue;
    files.push({ path: filePath, content });
  }

  if (files.length === 0) {
    throw new Error(`No archive files found for slug: ${slug}`);
  }

  return files;
}

export async function publishArchiveEntryToGitHub(
  slug: string,
): Promise<ArchiveGitHubPushResult> {
  return pushArchiveBundleToGitHub(slug, `archive: accession ${slug}`);
}

/**
 * Sync pushes an existing archive bundle without changing lifecycle status.
 * On durable GitHub mode the bundle is already authoritative on the branch tip;
 * validate completeness and return tip + paths (no status mutation).
 * Local/non-durable mode still collects from the working tree and pushes.
 */
export async function syncArchiveEntryToGitHub(
  slug: string,
): Promise<ArchiveGitHubPushResult> {
  const normalized = assertSlugAllowed(slug);

  if (githubStorageAvailable()) {
    await validateArchiveBundleOnGitHub(normalized);
    const files = await collectArchiveBundleFilesFromGitHub(normalized);
    const commitMessage = `archive: sync ${normalized}`;

    if (testGitHubPushHook) {
      return testGitHubPushHook(normalized, commitMessage, files);
    }

    const commitSha = await readBranchTipSha();
    return {
      commitSha,
      paths: files.map((file) => file.path),
    };
  }

  await validateArchiveBundleForSync(normalized);
  return pushArchiveBundleToGitHub(normalized, `archive: sync ${normalized}`);
}

export interface ArchiveGitHubMetadataPushResult {
  commitSha: string;
}

type GitHubMetadataPushHook = (
  slug: string,
  commitMessage: string,
  metadataJson: string,
  filePath: string,
) => Promise<ArchiveGitHubMetadataPushResult>;

let testGitHubMetadataPushHook: GitHubMetadataPushHook | undefined;

/** Test-only hook invoked instead of Octokit during metadata-only GitHub push. */
export function setArchiveGitHubMetadataPushHookForTests(
  hook?: GitHubMetadataPushHook,
): void {
  testGitHubMetadataPushHook = hook;
}

export async function pushArchiveMetadataToGitHub(
  slug: string,
  metadataJson: string,
  commitMessage: string,
): Promise<ArchiveGitHubMetadataPushResult> {
  const normalized = assertSlugAllowed(slug);
  const filePath = `content/archive/${normalized}/metadata.json`;

  if (testGitHubMetadataPushHook) {
    return testGitHubMetadataPushHook(normalized, commitMessage, metadataJson, filePath);
  }

  const result = await commitFiles({
    message: commitMessage,
    upserts: [{ path: filePath, content: metadataJson }],
  });
  return { commitSha: result.commitSha };
}

export async function syncArchiveVisibilityToGitHub(
  slug: string,
  metadataJson: string,
  previousStatus: string,
  nextStatus: string,
): Promise<ArchiveGitHubMetadataPushResult> {
  return pushArchiveMetadataToGitHub(
    slug,
    metadataJson,
    `archive: visibility ${slug} ${previousStatus}->${nextStatus}`,
  );
}

export async function updateArchiveProvenanceOnGitHub(
  slug: string,
  metadataJson: string,
): Promise<{ commitSha: string }> {
  return pushArchiveMetadataToGitHub(slug, metadataJson, `archive: provenance ${slug}`);
}
