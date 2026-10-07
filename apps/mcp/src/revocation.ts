import type { McpEnv } from './config.ts';
export type McpGrant = Readonly<{ userId: string; grantId: string }>;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validGrant(value: unknown): value is McpGrant {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<McpGrant>;
  return identifier(candidate.userId) && identifier(candidate.grantId);
}
/** An authoritative primary read: KV's eventual consistency must never resurrect revoked access. */
export async function grantRevoked(env: McpEnv, grant: McpGrant): Promise<boolean> {
  const row = await env.DB.withSession('first-primary').prepare('SELECT grant_id FROM mcp_revocations WHERE user_id=? AND grant_id=? AND token_id=\'\'')
    .bind(grant.userId, grant.grantId).all<{ grant_id: string }>();
  return row.results.length !== 0;
}
export async function revokeGrantAuthoritatively(env: McpEnv, grant: McpGrant): Promise<void> {
  if (!validGrant(grant)) throw new Error('invalid_grant_reference');
  await env.DB.withSession('first-primary').prepare('INSERT OR IGNORE INTO mcp_revocations(user_id,grant_id,revoked_at) VALUES (?,?,?)')
    .bind(grant.userId, grant.grantId, Math.floor(Date.now() / 1000)).run();
}


async function tokenRevoked(env: McpEnv, grant: McpGrant, tokenId: string): Promise<boolean> {
  const row = await env.DB.withSession('first-primary').prepare("SELECT grant_id FROM mcp_revocations WHERE user_id=? AND grant_id=? AND token_id IN ('',?)")
    .bind(grant.userId, grant.grantId, tokenId).all<{ grant_id: string }>();
  return row.results.length !== 0;
}
async function revokeTokenAuthoritatively(env: McpEnv, grant: McpGrant, tokenId: string): Promise<void> {
  await env.DB.withSession('first-primary').prepare('INSERT OR IGNORE INTO mcp_revocations(user_id,grant_id,token_id,revoked_at) VALUES (?,?,?,?)')
    .bind(grant.userId, grant.grantId, tokenId, Math.floor(Date.now() / 1000)).run();
}

function storageGrant(key: string): McpGrant | null {
  const parts = key.split(':');
  if ((parts[0] !== 'grant' || parts.length !== 3) && (parts[0] !== 'token' || parts.length !== 4)) return null;
  const grant = { userId: parts[1], grantId: parts[2] };
  return validGrant(grant) && /^[A-Za-z0-9_-]{16}$/.test(grant.grantId) ? grant : null;
}
/**
 * Cover *all* provider revocation paths: RFC7009, consent replacement, auth-code replay,
 * refresh rejection and user-initiated revoke. Only the provider's internal deletion
 * of an already-validated grant creates a tombstone; request token strings never do.
 * Key format is pinned to workers-oauth-provider 1.2.3 and tested at the real storage seam.
 */
export function withRevocationGuard(env: McpEnv): McpEnv {
  const storage = env.OAUTH_KV;
  const guarded = new Proxy(storage, {
    get(target, property) {
      if (property === 'get' || property === 'getWithMetadata') {
        return async (...args: unknown[]) => {
          if (typeof args[0] !== 'string') throw new TypeError('unsupported_bulk_oauth_read');
          const grant = storageGrant(args[0]);
          const value = await Reflect.apply(target[property], target, args);
          // Check after the KV read, so a revocation completed while KV was pending wins.
          if (grant && await (args[0].startsWith('token:') ? tokenRevoked(env, grant, args[0].split(':')[3]) : grantRevoked(env, grant))) return property === 'get' ? null : { value: null, metadata: null, cacheStatus: null };
          return value;
        };
      }
      if (property === 'put') {
        return async (...args: unknown[]) => {
          if (typeof args[0] !== 'string') throw new TypeError('invalid_oauth_key');
          const grant = storageGrant(args[0]);
          if (grant && await grantRevoked(env, grant)) throw new Error('oauth_grant_revoked');
          return Reflect.apply(target.put, target, args);
        };
      }
      if (property === 'delete') {
        return async (key: string) => {
          const grant = storageGrant(key);
          if (grant) {
            if (key.startsWith('grant:')) await revokeGrantAuthoritatively(env, grant);
            else await revokeTokenAuthoritatively(env, grant, key.split(':')[3]);
          }
          return target.delete(key);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { ...env, OAUTH_KV: guarded };
}

/** Only call from the provider's post-validation authorization_code callback, before issuance. */
export async function claimAuthorizationCode(env: McpEnv, grant: McpGrant): Promise<boolean> {
  if (!validGrant(grant)) throw new Error('invalid_grant_reference');
  const claim = await env.DB.withSession('first-primary').prepare('INSERT OR IGNORE INTO mcp_code_redemptions(user_id,grant_id,claimed_at) VALUES (?,?,?) RETURNING grant_id')
    .bind(grant.userId, grant.grantId, Math.floor(Date.now() / 1000)).all<{ grant_id: string }>();
  return claim.results.length === 1;
}

/** Compare-and-swap a validated refresh generation; stale KV must not roll it back. */
export async function advanceGrantRevision(env: McpEnv, grant: McpGrant, previous: number): Promise<number | null> {
  if (!validGrant(grant) || !Number.isSafeInteger(previous) || previous < 0 || previous >= Number.MAX_SAFE_INTEGER) return null;
  const changed = await env.DB.withSession('first-primary').prepare('UPDATE mcp_code_redemptions SET grant_revision=grant_revision+1 WHERE user_id=? AND grant_id=? AND grant_revision=? RETURNING grant_revision')
    .bind(grant.userId, grant.grantId, previous).all<{ grant_revision: number }>();
  return changed.results.length === 1 ? changed.results[0].grant_revision : null;
}

export async function claimRefreshToken(env: McpEnv, grant: McpGrant, clientId: string, tokenHash: string): Promise<boolean> {
  if (!validGrant(grant) || !/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error('invalid_refresh_reference');
  const claim = await env.DB.withSession('first-primary').prepare('INSERT OR IGNORE INTO mcp_refresh_redemptions(token_hash,user_id,grant_id,client_id,claimed_at) VALUES (?,?,?,?,?) RETURNING token_hash')
    .bind(tokenHash, grant.userId, grant.grantId, clientId, Math.floor(Date.now() / 1000)).all<{ token_hash: string }>();
  return claim.results.length === 1;
}
export async function consumedRefreshGrant(env: McpEnv, tokenHash: string, clientId: string): Promise<McpGrant | null> {
  const rows = await env.DB.withSession('first-primary').prepare('SELECT user_id,grant_id FROM mcp_refresh_redemptions WHERE token_hash=? AND client_id=?')
    .bind(tokenHash, clientId).all<{ user_id: string; grant_id: string }>();
  if (rows.results.length !== 1) return null;
  const grant = { userId: rows.results[0].user_id, grantId: rows.results[0].grant_id };
  return validGrant(grant) ? grant : null;
}
