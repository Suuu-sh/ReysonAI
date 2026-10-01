-- Flop base stored as the Brotli bytes of each canonical flop JSON (BLOB parts), ~5x smaller
-- than the TEXT parts of 0004 so 44 spots fit the D1 size limit. The worker concatenates the
-- parts and returns them with content-encoding: br, without decompressing.
-- Publishing keeps every hex-literal INSERT statement below 90KB.
DROP TABLE IF EXISTS postflop_flop_base;
CREATE TABLE IF NOT EXISTS postflop_flop_base_br (
  spot_id TEXT NOT NULL,
  flop_key TEXT NOT NULL,
  part INTEGER NOT NULL CHECK (part >= 0),
  parts INTEGER NOT NULL CHECK (parts > 0 AND part < parts),
  content_hash TEXT NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY (spot_id, flop_key, part)
);
