import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { setArchiveImagePipelineForTests } from "./image-pipeline.ts";
import {
  buildArchiveVisibilityUpdate,
  createAccessionDraft,
  generateArchiveFromDraft,
  loadAccessionDraft,
  saveAccessionDraft,
  saveArchiveEntry,
  storeDraftSource,
} from "./draft-store.ts";
import { accessionDraftToArchiveDraft, archiveEntryToAccessionDraft } from "./adapters.ts";
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
  AccessionDraftSchema,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import {
  setArchiveGitHubMetadataPushHookForTests,
  setArchiveGitHubPushHookForTests,
} from "../github/publish-entry.ts";

function fakeBuffers(marker: string): ArchiveImageBuffers {
  return {
    artwork: Buffer.from(`artwork-${marker}`),
    previewAvif: Buffer.from(`preview-avif-${marker}`),
    previewWebp: Buffer.from(`preview-webp-${marker}`),
    socialJpg: Buffer.from(`social-${marker}`),
    thumbJpg: Buffer.from(`thumb-${marker}`),
  };
}

function entryFixture(slug: string, overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "published",
    metadata: {
      title: "Withdrawn Regen Fixture",
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
}

async function seedEditDraft(
  slug: string,
  editDraftId: string,
  status: ArchiveEntry["status"],
): Promise<void> {
  const draftBytes = Buffer.from(`draft-${editDraftId}`);
  await fs.mkdir(contentDraftSourceDir(editDraftId), { recursive: true });
  await fs.writeFile(
    path.join(contentDraftSourceDir(editDraftId), "original.jpg"),
    draftBytes,
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
      byteSize: draftBytes.length,
      importedAt: new Date().toISOString(),
    },
    processing: {},
    artwork: {
      id: slug,
      metadata: {
        accessionId: "AR-2026-0101",
        title: "Withdrawn regen test",
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

describe("withdrawn regenerate API enforcement", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  let pipelineCalls = 0;
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-withdrawn-regen-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    setArchiveImagePipelineForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
    setArchiveGitHubMetadataPushHookForTests(undefined);
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

  afterEach(() => {
    setArchiveImagePipelineForTests(undefined);
    setArchiveGitHubPushHookForTests(undefined);
    setArchiveGitHubMetadataPushHookForTests(undefined);
    pipelineCalls = 0;
  });

  function enableAdmin(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
  }

  function installPipelineMock(): void {
    pipelineCalls = 0;
    setArchiveImagePipelineForTests(async () => {
      pipelineCalls += 1;
      return fakeBuffers("SHOULD-NOT-RUN");
    });
  }

  async function loadSlugPost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/[slug]/regenerate/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ slug: string }> },
    ) => Promise<Response>;
  }

  async function loadDraftPost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/drafts/[draftId]/regenerate/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (
      request: Request,
      context: { params: Promise<{ draftId: string }> },
    ) => Promise<Response>;
  }

  it("slug regenerate returns 409 for withdrawn without mutating files or pipeline", async () => {
    enableAdmin();
    installPipelineMock();
    let githubCalls = 0;
    setArchiveGitHubPushHookForTests(async () => {
      githubCalls += 1;
      return { commitSha: "should-not", paths: [] };
    });
    setArchiveGitHubMetadataPushHookForTests(async () => {
      githubCalls += 1;
      return { commitSha: "should-not" };
    });

    const slug = "2026-01-01-withdrawn-slug-regen";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("withdrawn-source-bytes"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, "edit-withdrawn-slug", "withdrawn");

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    const artworkBefore = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
    );

    const POST = await loadSlugPost();
    const res = await POST(
      new Request(`http://localhost/api/admin/archive/${slug}/regenerate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ slug }) },
    );

    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /withdrawn and cannot be regenerated/);
    assert.equal(pipelineCalls, 0);
    assert.equal(githubCalls, 0);

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
    const artworkAfter = await fs.readFile(
      path.join(publicArchiveDir(slug), "artwork.avif"),
    );
    assert.equal(artworkAfter.toString(), artworkBefore.toString());

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "withdrawn");
    assert.equal(entry?.withdrawnAt, withdrawnAt);
  });

  it("slug regenerate succeeds after restore from withdrawn", async () => {
    enableAdmin();
    pipelineCalls = 0;
    setArchiveImagePipelineForTests(async () => {
      pipelineCalls += 1;
      return fakeBuffers("AFTER-RESTORE");
    });

    const slug = "2026-01-01-withdrawn-then-restore";
    await writeCanonicalPublic(slug, "BEFORE");
    await writeArchiveSource(slug, Buffer.from("restore-source"));
    const withdrawn = await saveArchiveEntry(
      entryFixture(slug, {
        status: "withdrawn",
        withdrawnAt: "2026-01-05T00:00:00.000Z",
      }),
    );
    await seedEditDraft(slug, "edit-withdrawn-restore", "withdrawn");

    const restored = buildArchiveVisibilityUpdate(withdrawn, "published");
    await saveArchiveEntry(restored);
    await saveAccessionDraft({
      ...(await loadAccessionDraft("edit-withdrawn-restore"))!,
      status: "published",
      updatedAt: new Date().toISOString(),
    });

    const POST = await loadSlugPost();
    const res = await POST(
      new Request(`http://localhost/api/admin/archive/${slug}/regenerate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ slug }) },
    );

    assert.equal(res.status, 200);
    assert.ok(pipelineCalls > 0);
    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
  });

  it("draft regenerate returns 409 for withdrawn without mutating archive or draft status", async () => {
    enableAdmin();
    installPipelineMock();

    const slug = "2026-01-01-withdrawn-draft-regen";
    const editDraftId = "edit-withdrawn-draft-route";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("draft-route-source"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, editDraftId, "withdrawn");

    const draftBefore = await loadAccessionDraft(editDraftId);
    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );

    const POST = await loadDraftPost();
    const res = await POST(
      new Request(`http://localhost/api/admin/drafts/${editDraftId}/regenerate`, {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: editDraftId }) },
    );

    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /withdrawn and cannot be regenerated/);
    assert.equal(pipelineCalls, 0);

    const draftAfter = await loadAccessionDraft(editDraftId);
    assert.equal(draftAfter?.status, draftBefore?.status);
    assert.equal(draftAfter?.updatedAt, draftBefore?.updatedAt);

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "withdrawn");
    assert.equal(entry?.withdrawnAt, withdrawnAt);
  });
});

