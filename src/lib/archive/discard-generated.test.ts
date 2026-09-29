import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  assertArchiveDiscardable,
  isArchiveDiscardable,
} from "./archive-policy.ts";
import {
  ArchiveDiscardConfirmationError,
  ArchiveDiscardNotFoundError,
  createAccessionDraft,
  deleteDraft,
  discardGeneratedArchive,
  loadAccessionDraft,
  saveAccessionDraft,
  saveArchiveEntry,
} from "./draft-store.ts";
import { loadArchiveEntry } from "./load-entry.ts";
import {
  addArchiveRedirect,
  assertSlugAllowed,
  loadArchiveRedirects,
  removeArchiveRedirectsForSlug,
  saveArchiveRedirects,
} from "./redirects.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";

function entryFixture(
  slug: string,
  overrides: Record<string, unknown> = {},
): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0099",
    slug,
    status: "generated",
    metadata: {
      title: "Discard Fixture",
      date: "2026-01-01",
      accessionId: "AR-2026-0099",
    },
    assets: {
      artwork: `/archive/${slug}/artwork.avif`,
      preview: `/archive/${slug}/preview.avif`,
      social: `/archive/${slug}/social.jpg`,
      thumb: `/archive/${slug}/thumb.jpg`,
    },
    perception: { states: [], background: "black" },
    export: {},
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

async function writeArchiveTree(slug: string, entry: ArchiveEntry): Promise<void> {
  const contentDir = path.join(process.cwd(), "content", "archive", slug);
  const publicDir = path.join(process.cwd(), "public", "archive", slug);
  await fs.mkdir(path.join(contentDir, "source"), { recursive: true });
  await fs.mkdir(path.join(contentDir, "prepared"), { recursive: true });
  await fs.mkdir(path.join(contentDir, "exports", "mint-package"), {
    recursive: true,
  });
  await fs.mkdir(publicDir, { recursive: true });
  await saveArchiveEntry(entry);
  await fs.writeFile(path.join(contentDir, "manifest.json"), "{}\n");
  await fs.writeFile(path.join(contentDir, "source", "master.jpg"), "source-bytes");
  await fs.writeFile(
    path.join(contentDir, "exports", "mint-package", "collector-notes.txt"),
    "notes",
  );
  await fs.writeFile(path.join(publicDir, "artwork.avif"), "public-art");
  await fs.writeFile(path.join(publicDir, "thumb.jpg"), "public-thumb");
}

