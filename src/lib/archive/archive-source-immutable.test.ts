import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { setArchiveImagePipelineForTests } from "./image-pipeline.ts";
import { loadArchiveEntry } from "./load-entry.ts";
import {
  contentArchiveDir,
  contentArchiveSourceDir,
  contentDraftSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import {
  ArchiveSourceImmutableError,
  createAccessionDraft,
  regeneratePublishedEntryFromDraft,
  saveAccessionDraft,
  saveArchiveEntry,
  storeArchiveSource,
  storeDraftSource,
} from "./draft-store.ts";

function fakeBuffers(marker: string): ArchiveImageBuffers {
  return {
    artwork: Buffer.from(`artwork-${marker}`),
    previewAvif: Buffer.from(`preview-avif-${marker}`),
    previewWebp: Buffer.from(`preview-webp-${marker}`),
    socialJpg: Buffer.from(`social-${marker}`),
    thumbJpg: Buffer.from(`thumb-${marker}`),
  };
}

function entryFixture(
  slug: string,
  overrides: Record<string, unknown> = {},
): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "published",
    metadata: {
      title: "Source Immutability Fixture",
      date: "2026-01-01",
      accessionId: "AR-2026-0101",
    },
    assets: {
      artwork: `/archive/${slug}/artwork.avif`,
      preview: `/archive/${slug}/preview.avif`,
      previewWebp: `/archive/${slug}/preview.webp`,
      social: `/archive/${slug}/social.jpg`,
      thumb: `/archive/${slug}/thumb.jpg`,
    },
    source: {
      kind: "original",
      originalFilename: "master.jpg",
      storedFilename: "master.jpg",
      mimeType: "image/jpeg",
      byteSize: 12,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    perception: { states: [], background: "black" },
    export: { standaloneHtml: "perception.html", includeWebpFallback: true },
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  });
}

