import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getRepoRoot,
  repoRelativePath,
  runWithRepoRoot,
} from "./paths.ts";
import { publicArchiveStagingRoot } from "./public-derivative-export.ts";

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

describe("runWithRepoRoot + public staging", () => {
  it("publicArchiveStagingRoot follows AsyncLocalStorage repo root, not process.cwd", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "anek-repo-root-"));
    try {
      const outside = publicArchiveStagingRoot();
      assert.equal(
        outside,
        path.join(process.cwd(), "public", "archive", ".staging"),
      );

      await runWithRepoRoot(tmp, async () => {
        assert.equal(getRepoRoot(), tmp);
        assert.equal(
          publicArchiveStagingRoot(),
          path.join(tmp, "public", "archive", ".staging"),
        );
      });

      assert.equal(getRepoRoot(), process.cwd());
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("writePublicDerivativesToStaging writes under the active repo root", async () => {
    const { writePublicDerivativesToStaging } = await import(
      "./public-derivative-export.ts"
    );
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "anek-stage-root-"));
    try {
      await runWithRepoRoot(tmp, async () => {
        const { stagingDir, written } = await writePublicDerivativesToStaging(
          "tmp-slug",
          {
            artwork: Buffer.from("a"),
            previewAvif: Buffer.from("b"),
            previewWebp: Buffer.from("c"),
            socialJpg: Buffer.from("d"),
            thumbJpg: Buffer.from("e"),
          },
        );
        assert.ok(stagingDir.startsWith(path.join(tmp, "public", "archive", ".staging")));
        assert.equal(written.length, 5);
        for (const file of written) {
          assert.ok(file.path.startsWith(tmp + path.sep) || file.path === tmp);
          assert.ok(!file.path.startsWith(path.join(process.cwd(), "public")));
        }
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
