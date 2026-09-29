-- Heads-up postflop AI policies (AI estimates, not GTO) served by solveaai-edge-api.
-- Rows are replaced wholesale by apps/preflop-ui/scripts/postflop-ai/publish-d1.mjs; the
-- dataset_versions row records which local artifacts a publish came from.
CREATE TABLE IF NOT EXISTS postflop_spots (
  spot_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  tree TEXT NOT NULL,
  ip TEXT NOT NULL,
  oop TEXT NOT NULL,
  pot_bb REAL NOT NULL,
  stack_bb REAL NOT NULL,
  spot_json TEXT NOT NULL
);
-- stage: 'flop' ({slug}-policy.json) or 'later' ({slug}-later-policy.json); report = simulation report.
CREATE TABLE IF NOT EXISTS postflop_policies (
  spot_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('flop', 'later')),
  policy_hash TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  PRIMARY KEY (spot_id, stage)
);
-- One row per spot × representative board × decision history (flop) or runout key (later).
CREATE TABLE IF NOT EXISTS postflop_hand_ev (
  spot_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('flop', 'later')),
  board_key TEXT NOT NULL,
  history TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (spot_id, stage, board_key, history)
);
-- Authored reason text for turn/river (and any future stage), keyed by spot.
CREATE TABLE IF NOT EXISTS postflop_reasons (
  spot_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (spot_id, stage)
);
CREATE TABLE IF NOT EXISTS dataset_versions (
  name TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  published_at TEXT NOT NULL,
  detail_json TEXT NOT NULL
);