function entryWithoutDepositedSource(slug: string): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "generated",
    metadata: {
      title: "No Source Yet",
      date: "2026-01-01",
      accessionId: "AR-2026-0101",
    },
    assets: {
      artwork: `/archive/${slug}/artwork.avif`,
      preview: `/archive/${slug}/preview.avif`,
      previewWebp: `/archive/${slug}/preview.webp`,
      social: `/archive/${slug}/social.jpg`,
      thumb: `/archive/${slug}/thumb.jpg`,
    },
    perception: { states: [], background: "black" },
    export: { standaloneHtml: "perception.html", includeWebpFallback: true },
    provenance: { mint: [], auction: [], marketplace: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

function sourceFile(name: string, bytes: Buffer): File {
  return new File([bytes], name, { type: "image/jpeg" });
}

async function writeCanonicalPublic(slug: string, marker: string): Promise<void> {
  const publicDir = publicArchiveDir(slug);
  await fs.mkdir(publicDir, { recursive: true });
  const buffers = fakeBuffers(marker);
  for (const filename of canonicalPublicDerivativeFilenames()) {
    const normalized =
      filename === "artwork.avif"
        ? "artwork"
        : filename === "preview.avif"
          ? "previewAvif"
          : filename === "preview.webp"
            ? "previewWebp"
            : filename === "social.jpg"
              ? "socialJpg"
              : "thumbJpg";
    await fs.writeFile(
      path.join(publicDir, filename),
      buffers[normalized as keyof ArchiveImageBuffers],
    );
  }
}

async function writeArchiveSource(slug: string, bytes: Buffer): Promise<void> {
  const sourceDir = contentArchiveSourceDir(slug);
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "master.jpg"), bytes);
  await fs.writeFile(
    path.join(sourceDir, "source.json"),
    `${JSON.stringify(
      {
        kind: "original",
        originalFilename: "master.jpg",
        storedFilename: "master.jpg",
        mimeType: "image/jpeg",
        byteSize: bytes.length,
        importedAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
  );
}

async function seedEditDraft(
  slug: string,
  editDraftId: string,
  draftSourceBytes: Buffer,
  status: ArchiveEntry["status"] = "published",
): Promise<void> {
  await fs.mkdir(contentDraftSourceDir(editDraftId), { recursive: true });
  await fs.writeFile(
    path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
    draftSourceBytes,
  );
  await saveAccessionDraft({
    version: ARCHIVE_VERSION,
    draftId: editDraftId,
    accessionId: "AR-2026-0101",
    status,
    slug,
    slugLocked: true,
    slugHistory: [],
    source: {
      kind: "original",
      originalFilename: "original.jpg",
      storedFilename: "original.jpg",
      mimeType: "image/jpeg",
      byteSize: draftSourceBytes.length,
      importedAt: new Date().toISOString(),
    },
    processing: {},
    artwork: {
      id: slug,
      metadata: {
        accessionId: "AR-2026-0101",
        title: "Source immutability test",
        date: "2026-01-01",
      },
      imageSrc: "",
      states: [],
      background: "black",
    },
    provenance: { mint: [], auction: [], marketplace: [] },
    export: {
      standaloneHtml: "perception.html",
      includeWebpFallback: true,
      preset: "archival",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

describe("archive source immutability", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  let capturedSource: Buffer | null = null;
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-source-immutable-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveImagePipelineForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
    if (previousEnabled === undefined) {
      delete process.env.ADMIN_INGEST_ENABLED;
    } else {
      process.env.ADMIN_INGEST_ENABLED = previousEnabled;
    }
    if (previousSecret === undefined) {
      delete process.env.ADMIN_INGEST_SECRET;
    } else {
      process.env.ADMIN_INGEST_SECRET = previousSecret;
    }
  });

  function enableAdmin(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
  }

  function installPipelineMock(marker = "REGEN"): void {
    capturedSource = null;
    setArchiveImagePipelineForTests(async (sourceBuffer: Buffer) => {
      capturedSource = sourceBuffer;
      return fakeBuffers(marker);
    });
  }

  async function loadSourcePost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/source/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  async function postSource(slug: string, bytes: Buffer): Promise<Response> {
    const form = new FormData();
    form.append("source", sourceFile("replacement.jpg", bytes));
    const POST = await loadSourcePost();
    return POST(
      new Request(`http://localhost/api/admin/archive/${slug}/source`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
        body: form,
      }),
      { params: Promise.resolve({ slug }) },
    );
  }

  it("allows first archive source deposit when no deposited source exists", async () => {
    const slug = "2026-01-01-first-archive-deposit";
    await fs.mkdir(contentArchiveDir(slug), { recursive: true });
    await saveArchiveEntry(entryWithoutDepositedSource(slug));

    const firstBytes = Buffer.from("FIRST-DEPOSIT-BYTES");
    const updated = await storeArchiveSource(slug, sourceFile("first.jpg", firstBytes));

    assert.equal(updated.source?.kind, "original");
    assert.equal(updated.source?.storedFilename, "master.jpg");
    const onDisk = await fs.readFile(path.join(contentArchiveSourceDir(slug), "master.jpg"));
    assert.equal(onDisk.toString(), firstBytes.toString());
  });

  it("rejects second archive source deposit with ArchiveSourceImmutableError", async () => {
    const slug = "2026-01-01-second-deposit-rejected";
    const originalBytes = Buffer.from("ORIGINAL-DEPOSIT-BYTES");
    await writeArchiveSource(slug, originalBytes);
    await saveArchiveEntry(entryFixture(slug));

    await assert.rejects(
      () =>
        storeArchiveSource(
          slug,
          sourceFile("replacement.jpg", Buffer.from("REPLACEMENT-BYTES")),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ArchiveSourceImmutableError);
        assert.match(
          error.message,
          /immutable once deposited/i,
        );
        return true;
      },
    );
  });

  for (const [status, slugSuffix, overrides] of [
    ["generated", "generated", { status: "generated", publishedAt: undefined }],
    [
      "published",
      "published",
      { status: "published", publishedAt: "2026-01-02T00:00:00.000Z" },
    ],
    [
      "minted",
      "minted",
      {
        status: "minted",
        mintedAt: "2026-01-03T00:00:00.000Z",
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      "hidden",
      "hidden",
      {
        status: "hidden",
        hiddenAt: "2026-01-04T00:00:00.000Z",
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    [
      "withdrawn",
      "withdrawn",
      {
        status: "withdrawn",
        withdrawnAt: "2026-01-05T00:00:00.000Z",
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  ] as const) {
    it(`rejects archive source replacement for ${status} archives`, async () => {
      const slug = `2026-01-01-immutable-${slugSuffix}`;
      const originalBytes = Buffer.from(`ORIGINAL-${status}`);
      await writeArchiveSource(slug, originalBytes);
      await saveArchiveEntry(entryFixture(slug, overrides));

      await assert.rejects(
        () =>
          storeArchiveSource(
            slug,
            sourceFile("replacement.jpg", Buffer.from(`REPLACEMENT-${status}`)),
          ),
        ArchiveSourceImmutableError,
      );

      const onDisk = await fs.readFile(
        path.join(contentArchiveSourceDir(slug), "master.jpg"),
      );
      assert.equal(onDisk.toString(), originalBytes.toString());
    });
  }

  it("still allows draft source replacement after archive source is deposited", async () => {
    const slug = "2026-01-01-draft-source-mutable";
    const editDraftId = "edit-draft-mutable";
    const archiveBytes = Buffer.from("ARCHIVE-SOURCE-A");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, editDraftId, Buffer.from("DRAFT-SOURCE-A"));

    const updated = await storeDraftSource(
      editDraftId,
      sourceFile("reupload.jpg", Buffer.from("DRAFT-SOURCE-B")),
    );

    assert.equal(updated.source.storedFilename, "original.jpg");
    assert.equal(updated.source.originalFilename, "reupload.jpg");
    const draftBytes = await fs.readFile(
      path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
    );
    assert.equal(draftBytes.toString(), "DRAFT-SOURCE-B");

    const archiveBytesAfter = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(archiveBytesAfter.toString(), archiveBytes.toString());
  });

  it("regeneration after draft re-upload still uses deposited archive original", async () => {
    installPipelineMock("REGEN-SOURCE");
    const slug = "2026-01-01-regen-uses-archive-source";
    const editDraftId = "edit-regen-archive-source";
    const archiveBytes = Buffer.from("ARCHIVE-ORIGINAL-A");
    const draftBytesB = Buffer.from("DRAFT-REUPLOAD-B");
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, editDraftId, Buffer.from("DRAFT-ORIGINAL-A"));

    await storeDraftSource(editDraftId, sourceFile("reupload.jpg", draftBytesB));
    await regeneratePublishedEntryFromDraft(editDraftId);

    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), archiveBytes.toString());
    assert.ok(capturedSource);
    assert.equal(capturedSource!.toString(), archiveBytes.toString());
    assert.notEqual(capturedSource!.toString(), draftBytesB.toString());
  });

  it("rejected replacement leaves source directory and metadata unchanged", async () => {
    const slug = "2026-01-01-reject-no-mutation";
    const originalBytes = Buffer.from("KEEP-THESE-BYTES");
    await writeArchiveSource(slug, originalBytes);
    await saveArchiveEntry(entryFixture(slug));

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    const listingBefore = (await fs.readdir(contentArchiveSourceDir(slug))).sort();

    await assert.rejects(
      () =>
        storeArchiveSource(
          slug,
          sourceFile("replacement.jpg", Buffer.from("SHOULD-NOT-WRITE")),
        ),
      ArchiveSourceImmutableError,
    );

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    const listingAfter = (await fs.readdir(contentArchiveSourceDir(slug))).sort();
    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );

    assert.equal(metadataAfter, metadataBefore);
    assert.deepEqual(listingAfter, listingBefore);
    assert.equal(onDisk.toString(), originalBytes.toString());
  });

  it("source route allows first deposit then returns 409 on second deposit", async () => {
    enableAdmin();
    const slug = "2026-01-01-route-first-then-conflict";
    await fs.mkdir(contentArchiveDir(slug), { recursive: true });
    await saveArchiveEntry(entryWithoutDepositedSource(slug));

    const first = await postSource(slug, Buffer.from("ROUTE-FIRST-DEPOSIT"));
    assert.equal(first.status, 200);

    const second = await postSource(slug, Buffer.from("ROUTE-SECOND-ATTEMPT"));
    assert.equal(second.status, 409);
    const data = (await second.json()) as { error?: string };
    assert.match(data.error ?? "", /immutable once deposited/i);

    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), "ROUTE-FIRST-DEPOSIT");
  });

  it("source route rejects unauthenticated requests", async () => {
    delete process.env.ADMIN_INGEST_ENABLED;
    delete process.env.ADMIN_INGEST_SECRET;

    const POST = await loadSourcePost();
    const form = new FormData();
    form.append("source", sourceFile("x.jpg", Buffer.from("x")));
    const res = await POST(
      new Request("http://localhost/api/admin/archive/x/source", {
        method: "POST",
        body: form,
      }),
      { params: Promise.resolve({ slug: "x" }) },
    );

    assert.equal(res.status, 403);
  });

  async function loadGeneratePost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/drafts/[draftId]/generate/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ draftId: string }> },
    ) => Promise<Response>;
  }

  async function seedFirstTimeDraft(slug: string) {
    const draft = await createAccessionDraft({
      slug,
      title: "First generate route",
      date: "2026-01-01",
    });
    const draftBytes = Buffer.from(`source-${draft.draftId}`);
    await fs.mkdir(contentDraftSourceDir(draft.draftId), { recursive: true });
    await fs.writeFile(
      path.join(contentDraftSourceDir(draft.draftId), "original.jpg"),
      draftBytes,
    );
    return saveAccessionDraft({
      ...draft,
      source: {
        kind: "original",
        originalFilename: "original.jpg",
        storedFilename: "original.jpg",
        mimeType: "image/jpeg",
        byteSize: draftBytes.length,
        importedAt: new Date().toISOString(),
      },
      status: "prepared",
    });
  }

  it("generate route: first-time draft succeeds", async () => {
    enableAdmin();
    installPipelineMock("FIRST-ROUTE-GEN");
    const draft = await seedFirstTimeDraft("2026-01-01-route-first-generate");

    const POST = await loadGeneratePost();
    const res = await POST(
      new Request(`http://localhost/api/admin/drafts/${draft.draftId}/generate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: draft.draftId }) },
    );

    assert.equal(res.status, 200);
    assert.ok(capturedSource);
    const entry = await loadArchiveEntry(draft.slug);
    assert.ok(entry);
    assert.equal(entry?.status, "generated");
  });

  it("generate route: existing published uses archive source after draft re-upload", async () => {
    enableAdmin();
    installPipelineMock("ROUTE-REGEN-SOURCE");
    const slug = "2026-01-01-route-gen-archive-source";
    const editDraftId = "edit-route-gen-archive-source";
    const archiveBytes = Buffer.from("ARCHIVE-ORIGINAL-ROUTE");
    const draftBytesB = Buffer.from("DRAFT-REUPLOAD-ROUTE");
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, archiveBytes);
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, editDraftId, Buffer.from("DRAFT-ORIGINAL-ROUTE"));

    await storeDraftSource(editDraftId, sourceFile("reupload.jpg", draftBytesB));

    const POST = await loadGeneratePost();
    const res = await POST(
      new Request(`http://localhost/api/admin/drafts/${editDraftId}/generate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: editDraftId }) },
    );

    assert.equal(res.status, 200);
    const onDisk = await fs.readFile(
      path.join(contentArchiveSourceDir(slug), "master.jpg"),
    );
    assert.equal(onDisk.toString(), archiveBytes.toString());
    assert.ok(capturedSource);
    assert.equal(capturedSource!.toString(), archiveBytes.toString());
    assert.notEqual(capturedSource!.toString(), draftBytesB.toString());
  });

  it("generate route: existing minted and hidden preserve status and timestamps", async () => {
    enableAdmin();
    const cases: Array<{
      status: ArchiveEntry["status"];
      slug: string;
      editDraftId: string;
      overrides: Record<string, unknown>;
    }> = [
      {
        status: "minted",
        slug: "2026-01-01-route-gen-minted",
        editDraftId: "edit-route-gen-minted",
        overrides: {
          mintedAt: "2026-01-03T00:00:00.000Z",
          publishedAt: "2026-01-02T00:00:00.000Z",
        },
      },
      {
        status: "hidden",
        slug: "2026-01-01-route-gen-hidden",
        editDraftId: "edit-route-gen-hidden",
        overrides: {
          hiddenAt: "2026-01-04T00:00:00.000Z",
          publishedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    ];

    for (const { status, slug, editDraftId, overrides } of cases) {
      installPipelineMock(`ROUTE-${status}`);
      await writeCanonicalPublic(slug, `BEFORE-${status}`);
      await writeArchiveSource(slug, Buffer.from(`source-${slug}`));
      await saveArchiveEntry(entryFixture(slug, { status, ...overrides }));
      await seedEditDraft(slug, editDraftId, Buffer.from(`draft-${editDraftId}`), status);

      const POST = await loadGeneratePost();
      const res = await POST(
        new Request(`http://localhost/api/admin/drafts/${editDraftId}/generate`, {
          method: "POST",
          headers: { Authorization: "Bearer test-secret" },
        }),
        { params: Promise.resolve({ draftId: editDraftId }) },
      );

      assert.equal(res.status, 200, `route should succeed for ${status}`);
      const entry = await loadArchiveEntry(slug);
      assert.equal(entry?.status, status, `status preserved for ${status}`);
      if (overrides.publishedAt) {
        assert.equal(entry?.publishedAt, overrides.publishedAt);
      }
      if (overrides.hiddenAt) {
        assert.equal(entry?.hiddenAt, overrides.hiddenAt);
      }
      if (overrides.mintedAt) {
        assert.equal(entry?.mintedAt, overrides.mintedAt);
      }
    }
  });

  it("generate route failure does not mutate archive metadata", async () => {
    enableAdmin();
    const slug = "2026-01-01-route-gen-fail-no-mutate";
    const editDraftId = "edit-route-gen-fail";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("source-keep"));
    await saveArchiveEntry(entryFixture(slug));
    await seedEditDraft(slug, editDraftId, Buffer.from("draft-keep"));

    setArchiveImagePipelineForTests(async () => {
      throw new Error("pipeline failed");
    });

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );

    const POST = await loadGeneratePost();
    const res = await POST(
      new Request(`http://localhost/api/admin/drafts/${editDraftId}/generate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: editDraftId }) },
    );

    assert.equal(res.status, 500);
    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
  });
});
