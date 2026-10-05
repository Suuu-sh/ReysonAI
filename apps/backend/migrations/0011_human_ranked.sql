-- Independent human-only season. Existing quiz/Agent records stay untouched.
CREATE TABLE IF NOT EXISTS human_rank_players (
 user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE,
 public_id TEXT UNIQUE NOT NULL, public_name TEXT NOT NULL,
 phase TEXT NOT NULL DEFAULT 'out' CHECK(phase IN ('out','queued','reserved','hand','break')),
 version INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 break_until INTEGER, table_id TEXT, seat INTEGER, accepted INTEGER NOT NULL DEFAULT 0,
 rating INTEGER NOT NULL DEFAULT 1000, peak INTEGER NOT NULL DEFAULT 1000,
 hands INTEGER NOT NULL DEFAULT 0, net_bb REAL NOT NULL DEFAULT 0, rating_net_bb REAL NOT NULL DEFAULT 0,
 receipt_json TEXT
);
CREATE INDEX IF NOT EXISTS human_rank_queue ON human_rank_players(phase,lease_until,user_id);
CREATE TABLE IF NOT EXISTS human_rank_tables (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('reserved','active','done','cancelled')),
 private_json TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0,
 receipt_json TEXT, settlement_json TEXT, departure_json TEXT
);
CREATE INDEX IF NOT EXISTS human_rank_due ON human_rank_tables(status,expires_at);
CREATE TABLE IF NOT EXISTS human_rank_receipts (
 user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
 action_id TEXT NOT NULL, request_json TEXT NOT NULL, PRIMARY KEY(user_id,action_id)
);
CREATE TABLE IF NOT EXISTS human_rank_results (
 table_id TEXT NOT NULL REFERENCES human_rank_tables(id),
 user_id TEXT NOT NULL REFERENCES human_rank_players(user_id) ON DELETE CASCADE, at INTEGER NOT NULL,
 net_cents INTEGER NOT NULL, before_rating INTEGER NOT NULL DEFAULT 1000,
 after_rating INTEGER NOT NULL DEFAULT 1000, public_json TEXT NOT NULL,
 PRIMARY KEY(table_id,user_id)
);
CREATE INDEX IF NOT EXISTS human_rank_history ON human_rank_results(user_id,at DESC);
CREATE TRIGGER IF NOT EXISTS human_rank_claim BEFORE INSERT ON human_rank_tables
WHEN NEW.status='reserved'
BEGIN
 SELECT CASE WHEN json_array_length(NEW.private_json,'$.users')!=6 OR
 (SELECT COUNT(DISTINCT value) FROM json_each(NEW.private_json,'$.users'))!=6 OR
 (SELECT COUNT(*) FROM human_rank_players WHERE user_id IN (SELECT value FROM json_each(NEW.private_json,'$.users')) AND phase='queued' AND lease_until>NEW.created_at)!=6
 THEN RAISE(ABORT,'human_pair_conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS human_rank_reserved AFTER INSERT ON human_rank_tables
WHEN NEW.status='reserved'
BEGIN
 UPDATE human_rank_players SET phase='reserved',table_id=NEW.id,seat=(SELECT CAST(key AS INTEGER) FROM json_each(NEW.private_json,'$.users') WHERE value=user_id),accepted=0,version=version+1
 WHERE user_id IN (SELECT value FROM json_each(NEW.private_json,'$.users'));
END;
CREATE TRIGGER IF NOT EXISTS human_rank_activate BEFORE UPDATE OF status ON human_rank_tables
WHEN NEW.status='active' AND OLD.status='reserved'
BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM human_rank_players WHERE table_id=NEW.id AND phase='reserved' AND accepted=1 AND lease_until>NEW.created_at)!=6
 THEN RAISE(ABORT,'human_activation_conflict') END;
END;
CREATE TRIGGER IF NOT EXISTS human_rank_phase AFTER UPDATE OF status ON human_rank_tables
WHEN NEW.status IS NOT OLD.status
BEGIN
 UPDATE human_rank_players SET phase=CASE NEW.status WHEN 'active' THEN 'hand' WHEN 'cancelled' THEN 'queued' ELSE CASE WHEN lease_until>NEW.updated_at OR user_id=json_extract(NEW.receipt_json,'$.user') THEN 'queued' ELSE 'out' END END,
 table_id=CASE WHEN NEW.status='active' THEN NEW.id ELSE NULL END,seat=CASE WHEN NEW.status='active' THEN seat ELSE NULL END,accepted=0,version=version+1,lease_until=CASE WHEN user_id=json_extract(NEW.receipt_json,'$.user') THEN NEW.updated_at+45000 ELSE lease_until END
 WHERE table_id=NEW.id AND phase IN ('reserved','hand');
END;
CREATE TRIGGER IF NOT EXISTS human_rank_player_receipt AFTER UPDATE OF receipt_json ON human_rank_players
WHEN NEW.receipt_json IS NOT NULL
BEGIN
 INSERT INTO human_rank_receipts VALUES(NEW.user_id,json_extract(NEW.receipt_json,'$.id'),json_extract(NEW.receipt_json,'$.request'));
END;
CREATE TRIGGER IF NOT EXISTS human_rank_table_receipt AFTER UPDATE OF receipt_json ON human_rank_tables
WHEN NEW.receipt_json IS NOT NULL AND json_extract(NEW.receipt_json,'$.user') IS NOT NULL AND NEW.receipt_json IS NOT OLD.receipt_json
BEGIN
 INSERT INTO human_rank_receipts VALUES(json_extract(NEW.receipt_json,'$.user'),json_extract(NEW.receipt_json,'$.id'),json_extract(NEW.receipt_json,'$.request'));
