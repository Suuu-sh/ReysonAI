-- Additive native-auth tables. Existing Web sessions, OAuth state and account data stay intact.
CREATE TABLE account_native_attempts (
  attempt_hash TEXT PRIMARY KEY,
  code_challenge TEXT NOT NULL,
  app_state TEXT NOT NULL,
  redirect_id TEXT NOT NULL CHECK (redirect_id = 'reysonai-mobile'),
  status TEXT NOT NULL CHECK (status IN ('pending','authorizing','code','consumed','cancelled')),
  oauth_state_hash TEXT UNIQUE,
  user_id TEXT REFERENCES account_users(id) ON DELETE CASCADE,
  code_hash TEXT UNIQUE,
  code_expires_at INTEGER,
  session_token_hash TEXT UNIQUE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX account_native_attempt_expiry ON account_native_attempts(expires_at);
CREATE TABLE account_native_oauth_states (
  state_hash TEXT PRIMARY KEY,
  attempt_hash TEXT UNIQUE NOT NULL REFERENCES account_native_attempts(attempt_hash) ON DELETE CASCADE,
  verifier TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX account_native_oauth_expiry ON account_native_oauth_states(expires_at);
CREATE TABLE account_native_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES account_users(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL CHECK (token_type = 'native'),
  -- Keep session revocation independent of expired attempt cleanup.
  attempt_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX account_native_session_user ON account_native_sessions(user_id);
CREATE INDEX account_native_session_expiry ON account_native_sessions(expires_at);
