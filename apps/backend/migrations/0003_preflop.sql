-- Preflop datasets (AI-estimated ranges, responses and reasons; not GTO). The JSON files in
-- apps/frontend/src/estimated stay the source of truth; this is the delivery copy written by
-- apps/frontend/scripts/publish-d1.mjs. A dataset is stored as ordered text parts because D1
-- rejects statements over 100 KB; the worker concatenates them without parsing.
CREATE TABLE IF NOT EXISTS preflop_datasets (
  name TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  parts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS preflop_dataset_parts (
  name TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (name, part)
);
