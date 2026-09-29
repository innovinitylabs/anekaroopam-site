import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createAccessionDraftFromSourceOnGitHub,
  listAccessionDraftsFromGitHub,
  loadAccessionDraftFromGitHub,
  requireGitHubArchive,
} from "./draft-github-store.ts";
import { GitHubNotConfiguredError } from "../github/errors.ts";
import {
  clearGitReadCache,
  setGitReadHookForTests,
} from "../github/git-read.ts";
import {
  isGitCommitHookActiveForTests,
  setGitCommitHookForTests,
} from "../github/git-commit.ts";

function installMemoryGit(): Map<string, Buffer> {
  const store = new Map<string, Buffer>();
  setGitCommitHookForTests(async (input) => {
    for (const file of input.upserts ?? []) {
      store.set(
        file.path,
        typeof file.content === "string"
          ? Buffer.from(file.content)
          : file.content,
      );
    }
    for (const filePath of input.deletes ?? []) {
      store.delete(filePath);
    }
    return {
      commitSha: `sha-${store.size}`,
      paths: [
        ...(input.upserts?.map((file) => file.path) ?? []),
        ...(input.deletes ?? []),
      ],
    };
  });
  setGitReadHookForTests({
    listPaths: async () => [...store.keys()],
    readFile: async (filePath) => store.get(filePath) ?? null,
  });
  return store;
}

describe("draft-github-store", () => {
  afterEach(() => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    clearGitReadCache();
  });

  it("from-source creates draft.json, states.json, and source via commit helper", async () => {
    const store = installMemoryGit();
    const file = new File([Buffer.from("source-bytes")], "photo.jpg", {
      type: "image/jpeg",
    });

    const draft = await createAccessionDraftFromSourceOnGitHub(file);
    assert.ok(draft.draftId.startsWith("draft-"));
    assert.equal(draft.source.originalFilename, "photo.jpg");
    assert.ok(draft.source.storedFilename);

    assert.ok(store.has(`content/drafts/${draft.draftId}/draft.json`));
    assert.ok(store.has(`content/drafts/${draft.draftId}/states.json`));
    assert.ok(
      store.has(
        `content/drafts/${draft.draftId}/source/${draft.source.storedFilename}`,
      ),
    );

    const listed = await listAccessionDraftsFromGitHub();
    assert.equal(listed.some((item) => item.draftId === draft.draftId), true);

    const loaded = await loadAccessionDraftFromGitHub(draft.draftId);
    assert.equal(loaded?.draftId, draft.draftId);
    assert.equal(loaded?.source.byteSize, "source-bytes".length);
  });

  it("requireGitHubArchive fails closed without config or commit hook", () => {
    assert.equal(isGitCommitHookActiveForTests(), false);
    const previousToken = process.env.GITHUB_ARCHIVE_TOKEN;
    const previousOwner = process.env.GITHUB_ARCHIVE_OWNER;
    const previousRepo = process.env.GITHUB_ARCHIVE_REPO;
    delete process.env.GITHUB_ARCHIVE_TOKEN;
    delete process.env.GITHUB_ARCHIVE_OWNER;
    delete process.env.GITHUB_ARCHIVE_REPO;
    try {
      assert.throws(() => requireGitHubArchive(), GitHubNotConfiguredError);
    } finally {
      if (previousToken === undefined) delete process.env.GITHUB_ARCHIVE_TOKEN;
      else process.env.GITHUB_ARCHIVE_TOKEN = previousToken;
      if (previousOwner === undefined) delete process.env.GITHUB_ARCHIVE_OWNER;
      else process.env.GITHUB_ARCHIVE_OWNER = previousOwner;
      if (previousRepo === undefined) delete process.env.GITHUB_ARCHIVE_REPO;
      else process.env.GITHUB_ARCHIVE_REPO = previousRepo;
    }
  });
});
