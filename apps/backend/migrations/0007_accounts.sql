-- Google subjects, not email addresses, define account identity.
-- This migration replaces an unapplied email/password draft; no password data is stored.
CREATE TABLE account_users (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE account_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX account_sessions_user ON account_sessions(user_id);
CREATE INDEX account_sessions_expiry ON account_sessions(expires_at);
CREATE TABLE account_oauth_states (state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX account_oauth_expiry ON account_oauth_states(expires_at);
CREATE TABLE account_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX account_rate_expiry ON account_rate_limits(expires_at);
CREATE TABLE account_data (user_id TEXT PRIMARY KEY REFERENCES account_users(id) ON DELETE CASCADE, data_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0);
