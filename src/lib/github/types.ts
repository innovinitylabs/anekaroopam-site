export interface GitHubArchiveConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function getGitHubArchiveConfig(): GitHubArchiveConfig | null {
  const token = process.env.GITHUB_ARCHIVE_TOKEN?.trim();
  const owner = process.env.GITHUB_ARCHIVE_OWNER?.trim();
  const repo = process.env.GITHUB_ARCHIVE_REPO?.trim();
  const branch = process.env.GITHUB_ARCHIVE_BRANCH?.trim() || "main";

  if (!token || !owner || !repo) return null;

  return { token, owner, repo, branch };
}
