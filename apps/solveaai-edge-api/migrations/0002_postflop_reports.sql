-- Simulation report per spot; the edge worker checks it against the flop policy like the local view.
CREATE TABLE IF NOT EXISTS postflop_reports (
  spot_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL
);
