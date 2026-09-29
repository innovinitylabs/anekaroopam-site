import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowedMetadataCommitPaths,
  isAllowedMetadataCommitPath,
} from "./metadata-commit-paths";

describe("metadata-commit-paths", () => {
  it("allows text archive and draft paths only", () => {
    assert.equal(
      isAllowedMetadataCommitPath(
        "content/archive/my-slug/metadata.json",
        { slug: "my-slug" },
      ),
      true,
    );
    assert.equal(
      isAllowedMetadataCommitPath(
        "content/archive/my-slug/manifest.json",
        { slug: "my-slug" },
      ),
      true,
    );
    assert.equal(
      isAllowedMetadataCommitPath(
        "public/archive/my-slug/artwork.avif",
        { slug: "my-slug" },
      ),
      false,
    );
    assert.equal(
      isAllowedMetadataCommitPath(
        "content/archive/my-slug/source/original.jpg",
        { slug: "my-slug" },
      ),
      false,
    );
  });

  it("rejects path traversal and foreign slugs", () => {
    assert.throws(() =>
      assertAllowedMetadataCommitPaths(
        ["content/archive/other/metadata.json"],
        { slug: "my-slug" },
      ),
    );
    assert.throws(() =>
      assertAllowedMetadataCommitPaths(
        ["content/archive/my-slug/../evil.json"],
        { slug: "my-slug" },
      ),
    );
  });
});
