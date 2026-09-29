import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveSearchToQueryString,
  matchesArchiveSearch,
  parseArchiveSearchParams,
} from "./archive-search";
import { filterArtworks, type ArchiveFilter } from "@/lib/content/artworks";
import type { PerceptionArtwork } from "@/lib/perception/types";

const sample: PerceptionArtwork[] = [
  {
    id: "2026-01-01-alpha-work",
    metadata: {
      title: "Alpha Work",
      year: 2026,
      process: "Valiroopam",
      accessionId: "AR-2026-0001",
    },
    imageSrc: "",
    states: [{ id: "s1", name: "awake", angle: 0 }],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  },
  {
    id: "2025-06-01-beta",
    metadata: {
      title: "Beta Piece",
      year: 2025,
      process: "Other",
      accessionId: "AR-2025-0002",
    },
    imageSrc: "",
    states: [],
    background: "paper",
    initialAngle: 0,
    snapToState: true,
    showMetadataOverlay: true,
  },
];

test("parseArchiveSearchParams trims q and parses year", () => {
  const parsed = parseArchiveSearchParams({
    q: "  devil  ",
    year: "2026",
    process: "Valiroopam",
    sort: "title_asc",
  });
  assert.equal(parsed.q, "devil");
  assert.equal(parsed.year, 2026);
  assert.equal(parsed.process, "Valiroopam");
  assert.equal(parsed.sort, "title_asc");
});

test("parseArchiveSearchParams ignores invalid year and sort", () => {
  const parsed = parseArchiveSearchParams({
    year: "nope",
    sort: "bogus",
  });
  assert.equal(parsed.year, undefined);
  assert.equal(parsed.sort, "updated_desc");
});

test("archiveSearchToQueryString omits defaults", () => {
  assert.equal(archiveSearchToQueryString({}), "");
  assert.equal(
    archiveSearchToQueryString({ q: "x", year: 2026 }),
    "q=x&year=2026",
  );
});

test("matchesArchiveSearch title accession slug and filters AND", () => {
  assert.equal(
    matchesArchiveSearch(sample[0], { q: "ALPHA" }),
    true,
  );
  assert.equal(
    matchesArchiveSearch(sample[0], { q: "0001" }),
    true,
  );
  assert.equal(
    matchesArchiveSearch(sample[0], { q: "alpha-work" }),
    true,
  );
  assert.equal(
    matchesArchiveSearch(sample[0], { q: "alpha", year: 2025 }),
    false,
  );
  assert.equal(
    matchesArchiveSearch(sample[0], { year: 2026, process: "valiroopam" }),
    true,
  );
  assert.equal(matchesArchiveSearch(sample[0], { q: "   " }), true);
});

test("filterArtworks q does not AND-gate through state when states empty", () => {
  const filters: ArchiveFilter = { q: "Beta" };
  const result = filterArtworks(filters, sample);
  assert.equal(result.length, 1);
  assert.equal(result[0].metadata.title, "Beta Piece");
});

test("filterArtworks combined filters and clear", () => {
  assert.equal(
    filterArtworks({ year: 2026, process: "Valiroopam" }, sample).length,
    1,
  );
  assert.equal(filterArtworks({}, sample).length, 2);
});
