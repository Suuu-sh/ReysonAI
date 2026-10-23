-- Private owner batches use an explicit existing operator, never synthetic accounts.
-- Canonical scene IDs and leases remain shared with authenticated public requests.
CREATE TABLE IF NOT EXISTS aiv2_ondemand_operator_batches (
 id TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL,
 operator_user_id TEXT NOT NULL REFERENCES account_users(id), created_at INTEGER NOT NULL
);
ALTER TABLE aiv2_ondemand_jobs ADD COLUMN operator_batch_id TEXT REFERENCES aiv2_ondemand_operator_batches(id);
CREATE INDEX IF NOT EXISTS aiv2_ondemand_jobs_operator_batch ON aiv2_ondemand_jobs(operator_batch_id);
CREATE TRIGGER IF NOT EXISTS aiv2_ondemand_operator_batch_immutable BEFORE UPDATE ON aiv2_ondemand_operator_batches
 BEGIN SELECT RAISE(ABORT,'operator batch manifest is immutable'); END;
