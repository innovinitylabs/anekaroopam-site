-- D1 init: accession counters, artworks projection, revisions, assets junction, events
-- Authority: revision JSON is SoT for metadata; artworks holds listing projections only.

PRAGMA foreign_keys = ON;

CREATE TABLE accession_counters (
  year INTEGER PRIMARY KEY NOT NULL,
  next_seq INTEGER NOT NULL
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY NOT NULL,
  artwork_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE artworks (
  id TEXT PRIMARY KEY NOT NULL,
  accession_id TEXT NOT NULL UNIQUE,
  draft_id TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  working_revision INTEGER NOT NULL,
  published_revision INTEGER,
  title TEXT NOT NULL,
  year INTEGER,
  process TEXT,
  thumb_object_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  hidden_at TEXT,
  withdrawn_at TEXT,
  created_by TEXT
);

CREATE INDEX artworks_status_updated_idx ON artworks (status, updated_at DESC);
CREATE INDEX artworks_year_idx ON artworks (year);

CREATE TABLE artwork_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  perception_json TEXT NOT NULL,
  export_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  created_by TEXT,
  note TEXT,
  UNIQUE (artwork_id, revision)
);

CREATE INDEX artwork_revisions_artwork_idx ON artwork_revisions (artwork_id, revision);

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE revision_assets (
  id TEXT PRIMARY KEY NOT NULL,
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  role TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  source_revision INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (artwork_id, revision, role)
);

CREATE INDEX revision_assets_revision_idx ON revision_assets (artwork_id, revision);

CREATE TABLE accession_events (
  id TEXT PRIMARY KEY NOT NULL,
  artwork_id TEXT NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX accession_events_artwork_idx ON accession_events (artwork_id, created_at);