END;
CREATE TRIGGER IF NOT EXISTS human_rank_settle AFTER UPDATE OF settlement_json ON human_rank_tables
WHEN NEW.settlement_json IS NOT NULL AND OLD.status!='done' AND NEW.status='done'
BEGIN
 INSERT INTO human_rank_results(table_id,user_id,at,net_cents,public_json)
 SELECT NEW.id,json_extract(value,'$.user'),NEW.updated_at,json_extract(value,'$.net'),json_extract(value,'$.public') FROM json_each(NEW.settlement_json) WHERE EXISTS(SELECT 1 FROM human_rank_players WHERE user_id=json_extract(value,'$.user'));
END;
-- Current aggregates, never a stale request's player snapshot, determine each rating.
CREATE TRIGGER IF NOT EXISTS human_rank_aggregate AFTER INSERT ON human_rank_results
BEGIN
 UPDATE human_rank_results SET before_rating=(SELECT rating FROM human_rank_players WHERE user_id=NEW.user_id),
 after_rating=(SELECT CAST(1000+MIN(1200,MAX(-800,ROUND(4000*(rating_net_bb+MIN(10,MAX(-10,NEW.net_cents/100.0)))/(hands+1+10000)))) AS INTEGER) FROM human_rank_players WHERE user_id=NEW.user_id)
 WHERE table_id=NEW.table_id AND user_id=NEW.user_id;
 UPDATE human_rank_results SET public_json=json_set(public_json,'$.beforeRating',before_rating,'$.afterRating',after_rating) WHERE table_id=NEW.table_id AND user_id=NEW.user_id;
 UPDATE human_rank_players SET hands=hands+1,net_bb=net_bb+NEW.net_cents/100.0,rating_net_bb=rating_net_bb+MIN(10,MAX(-10,NEW.net_cents/100.0)),
 rating=(SELECT after_rating FROM human_rank_results WHERE table_id=NEW.table_id AND user_id=NEW.user_id),
 peak=MAX(peak,(SELECT after_rating FROM human_rank_results WHERE table_id=NEW.table_id AND user_id=NEW.user_id)) WHERE user_id=NEW.user_id;
END;

-- Departing a seat and the table transition share a single CAS statement.
CREATE TRIGGER IF NOT EXISTS human_rank_departure AFTER UPDATE OF private_json,departure_json ON human_rank_tables
BEGIN
 UPDATE human_rank_players SET phase=json_extract(NEW.departure_json,'$.phase'),table_id=NULL,seat=NULL,accepted=0,
 break_until=json_extract(NEW.departure_json,'$.deadline'),version=version+1
 WHERE NEW.departure_json IS NOT NULL AND user_id=json_extract(NEW.departure_json,'$.user');
 UPDATE human_rank_players SET phase=CASE WHEN lease_until>NEW.updated_at OR user_id=json_extract(NEW.receipt_json,'$.user') THEN 'queued' ELSE 'out' END,table_id=NULL,seat=NULL,accepted=0,version=version+1,lease_until=CASE WHEN user_id=json_extract(NEW.receipt_json,'$.user') THEN NEW.updated_at+45000 ELSE lease_until END
 WHERE table_id=NEW.id AND phase='hand' AND user_id IN (
 SELECT json_extract(NEW.private_json,'$.users['||key||']') FROM json_each(NEW.private_json,'$.hand.seats')
 WHERE json_extract(value,'$.folded')=1 OR json_extract(value,'$.autoFold')=1);
END;

-- Deleting an account or its human-season record must not strand other seats.
-- Null seat identities retain chip/hand state, never the deleted internal user ID.
CREATE TRIGGER IF NOT EXISTS human_rank_delete AFTER DELETE ON human_rank_players
BEGIN
 DELETE FROM human_rank_receipts WHERE user_id=OLD.user_id;
 UPDATE human_rank_tables SET
 private_json=json_set(CASE WHEN status='active' THEN
   json_set(private_json,'$.hand.seats['||(SELECT key FROM json_each(private_json,'$.users') WHERE value=OLD.user_id)||'].autoFold',json('true'))
   ELSE private_json END,'$.users',json((SELECT json_group_array(CASE WHEN value=OLD.user_id THEN NULL ELSE value END) FROM json_each(private_json,'$.users')))),
 settlement_json=CASE WHEN settlement_json IS NULL THEN NULL ELSE json((SELECT json_group_array(json(value)) FROM json_each(settlement_json) WHERE json_extract(value,'$.user') IS NOT OLD.user_id)) END,
 receipt_json=CASE WHEN json_extract(receipt_json,'$.user')=OLD.user_id THEN NULL ELSE receipt_json END,
 departure_json=NULL,
 expires_at=CASE WHEN status='active' AND json_extract(private_json,'$.users['||json_extract(private_json,'$.hand.turn')||']')=OLD.user_id THEN MIN(expires_at,unixepoch()*1000) ELSE expires_at END,
 status=CASE WHEN status='reserved' THEN 'cancelled' ELSE status END,version=version+1
 WHERE EXISTS(SELECT 1 FROM json_each(private_json,'$.users') WHERE value=OLD.user_id);
END;
