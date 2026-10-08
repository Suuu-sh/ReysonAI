-- Optional MCP extension to the existing account database. Apply only after explicit activation approval.
-- Never delete a tombstone until every associated grant and access/refresh token has expired.
CREATE TABLE IF NOT EXISTS mcp_revocations (
  user_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  token_id TEXT NOT NULL DEFAULT '',
  revoked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, grant_id, token_id)
);

-- Single-use authorization-code redemption, independent from eventually consistent KV.
-- The provider validates the code, client, redirect URI, resource and PKCE before this is claimed.
-- A fresh authorization has a fresh grant ID; no authorization code or verifier is stored here.
CREATE TABLE IF NOT EXISTS mcp_code_redemptions (
  user_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  grant_revision INTEGER NOT NULL DEFAULT 0 CHECK(grant_revision >= 0),
  PRIMARY KEY (user_id, grant_id)
);

-- Strict single-use refresh tokens. Store only SHA-256, never the presented token.
CREATE TABLE IF NOT EXISTS mcp_refresh_redemptions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);
