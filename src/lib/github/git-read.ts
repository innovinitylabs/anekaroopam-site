import { requireArchiveOctokit } from "./client";
import { GitHubNotConfiguredError } from "./errors";

export interface GitReadHooks {
  listPaths: (prefix?: string) => Promise<string[]>;
  readFile: (filePath: string) => Promise<Buffer | null>;
}

let testReadHooks: GitReadHooks | undefined;
let treeCache:
  | { treeSha: string; paths: { path: string; sha: string }[] }
  | undefined;

export function setGitReadHookForTests(hooks?: GitReadHooks): void {
  testReadHooks = hooks;
  treeCache = undefined;
}

export function isGitReadHookActiveForTests(): boolean {
  return Boolean(testReadHooks);
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/^\/+/, "").split("\\").join("/");
}

async function requireClient() {
  try {
    return requireArchiveOctokit();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GitHub archive not configured")) {
      throw new GitHubNotConfiguredError();
    }
    throw error;
  }
}

async function loadTreeIndex(): Promise<{ path: string; sha: string }[]> {
  if (testReadHooks) {
    const paths = await testReadHooks.listPaths();
    return paths.map((filePath) => ({ path: filePath, sha: filePath }));
  }

  const { octokit, config } = await requireClient();
  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: ref.data.object.sha,
  });
  const treeSha = commit.data.tree.sha;
  if (treeCache?.treeSha === treeSha) return treeCache.paths;

  const { data } = await octokit.git.getTree({
    owner: config.owner,
    repo: config.repo,
    tree_sha: treeSha,
    recursive: "true",
  });

  const paths = (data.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path && entry.sha)
    .map((entry) => ({ path: entry.path as string, sha: entry.sha as string }));

  treeCache = { treeSha, paths };
  return paths;
}

export async function listRepoPaths(prefix = ""): Promise<string[]> {
  const normalized = normalizeRepoPath(prefix);
  if (testReadHooks) {
    const paths = await testReadHooks.listPaths(normalized);
    return normalized
      ? paths.filter(
          (filePath) =>
            filePath === normalized || filePath.startsWith(`${normalized}/`),
        )
      : paths;
  }
  const index = await loadTreeIndex();
  return index
    .map((entry) => entry.path)
    .filter(
      (filePath) =>
        !normalized ||
        filePath === normalized ||
        filePath.startsWith(`${normalized}/`),
    );
}

export async function readRepoFile(filePath: string): Promise<Buffer | null> {
  const normalized = normalizeRepoPath(filePath);
  if (testReadHooks) {
    return testReadHooks.readFile(normalized);
  }

  const { octokit, config } = await requireClient();
  const index = await loadTreeIndex();
  const entry = index.find((item) => item.path === normalized);
  if (!entry) return null;

  const { data } = await octokit.git.getBlob({
    owner: config.owner,
    repo: config.repo,
    file_sha: entry.sha,
  });
  return Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8");
}

export async function readBranchTipSha(): Promise<string> {
  if (testReadHooks) {
    return "test-tip-sha";
  }
  const { octokit, config } = await requireClient();
  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  return ref.data.object.sha;
}

export function clearGitReadCache(): void {
  treeCache = undefined;
}

/** @deprecated Use clearGitReadCache */
export function clearGitReadCacheForTests(): void {
  clearGitReadCache();
}
