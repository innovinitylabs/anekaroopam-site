import path from "path";

const REPO_ROOT = path.join(process.cwd());

export function contentArchiveDir(slug: string): string {
  return path.join(REPO_ROOT, "content", "archive", slug);
}

export function contentArchiveSourceDir(slug: string): string {
  return path.join(contentArchiveDir(slug), "source");
}

export function contentArchivePreparedDir(slug: string): string {
  return path.join(contentArchiveDir(slug), "prepared");
}

export function contentArchiveExportsDir(slug: string): string {
  return path.join(contentArchiveDir(slug), "exports");
}

export function contentArchiveMintPackageDir(slug: string): string {
  return path.join(contentArchiveExportsDir(slug), "mint-package");
}

export function contentArchiveRedirectsPath(): string {
  return path.join(REPO_ROOT, "content", "archive", "redirects.json");
}

export function contentDraftsDir(): string {
  return path.join(REPO_ROOT, "content", "drafts");
}

export function contentDraftDir(draftId: string): string {
  return path.join(contentDraftsDir(), draftId);
}

export function contentDraftSourceDir(draftId: string): string {
  return path.join(contentDraftDir(draftId), "source");
}

export function contentDraftWorkingDir(draftId: string): string {
  return path.join(contentDraftDir(draftId), "working");
}

export function publicArchiveDir(slug: string): string {
  return path.join(REPO_ROOT, "public", "archive", slug);
}

export function publicArchiveUrl(slug: string, filename: string): string {
  return `/archive/${slug}/${filename}`;
}
