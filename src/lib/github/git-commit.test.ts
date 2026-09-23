import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  commitFiles,
  GitHubCommitConflictError,
  setGitCommitHookForTests,
} from "./git-commit.ts";
import {
  clearGitReadCache,
  listRepoPaths,
  readRepoFile,
  setGitReadHookForTests,
} from "./git-read.ts";

describe("commitFiles", () => {
  afterEach(() => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    clearGitReadCache();
  });

  it("upserts multiple paths in one commit", async () => {
    let captured:
      | {
          message: string;
          upserts?: { path: string; content: Buffer | string }[];
          deletes?: string[];
        }
      | undefined;
    setGitCommitHookForTests(async (input) => {
      captured = input;
      return { commitSha: "sha-upsert", paths: input.upserts?.map((f) => f.path) ?? [] };
    });

    const result = await commitFiles({
      message: "test: multi upsert",
      upserts: [
        { path: "content/drafts/a/draft.json", content: '{"a":1}\n' },
        { path: "content/drafts/a/states.json", content: '{"b":2}\n' },
        { path: "content/drafts/a/source/x.bin", content: Buffer.from("bin") },
      ],
    });

    assert.equal(result.commitSha, "sha-upsert");
    assert.equal(captured?.upserts?.length, 3);
    assert.deepEqual(
      captured?.upserts?.map((file) => file.path),
      [
        "content/drafts/a/draft.json",
        "content/drafts/a/states.json",
        "content/drafts/a/source/x.bin",
      ],
    );
  });

  it("delete entry uses sha null via deletes list", async () => {
    let capturedDeletes: string[] | undefined;
    setGitCommitHookForTests(async (input) => {
      capturedDeletes = input.deletes;
      return { commitSha: "sha-del", paths: input.deletes ?? [] };
    });

    await commitFiles({
      message: "test: delete",
      deletes: ["content/drafts/a/draft.json", "content/drafts/a/source/x.bin"],
    });

    assert.deepEqual(capturedDeletes, [
      "content/drafts/a/draft.json",
      "content/drafts/a/source/x.bin",
    ]);
  });

  it("surfaces conflict errors from the hook", async () => {
    setGitCommitHookForTests(async () => {
      throw new GitHubCommitConflictError("non-fast-forward");
    });
    await assert.rejects(
      () => commitFiles({ message: "x", upserts: [{ path: "a.json", content: "{}" }] }),
      (error: unknown) =>
        error instanceof GitHubCommitConflictError &&
        error.message.includes("non-fast-forward"),
    );
  });
});

describe("git-read with hooks", () => {
  afterEach(() => {
    setGitCommitHookForTests(undefined);
    setGitReadHookForTests(undefined);
    clearGitReadCache();
  });

  it("lists and reads committed paths from an in-memory map", async () => {
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
        commitSha: "sha-mem",
        paths: [...(input.upserts?.map((f) => f.path) ?? []), ...(input.deletes ?? [])],
      };
    });
    setGitReadHookForTests({
      listPaths: async () => [...store.keys()],
      readFile: async (filePath) => store.get(filePath) ?? null,
    });

    await commitFiles({
      message: "seed",
      upserts: [
        { path: "content/drafts/d1/draft.json", content: '{"ok":true}\n' },
        { path: "content/drafts/d1/source/a.jpg", content: Buffer.from("jpg") },
      ],
    });

    const paths = await listRepoPaths("content/drafts");
    assert.ok(paths.includes("content/drafts/d1/draft.json"));
    const raw = await readRepoFile("content/drafts/d1/draft.json");
    assert.equal(raw?.toString("utf8"), '{"ok":true}\n');
  });
});
