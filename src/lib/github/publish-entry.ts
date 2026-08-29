import fs from "fs/promises";
import path from "path";
import { assertSlugAllowed } from "@/lib/archive/redirects";
import { loadArchiveEntry } from "@/lib/archive/load-entry";
import { contentArchiveDir, publicArchiveDir } from "@/lib/archive/paths";
import { canonicalPublicDerivativeFilenames } from "@/lib/archive/public-derivative-export";
import { requireArchiveOctokit } from "./client";

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

async function pushArchiveBundleToGitHub(
  slug: string,
  commitMessage: string,
): Promise<ArchiveGitHubPushResult> {
  const normalized = assertSlugAllowed(slug);
  const files = await collectArchiveBundleFiles(normalized);

  if (testGitHubPushHook) {
    return testGitHubPushHook(normalized, commitMessage, files);
  }

  const { octokit, config } = requireArchiveOctokit();

  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const commitSha = ref.data.object.sha;

  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: commitSha,
  });
  const baseTreeSha = commit.data.tree.sha;

  const blobs = await Promise.all(
    files.map(async (file) => {
      const isText =
        file.path.endsWith(".json") ||
        file.path.endsWith(".md") ||
        file.path.endsWith(".html");
      const { data } = await octokit.git.createBlob({
        owner: config.owner,
        repo: config.repo,
        content: isText
          ? file.content.toString("utf8")
          : file.content.toString("base64"),
        encoding: isText ? "utf-8" : "base64",
      });
      return { path: file.path, sha: data.sha };
    }),
  );

  const { data: tree } = await octokit.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: baseTreeSha,
    tree: blobs.map((b) => ({
      path: b.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: b.sha,
    })),
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: commitMessage,
    tree: tree.sha,
    parents: [commitSha],
  });

  await octokit.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
    sha: newCommit.sha,
  });

  return {
    commitSha: newCommit.sha,
    paths: files.map((f) => f.path),
  };
}

export async function publishArchiveEntryToGitHub(
  slug: string,
): Promise<ArchiveGitHubPushResult> {
  return pushArchiveBundleToGitHub(slug, `archive: accession ${slug}`);
}

export async function syncArchiveEntryToGitHub(
  slug: string,
): Promise<ArchiveGitHubPushResult> {
  await validateArchiveBundleForSync(slug);
  return pushArchiveBundleToGitHub(slug, `archive: sync ${slug}`);
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

  const { octokit, config } = requireArchiveOctokit();

  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const commitSha = ref.data.object.sha;

  const { data: blob } = await octokit.git.createBlob({
    owner: config.owner,
    repo: config.repo,
    content: metadataJson,
    encoding: "utf-8",
  });

  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: commitSha,
  });

  const { data: tree } = await octokit.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: commit.data.tree.sha,
    tree: [
      {
        path: filePath,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      },
    ],
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: commitMessage,
    tree: tree.sha,
    parents: [commitSha],
  });

  await octokit.git.updateRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
    sha: newCommit.sha,
  });

  return { commitSha: newCommit.sha };
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
