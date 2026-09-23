export class GitHubNotConfiguredError extends Error {
  constructor() {
    super(
      "GitHub archive not configured. Set GITHUB_ARCHIVE_TOKEN, GITHUB_ARCHIVE_OWNER, and GITHUB_ARCHIVE_REPO.",
    );
    this.name = "GitHubNotConfiguredError";
  }
}

export class GitHubCommitConflictError extends Error {
  constructor(message = "GitHub ref update failed; reload and retry.") {
    super(message);
    this.name = "GitHubCommitConflictError";
  }
}
