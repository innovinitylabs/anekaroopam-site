/**
 * Regression notes for Phase 9 lifecycle (search, admin, validate, SEO).
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { archiveArtworks, filterArtworks } from "@/lib/content/artworks";
import { DURABLE_WIZARD_STEPS, WIZARD_DONE_HREF } from "./wizard-steps";
import { matchesArchiveSearch } from "./archive-search";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("legacy devil-may-cry archive trees are removed from the repository", () => {
  for (const rel of [
    "content/archive/2026-05-19-02-devil-may-cry-or-block-you",
    "content/archive/2026-05-21-02-devil-may-cry-or-block-you",
    "public/archive/2026-05-19-02-devil-may-cry-or-block-you",
    "public/archive/2026-05-21-02-devil-may-cry-or-block-you",
  ]) {
    assert.equal(existsSync(path.join(repoRoot, rel)), false, rel);
  }
});

test("curated original images remain in public/", () => {
  assert.equal(archiveArtworks.length, 3);
  for (const artwork of archiveArtworks) {
    const rel = decodeURIComponent(artwork.imageSrc);
    assert.equal(existsSync(path.join(repoRoot, "public", rel)), true, rel);
  }
});

test("durable wizard includes SEO before Review and Done goes to /admin", () => {
  assert.ok(DURABLE_WIZARD_STEPS.includes("SEO"));
  const seoIdx = DURABLE_WIZARD_STEPS.indexOf("SEO");
  const reviewIdx = DURABLE_WIZARD_STEPS.indexOf("Review");
  assert.ok(seoIdx >= 0 && seoIdx < reviewIdx);
  assert.equal(WIZARD_DONE_HREF, "/admin");
});

test("search no longer AND-gates title query through empty states", () => {
  const works = [
    {
      id: "slug-a",
      metadata: { title: "Unique Title", year: 2026, process: "P" },
      imageSrc: "",
      states: [] as { id: string; name: string; angle: number }[],
      background: "paper" as const,
    },
  ];
  const filtered = filterArtworks({ q: "Unique" }, works);
  assert.equal(filtered.length, 1);
  assert.equal(matchesArchiveSearch(works[0], { q: "slug-a" }), true);
});
