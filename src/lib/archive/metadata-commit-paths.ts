/**
 * Allowlisted GitHub paths for metadata-only commits (no binaries).
 */

const TEXT_EXT = /\.(json|md|html|txt)$/i;

export function normalizeMetadataCommitPath(filePath: string): string {
  return filePath.replace(/^\/+/, "").split("\\").join("/");
}

export function isAllowedMetadataCommitPath(
  filePath: string,
  opts: { slug: string; draftId?: string },
): boolean {
  const normalized = normalizeMetadataCommitPath(filePath);
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    return false;
  }
  if (!TEXT_EXT.test(normalized)) return false;
  if (normalized.startsWith("public/")) return false;

  const slug = opts.slug.trim();
  if (!slug || slug.includes("/") || slug.includes("..")) return false;

  const archivePrefix = `content/archive/${slug}/`;
  if (normalized.startsWith(archivePrefix)) return true;

  const draftId = opts.draftId?.trim();
  if (draftId) {
    if (draftId.includes("/") || draftId.includes("..")) return false;
    const draftPrefix = `content/drafts/${draftId}/`;
    if (normalized.startsWith(draftPrefix)) return true;
  }

  return false;
}

export function assertAllowedMetadataCommitPaths(
  paths: string[],
  opts: { slug: string; draftId?: string },
): void {
  if (paths.length === 0) {
    throw new Error("metadata-commit requires at least one file");
  }
  if (paths.length > 32) {
    throw new Error("metadata-commit allows at most 32 files");
  }
  for (const filePath of paths) {
    if (!isAllowedMetadataCommitPath(filePath, opts)) {
      throw new Error(`Illegal metadata-commit path: ${filePath}`);
    }
  }
}
