import fs from "fs/promises";
import path from "path";
import {
  ARCHIVE_VERSION,
  ArchiveRedirectsFileSchema,
  normalizeArchiveSlug,
  type ArchiveRedirect,
  type ArchiveRedirectsFile,
} from "./schema";
import { contentArchiveRedirectsPath } from "./paths";

export const RESERVED_ARCHIVE_SLUGS = new Set([
  "admin",
  "api",
  "archive",
  "perceive",
  "manifesto",
  "about",
  "process",
  "writings",
  "_next",
  "public",
]);

export function assertSlugAllowed(slug: string): string {
  const normalized = normalizeArchiveSlug(slug);
  if (!normalized) throw new Error("Slug cannot be empty.");
  if (RESERVED_ARCHIVE_SLUGS.has(normalized)) {
    throw new Error(`Slug is reserved: ${normalized}`);
  }
  return normalized;
}

export async function loadArchiveRedirects(): Promise<ArchiveRedirectsFile> {
  try {
    const raw = await fs.readFile(contentArchiveRedirectsPath(), "utf8");
    return ArchiveRedirectsFileSchema.parse(JSON.parse(raw));
  } catch {
    return { version: ARCHIVE_VERSION, redirects: [] };
  }
}

export async function saveArchiveRedirects(
  file: ArchiveRedirectsFile,
): Promise<ArchiveRedirectsFile> {
  const parsed = ArchiveRedirectsFileSchema.parse(file);
  const filePath = contentArchiveRedirectsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

export async function addArchiveRedirect(
  from: string,
  to: string,
  accessionId?: string,
  reason = "slug-evolution",
): Promise<ArchiveRedirect> {
  const normalizedFrom = assertSlugAllowed(from);
  const normalizedTo = assertSlugAllowed(to);
  const file = await loadArchiveRedirects();
  const redirect: ArchiveRedirect = {
    from: normalizedFrom,
    to: normalizedTo,
    accessionId,
    createdAt: new Date().toISOString(),
    reason,
  };
  const redirects = [
    ...file.redirects.filter((item) => item.from !== normalizedFrom),
    redirect,
  ];
  await saveArchiveRedirects({ ...file, redirects });
  return redirect;
}

/**
 * Remove redirect rows that reference a discarded slug as from or to.
 * Never deletes redirects.json wholesale.
 */
export async function removeArchiveRedirectsForSlug(slug: string): Promise<number> {
  const normalized = assertSlugAllowed(slug);
  const file = await loadArchiveRedirects();
  const redirects = file.redirects.filter(
    (item) => item.from !== normalized && item.to !== normalized,
  );
  const removed = file.redirects.length - redirects.length;
  if (removed > 0) {
    await saveArchiveRedirects({ ...file, redirects });
  }
  return removed;
}

export async function resolveArchiveRedirect(
  slug: string,
): Promise<ArchiveRedirect | null> {
  const normalized = normalizeArchiveSlug(slug);
  if (!normalized) return null;
  const file = await loadArchiveRedirects();
  return file.redirects.find((item) => item.from === normalized) ?? null;
}

export async function redirectTargetExists(slug: string): Promise<boolean> {
  const normalized = normalizeArchiveSlug(slug);
  const file = await loadArchiveRedirects();
  return file.redirects.some(
    (item) => item.to === normalized || item.from === normalized,
  );
}
