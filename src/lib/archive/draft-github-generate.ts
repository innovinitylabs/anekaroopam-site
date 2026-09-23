import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  hydrateDraftFromArchiveSlug,
  regenerateDraftArchive,
} from "./draft-store";
import {
  listAccessionDraftsFromGitHub,
  loadAccessionDraftFromGitHub,
  loadArchiveEntryFromGitHub,
  requireGitHubArchive,
} from "./draft-github-store";
import { runWithRepoRoot } from "./paths";
import { assertArchiveRegenerable } from "./visibility";
import { commitFiles } from "@/lib/github/git-commit";
import { listRepoPaths, readRepoFile } from "@/lib/github/git-read";

async function materializeRepoPaths(
  repoPaths: string[],
  destRoot: string,
): Promise<void> {
  for (const filePath of repoPaths) {
    const buffer = await readRepoFile(filePath);
    if (!buffer) continue;
    const dest = path.join(destRoot, filePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
  }
}

async function collectFilesUnder(
  root: string,
  relativePrefix: string,
): Promise<{ path: string; content: Buffer }[]> {
  const abs = path.join(root, relativePrefix);
  const out: { path: string; content: Buffer }[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: { name: string; isFile(): boolean; isDirectory(): boolean }[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      const rel = path.posix.join(prefix, ent.name);
      if (ent.isDirectory()) {
        await walk(full, rel);
      } else if (ent.isFile()) {
        out.push({ path: rel, content: await fs.readFile(full) });
      }
    }
  }

  await walk(abs, relativePrefix.split(path.sep).join("/"));
  return out;
}

async function materializeRedirects(tmp: string): Promise<void> {
  const redirects = await readRepoFile("content/archive/redirects.json");
  if (!redirects) return;
  const dest = path.join(tmp, "content", "archive", "redirects.json");
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, redirects);
}

async function commitGenerateResult(
  tmp: string,
  draftId: string,
  result: Awaited<ReturnType<typeof regenerateDraftArchive>>,
  previousSlug?: string,
) {
  const upserts = [
    ...(await collectFilesUnder(tmp, path.join("content", "archive", result.slug))),
    ...(await collectFilesUnder(tmp, path.join("public", "archive", result.slug))),
    ...(await collectFilesUnder(tmp, path.join("content", "drafts", draftId))),
  ];

  const redirectsAfter = path.join(tmp, "content", "archive", "redirects.json");
  try {
    upserts.push({
      path: "content/archive/redirects.json",
      content: await fs.readFile(redirectsAfter),
    });
  } catch {
    /* no redirects change */
  }

  const deletes: string[] = [];
  if (previousSlug && previousSlug !== result.slug) {
    deletes.push(
      ...(await listRepoPaths(`content/archive/${previousSlug}`)),
      ...(await listRepoPaths(`public/archive/${previousSlug}`)),
    );
  }

  await commitFiles({
    message: `archive: generate ${result.slug}`,
    upserts: upserts.map((file) => ({
      path: file.path.split(path.sep).join("/"),
      content: file.content,
    })),
    deletes,
  });

  return {
    ...result,
    files: result.files.map((file) => ({
      ...file,
      path: path.relative(tmp, file.path).split(path.sep).join("/") || file.path,
    })),
  };
}

/**
 * Generate/regenerate using the existing FS export pipeline in a temp repo root,
 * then commit archive + public + draft status updates to GitHub in one commit.
 */
export async function regenerateDraftArchiveOnGitHub(draftId: string) {
  requireGitHubArchive();
  const draft = await loadAccessionDraftFromGitHub(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);

  const previousSlug = draft.slugHistory.at(-1);
  const existing = await loadArchiveEntryFromGitHub(draft.slug);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-gen-"));
  try {
    await materializeRepoPaths(
      await listRepoPaths(`content/drafts/${draftId}`),
      tmp,
    );

    if (existing) {
      await materializeRepoPaths(
        await listRepoPaths(`content/archive/${draft.slug}`),
        tmp,
      );
      await materializeRepoPaths(
        await listRepoPaths(`public/archive/${draft.slug}`),
        tmp,
      );
    }

    await materializeRedirects(tmp);

    const result = await runWithRepoRoot(tmp, () =>
      regenerateDraftArchive(draftId),
    );
    return commitGenerateResult(tmp, draftId, result, previousSlug);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

export async function regenerateArchiveSlugOnGitHub(slug: string) {
  requireGitHubArchive();
  const entry = await loadArchiveEntryFromGitHub(slug);
  if (!entry) throw new Error(`Archive entry not found: ${slug}`);
  assertArchiveRegenerable(entry);

  const accessionId = entry.accessionId ?? entry.metadata.accessionId;
  const drafts = await listAccessionDraftsFromGitHub();
  const linked = drafts.find(
    (draft) =>
      draft.slug === slug ||
      (Boolean(accessionId) && draft.accessionId === accessionId),
  );

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "archive-regen-"));
  try {
    await materializeRepoPaths(
      await listRepoPaths(`content/archive/${slug}`),
      tmp,
    );
    await materializeRepoPaths(
      await listRepoPaths(`public/archive/${slug}`),
      tmp,
    );
    if (linked) {
      await materializeRepoPaths(
        await listRepoPaths(`content/drafts/${linked.draftId}`),
        tmp,
      );
    }
    await materializeRedirects(tmp);

    let draftId = linked?.draftId;
    const result = await runWithRepoRoot(tmp, async () => {
      const draft = await hydrateDraftFromArchiveSlug(slug);
      draftId = draft.draftId;
      return regenerateDraftArchive(draft.draftId);
    });

    if (!draftId) {
      throw new Error(`Draft not found after hydrate for archive: ${slug}`);
    }

    return commitGenerateResult(tmp, draftId, result);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
