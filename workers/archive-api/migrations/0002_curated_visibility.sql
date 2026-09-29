-- Visibility for curated repository works (src/lib/content/artworks.ts).
-- Independent of the artworks lifecycle; a missing row means visible.
CREATE TABLE curated_visibility (
  slug TEXT PRIMARY KEY NOT NULL,
  visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
