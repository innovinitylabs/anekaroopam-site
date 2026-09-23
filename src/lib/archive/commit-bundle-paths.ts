/**
 * Path allowlisting for POST /api/admin/archive/commit-bundle.
 */

const MAX_COMMIT_BUNDLE_BYTES = 80 * 1024 * 1024;
const MAX_FILES = 64;

export { MAX_COMMIT_BUNDLE_BYTES, MAX_FILES };

export function normalizeCommitBundlePath(filePath: string): string {
  return filePath.replace(/^\/+/, "").split("\\").join("/");
}

export function isAllowedCommitBundlePath(
  filePath: string,
  opts: { slug: string; draftId?: string },
): boolean {
  const normalized = normalizeCommitBundlePath(filePath);
  if (!normalized || normalized.includes("..") || normalized.startsWith("../")) {
    return false;
  }
  if (normalized.includes("\0")) return false;

  const slug = opts.slug.trim();
  if (!slug || slug.includes("/") || slug.includes("..")) return false;

  const archivePrefix = `content/archive/${slug}/`;
  const publicPrefix = `public/archive/${slug}/`;
  if (normalized.startsWith(archivePrefix) || normalized.startsWith(publicPrefix)) {
    return true;
  }

  const draftId = opts.draftId?.trim();
  if (draftId) {
    if (draftId.includes("/") || draftId.includes("..")) return false;
    const draftPrefix = `content/drafts/${draftId}/`;
    if (normalized.startsWith(draftPrefix)) return true;
  }

  return false;
}

export function assertAllowedCommitBundlePaths(
  paths: string[],
  opts: { slug: string; draftId?: string },
): void {
  if (paths.length === 0) {
    throw new Error("commit-bundle requires at least one file");
  }
  if (paths.length > MAX_FILES) {
    throw new Error(`commit-bundle allows at most ${MAX_FILES} files`);
  }
  for (const filePath of paths) {
    if (!isAllowedCommitBundlePath(filePath, opts)) {
      throw new Error(`Illegal commit-bundle path: ${filePath}`);
    }
  }
}
