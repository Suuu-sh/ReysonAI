-- Precomputed balanced flop base, one canonical suit-isomorphism class per JSON.
-- Ordered text parts let the route concatenate without parsing or computing.
-- Publishing keeps every escaped INSERT statement below 90KB.
CREATE TABLE IF NOT EXISTS postflop_flop_base (
  spot_id TEXT NOT NULL,
  flop_key TEXT NOT NULL,
  part INTEGER NOT NULL CHECK (part >= 0),
  parts INTEGER NOT NULL CHECK (parts > 0 AND part < parts),
  content_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (spot_id, flop_key, part)
);