describe("withdrawn generate enforcement", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  let pipelineCalls = 0;
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-withdrawn-generate-"));
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

  afterEach(() => {
    setArchiveImagePipelineForTests(undefined);
    pipelineCalls = 0;
  });

  function enableAdmin(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
  }

  function installPipelineMock(marker = "GEN-OK"): void {
    pipelineCalls = 0;
    setArchiveImagePipelineForTests(async () => {
      pipelineCalls += 1;
      return fakeBuffers(marker);
    });
  }

  function installBlockedPipelineMock(): void {
    pipelineCalls = 0;
    setArchiveImagePipelineForTests(async () => {
      pipelineCalls += 1;
      return fakeBuffers("SHOULD-NOT-RUN");
    });
  }

  async function seedFirstTimeDraft(slug: string) {
    const draft = await createAccessionDraft({
      slug,
      title: "First generate",
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

  async function loadArchiveGeneratePost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/generate/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (request: Request) => Promise<Response>;
  }

  it("first-time generation with no archive succeeds", async () => {
    installPipelineMock("FIRST-GEN");
    const draft = await seedFirstTimeDraft("2026-01-01-first-generate");

    const result = await generateArchiveFromDraft(draft.draftId);

    assert.equal(result.slug, draft.slug);
    assert.ok(pipelineCalls > 0);
    const entry = await loadArchiveEntry(draft.slug);
    assert.ok(entry);
    assert.equal(entry?.status, "generated");
  });

  it("generate preserves existing non-withdrawn archive statuses", async () => {
    installPipelineMock("STATUS-PRESERVE");
    const cases: Array<{
      status: ArchiveEntry["status"];
      slug: string;
      editDraftId: string;
      overrides?: Record<string, unknown>;
    }> = [
      {
        status: "generated",
        slug: "2026-01-01-gen-existing-generated",
        editDraftId: "edit-gen-generated",
      },
      {
        status: "published",
        slug: "2026-01-01-gen-existing-published",
        editDraftId: "edit-gen-published",
        overrides: { publishedAt: "2026-01-02T00:00:00.000Z" },
      },
      {
        status: "minted",
        slug: "2026-01-01-gen-existing-minted",
        editDraftId: "edit-gen-minted",
        overrides: {
          mintedAt: "2026-01-03T00:00:00.000Z",
          publishedAt: "2026-01-02T00:00:00.000Z",
        },
      },
      {
        status: "hidden",
        slug: "2026-01-01-gen-existing-hidden",
        editDraftId: "edit-gen-hidden",
        overrides: {
          hiddenAt: "2026-01-04T00:00:00.000Z",
          publishedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    ];

    for (const { status, slug, editDraftId, overrides } of cases) {
      pipelineCalls = 0;
      await writeCanonicalPublic(slug, `BEFORE-${status}`);
      await writeArchiveSource(slug, Buffer.from(`source-${slug}`));
      await saveArchiveEntry(entryFixture(slug, { status, ...overrides }));
      await seedEditDraft(slug, editDraftId, status);

      await generateArchiveFromDraft(editDraftId);

      assert.ok(pipelineCalls > 0, `pipeline should run for ${status}`);
      const entry = await loadArchiveEntry(slug);
      assert.equal(entry?.status, status, `status preserved for ${status}`);
    }
  });

  it("generateArchiveFromDraft rejects withdrawn archive before pipeline", async () => {
    installBlockedPipelineMock();

    const slug = "2026-01-01-gen-withdrawn-store";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    const editDraftId = "edit-gen-withdrawn-store";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("withdrawn-store-source"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, editDraftId, "withdrawn");

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );

    await assert.rejects(
      () => generateArchiveFromDraft(editDraftId),
      /withdrawn and cannot be regenerated/,
    );

    assert.equal(pipelineCalls, 0);
    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
  });

  it("generateArchiveFromDraft rejects stale draft when archive is withdrawn", async () => {
    installBlockedPipelineMock();

    const slug = "2026-01-01-gen-stale-draft";
    const editDraftId = "edit-gen-stale-draft";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("stale-draft-source"));
    await saveArchiveEntry(
      entryFixture(slug, {
        status: "withdrawn",
        withdrawnAt: "2026-01-05T00:00:00.000Z",
      }),
    );
    await seedEditDraft(slug, editDraftId, "published");

    await assert.rejects(
      () => generateArchiveFromDraft(editDraftId),
      /withdrawn and cannot be regenerated/,
    );
    assert.equal(pipelineCalls, 0);
  });

  it("draft generate route returns 409 for withdrawn without mutating files", async () => {
    enableAdmin();
    installBlockedPipelineMock();

    const slug = "2026-01-01-gen-withdrawn-route";
    const editDraftId = "edit-gen-withdrawn-route";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("route-source"));
    await saveArchiveEntry(
      entryFixture(slug, { status: "withdrawn", withdrawnAt }),
    );
    await seedEditDraft(slug, editDraftId, "withdrawn");

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

    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /withdrawn and cannot be regenerated/);
    assert.equal(pipelineCalls, 0);

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
  });

  it("draft generate route rejects unauthenticated requests", async () => {
    delete process.env.ADMIN_INGEST_ENABLED;
    delete process.env.ADMIN_INGEST_SECRET;

    const POST = await loadGeneratePost();
    const res = await POST(
      new Request("http://localhost/api/admin/drafts/edit-gen-auth/generate", {
        method: "POST",
      }),
      { params: Promise.resolve({ draftId: "edit-gen-auth" }) },
    );

    assert.equal(res.status, 403);
  });

  it("archive generate route returns 409 for withdrawn archive", async () => {
    enableAdmin();
    installBlockedPipelineMock();

    const slug = "2026-01-01-raw-gen-withdrawn";
    await writeCanonicalPublic(slug, "KEEP");
    await writeArchiveSource(slug, Buffer.from("raw-route-source"));
    await saveArchiveEntry(
      entryFixture(slug, {
        status: "withdrawn",
        withdrawnAt: "2026-01-05T00:00:00.000Z",
      }),
    );

    const accessionDraft = AccessionDraftSchema.parse({
      version: ARCHIVE_VERSION,
      draftId: "edit-raw-gen-withdrawn",
      accessionId: "AR-2026-0101",
      status: "generated",
      slug,
      slugLocked: true,
      slugHistory: [],
      source: {
        kind: "original",
        originalFilename: "original.jpg",
        storedFilename: "original.jpg",
        mimeType: "image/jpeg",
        byteSize: 12,
        importedAt: new Date().toISOString(),
      },
      processing: {},
      artwork: {
        id: slug,
        metadata: {
          accessionId: "AR-2026-0101",
          title: "Raw generate test",
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
    const archiveDraft = accessionDraftToArchiveDraft(accessionDraft);

    const form = new FormData();
    form.append("source", new File([Buffer.from("raw-source")], "original.jpg", {
      type: "image/jpeg",
    }));
    form.append("draft", JSON.stringify(archiveDraft));

    const POST = await loadArchiveGeneratePost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/generate", {
        method: "POST",
        headers: { Authorization: "Bearer test-secret" },
        body: form,
      }),
    );

    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /withdrawn and cannot be regenerated/);
    assert.equal(pipelineCalls, 0);
  });

  describe("archive generate route source authority", () => {
    let capturedSource: Buffer | null = null;

    function installCapturingPipelineMock(marker = "RAW-ROUTE"): void {
      capturedSource = null;
      pipelineCalls = 0;
      setArchiveImagePipelineForTests(async (sourceBuffer: Buffer) => {
        capturedSource = sourceBuffer;
        pipelineCalls += 1;
        return fakeBuffers(marker);
      });
    }

    async function postArchiveGenerate(
      archiveDraft: ReturnType<typeof accessionDraftToArchiveDraft>,
      sourceBytes: Buffer,
    ): Promise<Response> {
      const form = new FormData();
      form.append(
        "source",
        new File([sourceBytes], "upload.jpg", { type: "image/jpeg" }),
      );
      form.append("draft", JSON.stringify(archiveDraft));
      const POST = await loadArchiveGeneratePost();
      return POST(
        new Request("http://localhost/api/admin/archive/generate", {
          method: "POST",
          headers: { Authorization: "Bearer test-secret" },
          body: form,
        }),
      );
    }

    it("first-time form generation succeeds", async () => {
      enableAdmin();
      installCapturingPipelineMock("RAW-FIRST");
      const draft = await seedFirstTimeDraft("2026-01-01-raw-first");
      const archiveDraft = accessionDraftToArchiveDraft(draft);

      const res = await postArchiveGenerate(
        archiveDraft,
        Buffer.from("first-raw-source"),
      );

      assert.equal(res.status, 200);
      assert.ok(pipelineCalls > 0);
      assert.equal(capturedSource?.toString(), "first-raw-source");
    });

    it("existing published uses archive source after form supplies different bytes", async () => {
      enableAdmin();
      installCapturingPipelineMock("RAW-REGEN-SOURCE");
      const slug = "2026-01-01-raw-gen-archive-source";
      const editDraftId = "edit-raw-gen-archive-source";
      const archiveBytes = Buffer.from("ARCHIVE-ORIGINAL-RAW");
      const formBytesB = Buffer.from("FORM-UPLOAD-RAW");
      await writeCanonicalPublic(slug, "BEFORE");
      await writeArchiveSource(slug, archiveBytes);
      await saveArchiveEntry(entryFixture(slug));
      await seedEditDraft(slug, editDraftId, "published");
      const draft = await loadAccessionDraft(editDraftId);
      assert.ok(draft);
      const archiveDraft = accessionDraftToArchiveDraft(draft);

      const res = await postArchiveGenerate(archiveDraft, formBytesB);

      assert.equal(res.status, 200);
      const onDisk = await fs.readFile(
        path.join(contentArchiveSourceDir(slug), "master.jpg"),
      );
      assert.equal(onDisk.toString(), archiveBytes.toString());
      assert.ok(capturedSource);
      assert.equal(capturedSource!.toString(), archiveBytes.toString());
      assert.notEqual(capturedSource!.toString(), formBytesB.toString());
      const after = await loadArchiveEntry(slug);
      assert.equal(after?.status, "published");
    });

    it("existing archive without workspace draft uses archiveEntry stub for source resolution", async () => {
      enableAdmin();
      installCapturingPipelineMock("RAW-STUB");
      const slug = "2026-01-01-raw-gen-stub";
      const archiveBytes = Buffer.from("ARCHIVE-STUB-SOURCE");
      const formBytesB = Buffer.from("FORM-STUB-UPLOAD");
      await writeCanonicalPublic(slug, "BEFORE");
      await writeArchiveSource(slug, archiveBytes);
      await saveArchiveEntry(entryFixture(slug));
      const archiveDraft = accessionDraftToArchiveDraft(
        archiveEntryToAccessionDraft(entryFixture(slug)),
      );

      const res = await postArchiveGenerate(archiveDraft, formBytesB);

      assert.equal(res.status, 200);
      assert.equal(capturedSource?.toString(), archiveBytes.toString());
    });

    it("existing minted and hidden preserve status and timestamps", async () => {
      enableAdmin();
      const cases: Array<{
        status: ArchiveEntry["status"];
        slug: string;
        editDraftId: string;
        overrides: Record<string, unknown>;
      }> = [
        {
          status: "minted",
          slug: "2026-01-01-raw-gen-minted",
          editDraftId: "edit-raw-gen-minted",
          overrides: {
            mintedAt: "2026-01-03T00:00:00.000Z",
            publishedAt: "2026-01-02T00:00:00.000Z",
          },
        },
        {
          status: "hidden",
          slug: "2026-01-01-raw-gen-hidden",
          editDraftId: "edit-raw-gen-hidden",
          overrides: {
            hiddenAt: "2026-01-04T00:00:00.000Z",
            publishedAt: "2026-01-02T00:00:00.000Z",
          },
        },
      ];

      for (const { status, slug, editDraftId, overrides } of cases) {
        installCapturingPipelineMock(`RAW-${status}`);
        await writeCanonicalPublic(slug, `BEFORE-${status}`);
        await writeArchiveSource(slug, Buffer.from(`source-${slug}`));
        await saveArchiveEntry(entryFixture(slug, { status, ...overrides }));
        await seedEditDraft(slug, editDraftId, status);
        const draft = await loadAccessionDraft(editDraftId);
        assert.ok(draft);
        const archiveDraft = accessionDraftToArchiveDraft(draft);

        const res = await postArchiveGenerate(
          archiveDraft,
          Buffer.from(`form-${editDraftId}`),
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

    it("draft re-upload does not affect archive source on subsequent form generate", async () => {
      enableAdmin();
      installCapturingPipelineMock("RAW-REUPLOAD");
      const slug = "2026-01-01-raw-gen-reupload";
      const editDraftId = "edit-raw-gen-reupload";
      const archiveBytes = Buffer.from("ARCHIVE-ORIGINAL-REUPLOAD");
      const draftBytesB = Buffer.from("DRAFT-REUPLOAD-RAW");
      await writeCanonicalPublic(slug, "BEFORE");
      await writeArchiveSource(slug, archiveBytes);
      await saveArchiveEntry(entryFixture(slug));
      await seedEditDraft(slug, editDraftId, "published");

      await storeDraftSource(
        editDraftId,
        new File([draftBytesB], "reupload.jpg", { type: "image/jpeg" }),
      );

      const draft = await loadAccessionDraft(editDraftId);
      assert.ok(draft);
      const archiveDraft = accessionDraftToArchiveDraft(draft);
      const res = await postArchiveGenerate(
        archiveDraft,
        Buffer.from("FORM-BYTES-SHOULD-NOT-WIN"),
      );

      assert.equal(res.status, 200);
      assert.equal(capturedSource?.toString(), archiveBytes.toString());
      const onDisk = await fs.readFile(
        path.join(contentArchiveSourceDir(slug), "master.jpg"),
      );
      assert.equal(onDisk.toString(), archiveBytes.toString());
    });
  });
});
