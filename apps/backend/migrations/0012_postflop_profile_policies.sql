-- Saved opponent/exploit policies are AI estimates, not GTO. Publication stores
-- candidate.metadata and candidate.policy separately; no runtime generation.
CREATE TABLE IF NOT EXISTS postflop_profile_policies (
  profile TEXT NOT NULL CHECK (profile IN ('nit', 'station', 'lag', 'maniac')),
  spot_id TEXT NOT NULL,
  opponent_seat TEXT NOT NULL CHECK (opponent_seat IN ('ip', 'oop')),
  role TEXT NOT NULL CHECK (role IN ('villain', 'exploit')),
  stage TEXT NOT NULL CHECK (stage IN ('flop', 'later')),
  metadata_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (profile, spot_id, opponent_seat, role, stage)
);
