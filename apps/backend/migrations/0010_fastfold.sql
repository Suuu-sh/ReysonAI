-- Separate season: never import or overwrite legacy ranked matches/players.
CREATE TABLE IF NOT EXISTS fastfold_players (
  user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
  public_name TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000,
  peak INTEGER NOT NULL DEFAULT 1000,
  hands INTEGER NOT NULL DEFAULT 0,
  net_bb REAL NOT NULL DEFAULT 0,
  squared_bb REAL NOT NULL DEFAULT 0,
  rating_net_bb REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fastfold_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES fastfold_players(user_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('active','paused')),
  private_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  settled_id TEXT,
  settlement_json TEXT
);
CREATE TABLE IF NOT EXISTS fastfold_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES fastfold_players(user_id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  net_bb REAL NOT NULL,
  before_rating INTEGER NOT NULL,
  after_rating INTEGER NOT NULL,
  public_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fastfold_history ON fastfold_results(user_id,at DESC);
CREATE TABLE IF NOT EXISTS fastfold_actions (
  session_id TEXT NOT NULL REFERENCES fastfold_sessions(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_id TEXT,
  PRIMARY KEY(session_id,action_id)
);
-- One CAS UPDATE commits replay state, deduplication receipt and result together.
CREATE TRIGGER IF NOT EXISTS fastfold_accept_action AFTER UPDATE OF private_json ON fastfold_sessions
WHEN json_extract(NEW.private_json,'$.receipt.actionId') IS NOT NULL
BEGIN
  INSERT INTO fastfold_actions(session_id,action_id,request_json,result_id)
  VALUES(NEW.id,json_extract(NEW.private_json,'$.receipt.actionId'),json_extract(NEW.private_json,'$.receipt.request'),NEW.settled_id);
END;
CREATE TRIGGER IF NOT EXISTS fastfold_settle AFTER UPDATE OF settled_id ON fastfold_sessions
WHEN NEW.settled_id IS NOT NULL AND NEW.settled_id IS NOT OLD.settled_id
BEGIN
  INSERT INTO fastfold_results(id,user_id,at,net_bb,before_rating,after_rating,public_json)
  SELECT json_extract(value,'$.id'),NEW.user_id,NEW.updated_at,json_extract(value,'$.netBb'),json_extract(value,'$.beforeRating'),json_extract(value,'$.afterRating'),value FROM json_each(NEW.settlement_json) ORDER BY CAST(key AS INTEGER);
END;
CREATE TRIGGER IF NOT EXISTS fastfold_aggregate AFTER INSERT ON fastfold_results
BEGIN
  UPDATE fastfold_players SET hands=hands+1,net_bb=net_bb+NEW.net_bb,squared_bb=squared_bb+NEW.net_bb*NEW.net_bb,rating_net_bb=rating_net_bb+json_extract(NEW.public_json,'$.ratingEvidenceBb'),
    rating=NEW.after_rating,peak=MAX(peak,NEW.after_rating) WHERE user_id=NEW.user_id;
END;

-- Immutable published inputs. Parts preserve D1 value limits and old hands survive republishing.
CREATE TABLE IF NOT EXISTS fastfold_dataset_parts (
  name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  part INTEGER NOT NULL,
  body TEXT NOT NULL,
  parts INTEGER NOT NULL,
  PRIMARY KEY(name,content_hash,part)
);
