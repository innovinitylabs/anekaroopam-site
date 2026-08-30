import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, it } from "node:test";
import {
  formatWizardStatusHeader,
  generateEndpointKind,
  isExistingArchiveBundle,
  isRegenerateBlocked,
  showPublishToGitHubAction,
  usesSyncOnPublishStep,
} from "../../components/admin/admin-workflow-state.ts";
import {
  canonicalPublicDerivativeFilenames,
} from "./public-derivative-export.ts";
import {
  contentArchiveSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type AccessionDraft,
  type ArchiveEntry,
} from "./schema.ts";
import {
  createAccessionDraft,
  saveAccessionDraft,
  saveArchiveEntry,
} from "./draft-store.ts";
import { loadArchiveEntry } from "./load-entry.ts";

function fakeBuffers(marker: string): ArchiveImageBuffers {
  return {
    artwork: Buffer.from(`artwork-${marker}`),
    previewAvif: Buffer.from(`preview-avif-${marker}`),
    previewWebp: Buffer.from(`preview-webp-${marker}`),
    socialJpg: Buffer.from(`social-${marker}`),
    thumbJpg: Buffer.from(`thumb-${marker}`),
  };
}

function draftFixture(
  draftId: string,
  status: AccessionDraft["status"],
): AccessionDraft {
  return {
    version: ARCHIVE_VERSION,
    draftId,
    accessionId: "AR-2026-0101",
    status,
    slug: "2026-01-01-admin-workflow",
    slugLocked: false,
    slugHistory: [],
    source: {
      kind: "original",
      originalFilename: "master.jpg",
      storedFilename: "original.jpg",
      mimeType: "image/jpeg",
      byteSize: 12,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    processing: {},
    artwork: {
      id: "2026-01-01-admin-workflow",
      metadata: {
        title: "Admin Workflow Fixture",
        date: "2026-01-01",
        accessionId: "AR-2026-0101",
      },
      imageSrc: "",
      states: [],
      background: "black",
    },
    provenance: { mint: [], auction: [], marketplace: [] },
    export: { standaloneHtml: "perception.html", includeWebpFallback: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function entryFixture(slug: string, overrides: Record<string, unknown> = {}): ArchiveEntry {
  return ArchiveEntrySchema.parse({
    version: ARCHIVE_VERSION,
    accessionId: "AR-2026-0101",
    slug,
    status: "generated",
    metadata: {
      title: "Admin Workflow Fixture",
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
    ...overrides,
  });
}

describe("admin workflow state: generated existing archive", () => {
  it("treats generated as existing archive bundle for labeling and endpoint", () => {
    const draft = draftFixture("draft-2026-0001", "generated");
    assert.equal(isExistingArchiveBundle(draft, draft.draftId, "generated"), true);
    assert.equal(generateEndpointKind(draft, draft.draftId, "generated"), "regenerate");
  });

  it("keeps Publish (not Sync) for generated existing archive", () => {
    const draft = draftFixture("draft-2026-0001", "generated");
    assert.equal(usesSyncOnPublishStep(draft, draft.draftId, "generated"), false);
  });

  it("uses Sync for published existing archive", () => {
    const draft = draftFixture("edit-ar-2026-0101", "published");
    assert.equal(
      usesSyncOnPublishStep(draft, "edit-ar-2026-0101", "published"),
      true,
    );
    assert.equal(
      generateEndpointKind(draft, "edit-ar-2026-0101", "published"),
      "regenerate",
    );
  });

  it("uses archive status when draft status is stale for deploy mode", () => {
    const draft = draftFixture("draft-2026-0001", "published");
    assert.equal(
      usesSyncOnPublishStep(draft, draft.draftId, "hidden"),
      true,
    );
    assert.equal(
      usesSyncOnPublishStep(draft, draft.draftId, "generated"),
      false,
    );
  });

  it("detects archive on disk even when draft status is still draft", () => {
    const draft = draftFixture("draft-2026-0001", "draft");
    assert.equal(isExistingArchiveBundle(draft, draft.draftId, "generated"), true);
    assert.equal(generateEndpointKind(draft, draft.draftId, "generated"), "regenerate");
  });
});

describe("admin workflow state: archive list publish action", () => {
  it("shows Publish to GitHub only for generated records", () => {
    assert.equal(showPublishToGitHubAction("generated"), true);
    assert.equal(showPublishToGitHubAction("published"), false);
    assert.equal(showPublishToGitHubAction("hidden"), false);
    assert.equal(showPublishToGitHubAction("withdrawn"), false);
  });
});

describe("admin workflow state: draft/archive status display", () => {
  it("shows single draft line when statuses match", () => {
    assert.equal(
      formatWizardStatusHeader({
        draftId: "draft-2026-0001",
        draftStatus: "published",
        archiveStatus: "published",
      }),
      "draft-2026-0001 · draft published",
    );
  });

  it("shows both draft and archive when they differ", () => {
    assert.equal(
      formatWizardStatusHeader({
        draftId: "draft-2026-0001",
        draftStatus: "published",
        archiveStatus: "hidden",
      }),
      "draft-2026-0001 · draft published · archive hidden",
    );
  });

  it("blocks regenerate when archive is withdrawn even if draft is stale", () => {
    assert.equal(isRegenerateBlocked("published", "withdrawn"), true);
    assert.equal(isRegenerateBlocked("withdrawn", null), true);
    assert.equal(isRegenerateBlocked("published", "published"), false);
  });
});

describe("GET /api/admin/drafts/[draftId] archiveStatus enrichment", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-admin-workflow-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
  });

  after(async () => {
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

  async function loadDraftGet() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/drafts/[draftId]/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.GET as (
      request: Request,
      context: { params: Promise<{ draftId: string }> },
    ) => Promise<Response>;
  }

  it("returns archiveStatus hidden when draft status is stale published", async () => {
    const slug = "2026-01-01-admin-workflow-stale";
    const draft = await createAccessionDraft({
      slug,
      title: "Stale draft status",
      date: "2026-01-01",
    });
    await saveAccessionDraft({
      ...draft,
      status: "published",
    });
    await fs.mkdir(contentArchiveSourceDir(slug), { recursive: true });
    await fs.writeFile(path.join(contentArchiveSourceDir(slug), "master.jpg"), "bytes");
    await saveArchiveEntry(
      entryFixture(slug, {
        status: "hidden",
        hiddenAt: "2026-01-04T00:00:00.000Z",
        publishedAt: "2026-01-02T00:00:00.000Z",
      }),
    );

    const GET = await loadDraftGet();
    const res = await GET(
      new Request(`http://localhost/api/admin/drafts/${draft.draftId}`, {
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: draft.draftId }) },
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      draft: AccessionDraft;
      archiveStatus: string | null;
    };
    assert.equal(data.draft.status, "published");
    assert.equal(data.archiveStatus, "hidden");
    assert.notEqual(data.draft.status, data.archiveStatus);
    assert.equal((await loadArchiveEntry(slug))?.status, "hidden");
  });

  it("returns null archiveStatus when no archive exists for slug", async () => {
    const draft = draftFixture("draft-2026-0099", "draft");
    await saveAccessionDraft(draft);

    const GET = await loadDraftGet();
    const res = await GET(
      new Request("http://localhost/api/admin/drafts/draft-2026-0099", {
        headers: { Authorization: "Bearer test-secret" },
      }),
      { params: Promise.resolve({ draftId: "draft-2026-0099" }) },
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { archiveStatus: string | null };
    assert.equal(data.archiveStatus, null);
  });
});

describe("POST /api/admin/archive/publish for generated list action contract", () => {
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
  );
  let tmpRoot = "";
  let previousCwd = "";
  let githubHookCalls = 0;
  const previousEnabled = process.env.ADMIN_INGEST_ENABLED;
  const previousSecret = process.env.ADMIN_INGEST_SECRET;
  const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
  const previousOwner = process.env.GITHUB_ARCHIVE_OWNER;
  const previousRepo = process.env.GITHUB_ARCHIVE_REPO;

  before(async () => {
    previousCwd = process.cwd();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-admin-publish-list-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
    const { setArchiveGitHubPushHookForTests } = await import("../github/publish-entry.ts");
    setArchiveGitHubPushHookForTests(undefined);
    process.chdir(previousCwd);
    await fs.rm(tmpRoot, { recursive: true, force: true });
    for (const [key, value] of [
      ["ADMIN_INGEST_ENABLED", previousEnabled],
      ["ADMIN_INGEST_SECRET", previousSecret],
      ["GITHUB_ARCHIVE_TOKEN", previousToken],
      ["GITHUB_ARCHIVE_OWNER", previousOwner],
      ["GITHUB_ARCHIVE_REPO", previousRepo],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  async function seedGeneratedBundle(slug: string): Promise<void> {
    const publicDir = publicArchiveDir(slug);
    await fs.mkdir(publicDir, { recursive: true });
    const buffers = fakeBuffers("PUBLISH");
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
    await fs.mkdir(contentArchiveSourceDir(slug), { recursive: true });
    await fs.writeFile(path.join(contentArchiveSourceDir(slug), "master.jpg"), "bytes");
    await saveArchiveEntry(
      entryFixture(slug, { status: "generated", publishedAt: undefined }),
    );
  }

  async function loadPublishPost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/publish/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (request: Request) => Promise<Response>;
  }

  it("promotes generated archive to published on success", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    const { setArchiveGitHubPushHookForTests } = await import("../github/publish-entry.ts");
    githubHookCalls = 0;
    setArchiveGitHubPushHookForTests(async () => {
      githubHookCalls += 1;
      return { commitSha: "abc123def4567890abcdef1234567890abcdef12", paths: [] };
    });

    const slug = "2026-01-01-admin-list-publish";
    await seedGeneratedBundle(slug);

    const POST = await loadPublishPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/publish", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug }),
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(githubHookCalls, 1);
    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
    assert.ok(entry?.publishedAt);
  });

  it("returns error for hidden archive without promoting lifecycle", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    const { setArchiveGitHubPushHookForTests } = await import("../github/publish-entry.ts");
    githubHookCalls = 0;
    setArchiveGitHubPushHookForTests(async () => {
      githubHookCalls += 1;
      return { commitSha: "abc123def4567890abcdef1234567890abcdef12", paths: [] };
    });

    const slug = "2026-01-01-admin-list-publish-hidden";
    await seedGeneratedBundle(slug);
    await saveArchiveEntry(
      entryFixture(slug, {
        status: "hidden",
        hiddenAt: "2026-01-04T00:00:00.000Z",
        publishedAt: "2026-01-02T00:00:00.000Z",
      }),
    );

    const POST = await loadPublishPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/publish", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug }),
      }),
    );
    assert.equal(res.status, 409);
    assert.equal(githubHookCalls, 0);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /hidden and cannot be published/);
  });
});
