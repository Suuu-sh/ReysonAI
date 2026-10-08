/** Authorization policy is independent from a future subscription/entitlement adapter. */
export const RANGE_SCOPE = 'reysonai:ranges:read';
export const HISTORY_SCOPE = 'reysonai:history:read';
export const SCOPES = [RANGE_SCOPE, HISTORY_SCOPE, 'offline_access'] as const;

export type Identity = Readonly<{ userId: string; grantId: string; clientId: string; scopes: readonly string[]; audience: string; expiresAt: number }>;
export type EntitlementDecision = Readonly<{ allowed: boolean; mode: 'authenticated_free' | 'unconfigured' }>;
export interface EntitlementAdapter {
  check(identity: Identity): Promise<EntitlementDecision>;
}

/** No billing flag, fake paid status, payment call or anonymous bypass. Unknown modes fail closed. */
export function entitlementAdapter(mode: string | undefined): EntitlementAdapter {
  return {
    async check(identity) {
      const allowed = mode === 'authenticated_free' && identity.userId.length > 0;
      return { allowed, mode: allowed ? 'authenticated_free' : 'unconfigured' };
    },
  };
}

export function validIdentity(value: unknown, resource: string, now = Math.floor(Date.now() / 1000)): value is Identity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Identity>;
  return typeof item.grantId === 'string' && /^[A-Za-z0-9_-]{16}$/.test(item.grantId)
    && typeof item.userId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(item.userId)
    && typeof item.clientId === 'string' && item.clientId.length > 0 && item.clientId.length <= 2048
    && item.audience === resource && typeof item.expiresAt === 'number' && Number.isFinite(item.expiresAt) && item.expiresAt > now
    && Array.isArray(item.scopes) && item.scopes.every(scope => typeof scope === 'string' && (SCOPES as readonly string[]).includes(scope));
}
