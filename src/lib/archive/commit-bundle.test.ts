import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  assertAllowedCommitBundlePaths,
  isAllowedCommitBundlePath,
} from "./commit-bundle-paths.ts";
import {
  clearGitReadCache,
  setGitReadHookForTests,
} from "../github/git-read.ts";
import { setGitCommitHookForTests } from "../github/git-commit.ts";
import {
  ensureTestAdminSessionSecret,
  mintTestAdminBearer,
} from "./admin-test-auth.ts";

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "..",
);

describe("commit-bundle path allowlist", () => {
  it("allows archive and public prefixes for the slug", () => {
    assert.equal(
      isAllowedCommitBundlePath("content/archive/foo/metadata.json", {
        slug: "foo",
      }),
      true,
    );
    assert.equal(
      isAllowedCommitBundlePath("public/archive/foo/artwork.avif", {
        slug: "foo",
      }),
      true,
    );
  });

  it("allows draft prefix only when draftId matches", () => {
    assert.equal(
      isAllowedCommitBundlePath("content/drafts/draft-1/draft.json", {
        slug: "foo",
        draftId: "draft-1",
      }),
      true,
    );
    assert.equal(
      isAllowedCommitBundlePath("content/drafts/other/draft.json", {
        slug: "foo",
        draftId: "draft-1",
      }),
      false,
    );
  });

  it("rejects traversal and unexpected prefixes", () => {
    assert.equal(
      isAllowedCommitBundlePath("content/archive/foo/../../etc/passwd", {
        slug: "foo",
      }),
      false,
    );
    assert.equal(
      isAllowedCommitBundlePath("content/archive/bar/metadata.json", {
        slug: "foo",
      }),
      false,
    );
    assert.equal(
      isAllowedCommitBundlePath("README.md", { slug: "foo" }),
      false,
    );
    assert.throws(
      () =>
        assertAllowedCommitBundlePaths(["content/secret.json"], {
          slug: "foo",
        }),
      /Illegal commit-bundle path/,
    );
  });
});

describe("POST /api/admin/archive/commit-bundle", () => {
  const previous: Record<string, string | undefined> = {};
  const keys = [
    "ADMIN_INGEST_ENABLED",
    "ADMIN_SESSION_SECRET",
    "VERCEL",
    "GITHUB_ARCHIVE_DURABLE",
    "GITHUB_ARCHIVE_TOKEN",
    "GITHUB_ARCHIVE_OWNER",
    "GITHUB_ARCHIVE_REPO",
    "GITHUB_ARCHIVE_BRANCH",
  ] as const;

  let store: Map<string, Buffer>;

  before(() => {
    for (const key of keys) previous[key] = process.env[key];
  });

  after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    clearGitReadCache();
  });

  afterEach(() => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    clearGitReadCache();
  });

  function enableDurableAuth() {
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    process.env.GITHUB_ARCHIVE_DURABLE = "1";
    process.env.GITHUB_ARCHIVE_TOKEN = "test-token";
    process.env.GITHUB_ARCHIVE_OWNER = "owner";
    process.env.GITHUB_ARCHIVE_REPO = "repo";
    process.env.GITHUB_ARCHIVE_BRANCH = "main";
  }

  function installMemoryGit() {
    store = new Map();
    setGitCommitHookForTests(async (input) => {
      for (const file of input.upserts ?? []) {
        store.set(
          file.path,
          typeof file.content === "string"
            ? Buffer.from(file.content)
            : file.content,
        );
      }
      return {
        commitSha: `sha-${store.size}`,
        paths: input.upserts?.map((f) => f.path) ?? [],
      };
    });
    setGitReadHookForTests({
      listPaths: async () => [...store.keys()],
      readFile: async (filePath) => store.get(filePath) ?? null,
    });
  }

  async function loadRoute() {
    const mod = await import(
      pathToFileURL(
        path.join(
          repoRoot,
          "src/app/api/admin/archive/commit-bundle/route.ts",
        ),
      ).href
    );
    return mod as { POST: (request: Request) => Promise<Response> };
  }

  it("rejects unauthenticated requests", async () => {
    enableDurableAuth();
    installMemoryGit();
    const { POST } = await loadRoute();
    const form = new FormData();
    form.set("slug", "demo");
    form.set(
      "path:content/archive/demo/metadata.json",
      JSON.stringify({ ok: true }),
    );
    const res = await POST(
      new Request("http://localhost/api/admin/archive/commit-bundle", {
        method: "POST",
        body: form,
      }),
    );
    assert.equal(res.status, 401);
  });

  it("rejects illegal paths", async () => {
    enableDurableAuth();
    installMemoryGit();
    const { POST } = await loadRoute();
    const form = new FormData();
    form.set("slug", "demo");
    form.set("path:content/evil/secret.json", "nope");
    const res = await POST(
      new Request("http://localhost/api/admin/archive/commit-bundle", {
        method: "POST",
        headers: { Authorization: `Bearer ${mintTestAdminBearer()}` },
        body: form,
      }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? "", /Illegal/);
  });

  it("commits allowlisted files into the memory git store", async () => {
    enableDurableAuth();
    installMemoryGit();
    const { POST } = await loadRoute();
    const form = new FormData();
    form.set("slug", "demo-slug");
    form.set("draftId", "draft-9");
    form.set("message", "archive: browser commit demo-slug");
    form.set(
      "path:content/archive/demo-slug/metadata.json",
      JSON.stringify({ slug: "demo-slug" }),
    );
    form.append(
      "file",
      new File([Uint8Array.from([1, 2, 3])], "public/archive/demo-slug/artwork.avif", {
        type: "image/avif",
      }),
    );
    form.set(
      "path:content/drafts/draft-9/draft.json",
      JSON.stringify({ draftId: "draft-9" }),
    );

    const res = await POST(
      new Request("http://localhost/api/admin/archive/commit-bundle", {
        method: "POST",
        headers: { Authorization: `Bearer ${mintTestAdminBearer()}` },
        body: form,
      }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      commitSha?: string;
      paths?: string[];
    };
    assert.ok(body.commitSha);
    assert.ok(store.has("content/archive/demo-slug/metadata.json"));
    assert.ok(store.has("public/archive/demo-slug/artwork.avif"));
    assert.ok(store.has("content/drafts/draft-9/draft.json"));
    assert.deepEqual(store.get("public/archive/demo-slug/artwork.avif"), Buffer.from([1, 2, 3]));
  });

  it("returns 503 when durable GitHub storage is unavailable", async () => {
    process.env.ADMIN_INGEST_ENABLED = "true";
    ensureTestAdminSessionSecret();
    delete process.env.VERCEL;
    delete process.env.GITHUB_ARCHIVE_DURABLE;
    delete process.env.GITHUB_ARCHIVE_TOKEN;
    const { POST } = await loadRoute();
    const form = new FormData();
    form.set("slug", "demo");
    form.set("path:content/archive/demo/metadata.json", "{}");
    const res = await POST(
      new Request("http://localhost/api/admin/archive/commit-bundle", {
        method: "POST",
        headers: { Authorization: `Bearer ${mintTestAdminBearer()}` },
        body: form,
      }),
    );
    assert.equal(res.status, 503);
  });
});