describe("discard generated archive", () => {
  let tmpRoot = "";
  let previousCwd = "";

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-discard-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("path traversal / reserved slugs cannot be used as discard targets", () => {
    assert.throws(() => assertSlugAllowed("admin"));
    assert.throws(() => assertSlugAllowed(""));
    const normalized = assertSlugAllowed("../etc/passwd");
    assert.equal(normalized, "etc-passwd");
    assert.equal(normalized.includes(".."), false);
    assert.equal(normalized.includes("/"), false);
    assert.equal(assertSlugAllowed("Ok Slug!!").includes("/"), false);
  });

  it("removeArchiveRedirectsForSlug removes only matching rows", async () => {
    await saveArchiveRedirects({
      version: ARCHIVE_VERSION,
      redirects: [],
    });
    await addArchiveRedirect("old-discard-slug", "keep-other-slug");
    await addArchiveRedirect("unrelated-from", "unrelated-to");
    const removed = await removeArchiveRedirectsForSlug("old-discard-slug");
    assert.equal(removed, 1);
    const file = await loadArchiveRedirects();
    assert.equal(
      file.redirects.some(
        (r) => r.from === "old-discard-slug" || r.to === "old-discard-slug",
      ),
      false,
    );
    assert.equal(
      file.redirects.some((r) => r.from === "unrelated-from"),
      true,
    );
  });

  it("discards generated unpublished archive and leaves sibling + draft source", async () => {
    const draft = await createAccessionDraft({
      title: "Linked Draft",
      date: "2026-03-01",
    });
    const target = draft.slug;
    const sibling = "2026-03-01-discard-sibling";

    await writeArchiveTree(
      target,
      entryFixture(target, {
        accessionId: draft.accessionId,
        metadata: {
          title: "Discard Fixture",
          date: "2026-03-01",
          accessionId: draft.accessionId,
        },
      }),
    );
    await writeArchiveTree(
      sibling,
      entryFixture(sibling, {
        accessionId: "AR-2026-0098",
        metadata: {
          title: "Sibling",
          date: "2026-03-01",
          accessionId: "AR-2026-0098",
        },
      }),
    );

    await saveAccessionDraft({
      ...draft,
      status: "generated",
      generatedAt: "2026-03-01T12:00:00.000Z",
      source: {
        kind: "original",
        storedFilename: "original.jpg",
        originalFilename: "original.jpg",
      },
    });
    await fs.mkdir(
      path.join(process.cwd(), "content", "drafts", draft.draftId, "source"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(
        process.cwd(),
        "content",
        "drafts",
        draft.draftId,
        "source",
        "original.jpg",
      ),
      "draft-source-bytes",
    );

    const result = await discardGeneratedArchive(target, target);
    assert.equal(result.slug, target);

    assert.equal(await loadArchiveEntry(target), null);
    await assert.rejects(
      () => fs.access(path.join(process.cwd(), "content", "archive", target)),
      /ENOENT/,
    );
    await assert.rejects(
      () => fs.access(path.join(process.cwd(), "public", "archive", target)),
      /ENOENT/,
    );

    assert.ok(await loadArchiveEntry(sibling));
    await fs.access(path.join(process.cwd(), "content", "archive", sibling));
    await fs.access(
      path.join(
        process.cwd(),
        "content",
        "drafts",
        draft.draftId,
        "source",
        "original.jpg",
      ),
    );

    const resetDraft = await loadAccessionDraft(draft.draftId);
    assert.ok(resetDraft);
    assert.equal(resetDraft.status, "draft");
    assert.equal(resetDraft.generatedAt, undefined);
  });

  it("refuses published, minted, withdrawn, and hidden records", async () => {
    for (const status of ["published", "minted", "withdrawn", "hidden"] as const) {
      const slug = `2026-04-01-${status}-block`;
      const entry = entryFixture(slug, {
        status,
        publishedAt: status === "minted" ? undefined : "2026-04-01T00:00:00.000Z",
        mintedAt: status === "minted" ? "2026-04-01T00:00:00.000Z" : undefined,
      });
      // withdrawn/hidden still may carry publishedAt
      if (status === "withdrawn" || status === "hidden") {
        Object.assign(entry, { publishedAt: "2026-04-01T00:00:00.000Z" });
      }
      await writeArchiveTree(slug, entry);
      assert.equal(isArchiveDiscardable(entry), false);
      await assert.rejects(
        () => discardGeneratedArchive(slug, slug),
        /not discardable/,
      );
      assert.ok(await loadArchiveEntry(slug));
    }
  });

  it("refuses generated records with publishedAt or mintedAt", async () => {
    const slug = "2026-05-01-timestamp-block";
    const entry = entryFixture(slug, {
      publishedAt: "2026-05-01T00:00:00.000Z",
    });
    await writeArchiveTree(slug, entry);
    await assert.rejects(() => discardGeneratedArchive(slug, slug), /not discardable/);
  });

  it("requires exact slug confirmation and fails closed on missing entry", async () => {
    const slug = "2026-06-01-confirm-me";
    await writeArchiveTree(slug, entryFixture(slug));
    await assert.rejects(
      () => discardGeneratedArchive(slug, "wrong-slug"),
      (err: unknown) => err instanceof ArchiveDiscardConfirmationError,
    );
    await assert.rejects(
      () => discardGeneratedArchive("2026-06-01-missing-entry", "2026-06-01-missing-entry"),
      (err: unknown) => err instanceof ArchiveDiscardNotFoundError,
    );
  });

  it("repeating discard after success fails with not found", async () => {
    const slug = "2026-07-01-repeat-discard";
    await writeArchiveTree(slug, entryFixture(slug));
    await discardGeneratedArchive(slug, slug);
    await assert.rejects(
      () => discardGeneratedArchive(slug, slug),
      (err: unknown) => err instanceof ArchiveDiscardNotFoundError,
    );
  });

  it("draft-only deleteDraft still does not remove archives", async () => {
    const draft = await createAccessionDraft({
      title: "Delete Me",
      date: "2026-08-01",
    });
    const slug = draft.slug;
    await writeArchiveTree(
      slug,
      entryFixture(slug, {
        accessionId: draft.accessionId,
        metadata: {
          title: "Archive Survives",
          date: "2026-08-01",
          accessionId: draft.accessionId,
        },
      }),
    );
    await saveAccessionDraft({
      ...draft,
      status: "prepared",
    });
    await deleteDraft(draft.draftId, draft.draftId);
    assert.equal(await loadAccessionDraft(draft.draftId), null);
    assert.ok(await loadArchiveEntry(slug));
  });
});

describe("discard policy fail-closed (pure)", () => {
  it("assertArchiveDiscardable rejects unsafe statuses", () => {
    const entry = entryFixture("pure-check", { status: "published" });
    assert.throws(() => assertArchiveDiscardable(entry), /not discardable/);
  });
});
