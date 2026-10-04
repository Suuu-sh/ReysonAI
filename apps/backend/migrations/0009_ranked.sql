-- Authoritative rated practice. Local browser records are intentionally not imported.
CREATE TABLE IF NOT EXISTS ranked_players (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  public_name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK(rating >= 0),
  peak INTEGER NOT NULL DEFAULT 1000,
  matches INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ranked_matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ranked_players(user_id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','complete')),
  questions_json TEXT NOT NULL,
  actions_json TEXT,
  completed_at INTEGER,
  before_rating INTEGER,
  after_rating INTEGER,
  score REAL,
  UNIQUE(user_id, day, slot)
);
CREATE UNIQUE INDEX IF NOT EXISTS ranked_one_active ON ranked_matches(user_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS ranked_user_history ON ranked_matches(user_id,completed_at);
CREATE INDEX IF NOT EXISTS ranked_completed ON ranked_matches(status,completed_at);
-- The match transition and aggregate update are one SQLite statement/transaction.
CREATE TRIGGER IF NOT EXISTS ranked_finalize AFTER UPDATE OF status ON ranked_matches
WHEN OLD.status='active' AND NEW.status='complete'
BEGIN
  UPDATE ranked_players SET rating=NEW.after_rating,peak=MAX(peak,NEW.after_rating),matches=matches+1
  WHERE user_id=NEW.user_id;
END;
