/**
 * Regression notes for Phase 9 lifecycle (search, admin, validate, SEO).
 * Legacy GitHub content under content/archive/2026-05-*-devil-may-cry-* is
 * intentionally retained until explicit cleanup approval (plan phase 14).
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { filterArtworks } from "@/lib/content/artworks";
import { DURABLE_WIZARD_STEPS, WIZARD_DONE_HREF } from "./wizard-steps";
import { matchesArchiveSearch } from "./archive-search";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

test("legacy devil-may-cry archive trees are still present (cleanup gated)", () => {
  const a = path.join(
    repoRoot,
    "content/archive/2026-05-19-02-devil-may-cry-or-block-you",
  );
  const b = path.join(
    repoRoot,
    "content/archive/2026-05-21-02-devil-may-cry-or-block-you",
  );
  assert.equal(existsSync(a), true);
  assert.equal(existsSync(b), true);
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
