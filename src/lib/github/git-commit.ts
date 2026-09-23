import { requireArchiveOctokit } from "./client";
import {
  GitHubCommitConflictError,
  GitHubNotConfiguredError,
} from "./errors";
import { clearGitReadCache } from "./git-read";

export {
  GitHubCommitConflictError,
  GitHubNotConfiguredError,
} from "./errors";

export interface GitFileUpsert {
  path: string;
  content: Buffer | string;
}

export interface CommitFilesInput {
  message: string;
  upserts?: GitFileUpsert[];
  deletes?: string[];
}

export interface CommitFilesResult {
  commitSha: string;
  paths: string[];
}

type CommitFilesHook = (input: CommitFilesInput) => Promise<CommitFilesResult>;

let testCommitHook: CommitFilesHook | undefined;

export function setGitCommitHookForTests(hook?: CommitFilesHook): void {
  testCommitHook = hook;
}

export function isGitCommitHookActiveForTests(): boolean {
  return Boolean(testCommitHook);
}

export function isTextRepoPath(filePath: string): boolean {
  return (
    filePath.endsWith(".json") ||
    filePath.endsWith(".md") ||
    filePath.endsWith(".html") ||
    filePath.endsWith(".txt")
  );
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/^\/+/, "").split("\\").join("/");
}

export async function commitFiles(
  input: CommitFilesInput,
): Promise<CommitFilesResult> {
  const upserts = (input.upserts ?? []).map((file) => ({
    ...file,
    path: normalizeRepoPath(file.path),
  }));
  const deletes = (input.deletes ?? []).map(normalizeRepoPath);
  const payload: CommitFilesInput = {
    message: input.message,
    upserts,
    deletes,
  };

  if (testCommitHook) {
    const result = await testCommitHook(payload);
    clearGitReadCache();
    return result;
  }

  if (upserts.length === 0 && deletes.length === 0) {
    throw new Error("commitFiles requires at least one upsert or delete");
  }

  let octokit: ReturnType<typeof requireArchiveOctokit>["octokit"];
  let config: ReturnType<typeof requireArchiveOctokit>["config"];
  try {
    ({ octokit, config } = requireArchiveOctokit());
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("GitHub archive not configured")) {
      throw new GitHubNotConfiguredError();
    }
    throw error;
  }

  const ref = await octokit.git.getRef({
    owner: config.owner,
    repo: config.repo,
    ref: `heads/${config.branch}`,
  });
  const parentSha = ref.data.object.sha;

  const commit = await octokit.git.getCommit({
    owner: config.owner,
    repo: config.repo,
    commit_sha: parentSha,
  });

  const blobs = await Promise.all(
    upserts.map(async (file) => {
      const text = isTextRepoPath(file.path);
      const body =
        typeof file.content === "string"
          ? file.content
          : text
            ? file.content.toString("utf8")
            : file.content.toString("base64");
      const { data } = await octokit.git.createBlob({
        owner: config.owner,
        repo: config.repo,
        content: body,
        encoding: text ? "utf-8" : "base64",
      });
      return { path: file.path, sha: data.sha };
    }),
  );

  const tree = [
    ...blobs.map((blob) => ({
      path: blob.path,
      mode: "100644" as const,
      type: "blob" as const,
      sha: blob.sha,
    })),
    ...deletes.map((filePath) => ({
      path: filePath,
      mode: "100644" as const,
      type: "blob" as const,
      sha: null as unknown as string,
    })),
  ];

  const { data: newTree } = await octokit.git.createTree({
    owner: config.owner,
    repo: config.repo,
    base_tree: commit.data.tree.sha,
    tree,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: config.owner,
    repo: config.repo,
    message: input.message,
    tree: newTree.sha,
    parents: [parentSha],
  });

  try {
    await octokit.git.updateRef({
      owner: config.owner,
      repo: config.repo,
      ref: `heads/${config.branch}`,
      sha: newCommit.sha,
    });
  } catch (error) {
    throw new GitHubCommitConflictError(
      error instanceof Error ? error.message : undefined,
    );
  }

  clearGitReadCache();

  return {
    commitSha: newCommit.sha,
    paths: [...upserts.map((file) => file.path), ...deletes],
  };
}
