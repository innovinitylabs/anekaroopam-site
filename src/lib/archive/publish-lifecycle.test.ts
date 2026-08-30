import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, afterEach, before, describe, it } from "node:test";
import type { ArchiveImageBuffers } from "./image-pipeline.ts";
import { loadArchiveEntry } from "./load-entry.ts";
import {
  contentArchiveDir,
  contentArchiveSourceDir,
  publicArchiveDir,
} from "./paths.ts";
import { canonicalPublicDerivativeFilenames } from "./public-derivative-export.ts";
import {
  ARCHIVE_VERSION,
  ArchiveEntrySchema,
  type ArchiveEntry,
} from "./schema.ts";
import { saveArchiveEntry } from "./draft-store.ts";
import { assertArchivePublishable } from "./visibility.ts";
import { setArchiveGitHubPushHookForTests } from "../github/publish-entry.ts";

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
      title: "Publish Lifecycle Fixture",
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

function sampleEntry(overrides: Record<string, unknown> = {}): ArchiveEntry {
  return entryFixture("2026-01-01-sample", overrides);
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

async function seedCompleteBundle(
  slug: string,
  overrides: Record<string, unknown> = {},
): Promise<ArchiveEntry> {
  await writeCanonicalPublic(slug, "PUBLISH");
  await writeArchiveSource(slug, Buffer.from(`archive-source-${slug}`));
  return saveArchiveEntry(entryFixture(slug, overrides));
}

describe("assertArchivePublishable", () => {
  it("allows generated, published, and minted archives", () => {
    for (const status of ["generated", "published", "minted"] as const) {
      assert.doesNotThrow(() =>
        assertArchivePublishable(sampleEntry({ status })),
      );
    }
  });

  it("rejects hidden and withdrawn archives", () => {
    assert.throws(
      () => assertArchivePublishable(sampleEntry({ status: "hidden" })),
      /hidden and cannot be published/,
    );
    assert.throws(
      () =>
        assertArchivePublishable(
          sampleEntry({ status: "withdrawn", withdrawnAt: "2026-01-05T00:00:00.000Z" }),
        ),
      /withdrawn and cannot be published/,
    );
  });
});

describe("POST /api/admin/archive/publish lifecycle", () => {
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
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "anek-publish-lifecycle-"));
    await fs.mkdir(path.join(tmpRoot, "content", "archive"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "content", "drafts"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "public", "archive"), { recursive: true });
    process.chdir(tmpRoot);
  });

  after(async () => {
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

  afterEach(() => {
    setArchiveGitHubPushHookForTests(undefined);
    githubHookCalls = 0;
  });

  function enableAdminAndGitHub(): void {
    process.env.ADMIN_INGEST_ENABLED = "true";
    process.env.ADMIN_INGEST_SECRET = "test-secret";
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
  }

  function installGitHubHook(): void {
    githubHookCalls = 0;
    setArchiveGitHubPushHookForTests(async (slug, commitMessage) => {
      githubHookCalls += 1;
      assert.match(commitMessage, /^archive: accession /);
      return {
        commitSha: "abc123def4567890abcdef1234567890abcdef12",
        paths: [`content/archive/${slug}/metadata.json`],
      };
    });
  }

  async function loadPublishPost() {
    const href = pathToFileURL(
      path.join(repoRoot, "src/app/api/admin/archive/publish/route.ts"),
    ).href;
    const mod = await import(href);
    return mod.POST as (request: Request) => Promise<Response>;
  }

  async function postPublish(slug: string, draftId?: string): Promise<Response> {
    const POST = await loadPublishPost();
    return POST(
      new Request("http://localhost/api/admin/archive/publish", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug, draftId }),
      }),
    );
  }

  it("generated archive publishes successfully", async () => {
    enableAdminAndGitHub();
    installGitHubHook();
    const slug = "2026-01-01-publish-generated";
    await seedCompleteBundle(slug, { status: "generated", publishedAt: undefined });

    const res = await postPublish(slug);
    assert.equal(res.status, 200);
    assert.equal(githubHookCalls, 1);

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
    assert.ok(entry?.publishedAt);
  });

  it("hidden archive publish returns 409 before GitHub hook", async () => {
    enableAdminAndGitHub();
    installGitHubHook();
    const slug = "2026-01-01-publish-hidden";
    const hiddenAt = "2026-01-04T00:00:00.000Z";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    await seedCompleteBundle(slug, { status: "hidden", hiddenAt, publishedAt });

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );

    const res = await postPublish(slug);
    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /hidden and cannot be published/);
    assert.equal(githubHookCalls, 0);

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "hidden");
  });

  it("withdrawn archive publish returns 409 before GitHub hook", async () => {
    enableAdminAndGitHub();
    installGitHubHook();
    const slug = "2026-01-01-publish-withdrawn";
    const withdrawnAt = "2026-01-05T00:00:00.000Z";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    await seedCompleteBundle(slug, { status: "withdrawn", withdrawnAt, publishedAt });

    const metadataBefore = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );

    const res = await postPublish(slug);
    assert.equal(res.status, 409);
    const data = (await res.json()) as { error?: string };
    assert.match(data.error ?? "", /withdrawn and cannot be published/);
    assert.equal(githubHookCalls, 0);

    const metadataAfter = await fs.readFile(
      path.join(contentArchiveDir(slug), "metadata.json"),
      "utf8",
    );
    assert.equal(metadataAfter, metadataBefore);
    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "withdrawn");
  });

  it("GitHub failure does not mark archive published", async () => {
    enableAdminAndGitHub();
    const slug = "2026-01-01-publish-gh-fail";
    await seedCompleteBundle(slug, { status: "generated", publishedAt: undefined });
    setArchiveGitHubPushHookForTests(async () => {
      githubHookCalls += 1;
      throw new Error("octokit push failed");
    });

    const res = await postPublish(slug);
    assert.equal(res.status, 500);
    assert.equal(githubHookCalls, 1);

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "generated");
    assert.equal(entry?.publishedAt, undefined);
  });

  it("published archive re-publish still works", async () => {
    enableAdminAndGitHub();
    installGitHubHook();
    const slug = "2026-01-01-publish-republish";
    const publishedAt = "2026-01-02T00:00:00.000Z";
    await seedCompleteBundle(slug, { status: "published", publishedAt });

    const res = await postPublish(slug);
    assert.equal(res.status, 200);
    assert.equal(githubHookCalls, 1);

    const entry = await loadArchiveEntry(slug);
    assert.equal(entry?.status, "published");
    assert.equal(entry?.publishedAt, publishedAt);
  });

  it("publish route rejects unauthenticated requests", async () => {
    delete process.env.ADMIN_INGEST_ENABLED;
    delete process.env.ADMIN_INGEST_SECRET;
    process.env.GITHUB_ARCHIVE_TOKEN = "gh-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";

    const POST = await loadPublishPost();
    const res = await POST(
      new Request("http://localhost/api/admin/archive/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "2026-01-01-publish-auth" }),
      }),
    );

    assert.equal(res.status, 403);
  });
});
