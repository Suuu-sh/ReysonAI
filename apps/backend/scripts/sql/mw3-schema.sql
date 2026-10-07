-- Isolated, immutable three-player transport preparation. NOT a registered
-- migration or deployment. No existing HU/preflop tables or data are changed.
-- Register only after independent review and the approved-artifact delivery gate.
CREATE TABLE IF NOT EXISTS mw3_policy_deliveries (
  delivery_hash TEXT PRIMARY KEY CHECK (length(delivery_hash) = 64),
  spot_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('flop', 'later')),
  header_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mw3_policy_parts (
  delivery_hash TEXT NOT NULL,
  part INTEGER NOT NULL CHECK (part >= 0),
  body TEXT NOT NULL,
  PRIMARY KEY (delivery_hash, part),
  FOREIGN KEY (delivery_hash) REFERENCES mw3_policy_deliveries(delivery_hash)
);
-- No mutable publication flag exists in D1. The eventual runtime may serve only
-- delivery hashes explicitly present in its independently approved build config.
