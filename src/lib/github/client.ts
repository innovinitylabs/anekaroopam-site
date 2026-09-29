import { Octokit } from "@octokit/rest";
import { getGitHubArchiveConfig } from "./types";

export function createArchiveOctokit(): Octokit | null {
  const config = getGitHubArchiveConfig();
  if (!config) return null;
  return new Octokit({ auth: config.token });
}

export function requireArchiveOctokit(): { octokit: Octokit; config: NonNullable<ReturnType<typeof getGitHubArchiveConfig>> } {
  const config = getGitHubArchiveConfig();
  const octokit = createArchiveOctokit();
  if (!config || !octokit) {
    throw new Error(
      "GitHub archive not configured. Set GITHUB_ARCHIVE_TOKEN, GITHUB_ARCHIVE_OWNER, and GITHUB_ARCHIVE_REPO.",
    );
  }
  return { octokit, config };
}
