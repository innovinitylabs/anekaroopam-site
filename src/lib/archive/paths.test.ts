import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { repoRelativePath } from "./paths.ts";

describe("repoRelativePath", () => {
  it("stores export inventory paths relative to the repo root, not machine-absolute", () => {
    const absolute = path.join(
      process.cwd(),
      "content",
      "archive",
      "example-slug",
      "exports",
      "mint-package",
      "metadata.json",
    );
    assert.equal(
      repoRelativePath(absolute),
      "content/archive/example-slug/exports/mint-package/metadata.json",
    );
    assert.equal(repoRelativePath(absolute).startsWith("/"), false);
  });

  it("normalizes already-relative paths to posix separators", () => {
    assert.equal(
      repoRelativePath("content/archive/example-slug/metadata.json"),
      "content/archive/example-slug/metadata.json",
    );
  });
});
