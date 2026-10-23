-- Explicit authenticated jobs only. A lost/expired lease is never replayed automatically.
CREATE TABLE IF NOT EXISTS aiv2_ondemand_jobs (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, board TEXT NOT NULL, path_json TEXT NOT NULL,
 creator TEXT NOT NULL REFERENCES account_users(id), day TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','complete','failed')),
 created_at INTEGER NOT NULL, lease_hash TEXT, lease_until INTEGER,
 reserved_calls INTEGER NOT NULL CHECK(typeof(reserved_calls)='integer' AND reserved_calls BETWEEN 2 AND 64 AND reserved_calls%2=0),
 result_json TEXT, error TEXT,
 UNIQUE(revision,board,path_json)
);
CREATE INDEX IF NOT EXISTS aiv2_ondemand_jobs_day ON aiv2_ondemand_jobs(day,creator);
CREATE TABLE IF NOT EXISTS aiv2_ondemand_access (
 job_id TEXT NOT NULL REFERENCES aiv2_ondemand_jobs(id), user_id TEXT NOT NULL REFERENCES account_users(id),
 PRIMARY KEY(job_id,user_id)
);
CREATE TRIGGER IF NOT EXISTS aiv2_ondemand_immutable BEFORE UPDATE ON aiv2_ondemand_jobs
 WHEN OLD.status IN ('complete','failed')
 BEGIN SELECT RAISE(ABORT,'terminal on-demand job is immutable'); END;
CREATE TABLE IF NOT EXISTS aiv2_ondemand_owner (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision TEXT NOT NULL, heartbeat_at INTEGER NOT NULL
);
