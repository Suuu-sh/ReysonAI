import type { McpEnv } from './config.ts';
import { consumedRefreshGrant, revokeGrantAuthoritatively } from './revocation.ts';

/** Request-local only; never contains/stores the raw refresh token or client secret. */
export type TokenRequestContext = { refreshTokenHash?: string; clientId?: string; validatedClientRefreshMismatch?: boolean };
export async function tokenRequestContext(request: Request): Promise<TokenRequestContext> {
  if (request.method !== 'POST') return {};
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new TypeError('OAuth token requests require form encoding');
  // index.ts has already bounded the complete body to 64 KiB.
  const form = new URLSearchParams(await request.clone().text());
  if ([...new Set(form.keys())].some(key => form.getAll(key).length !== 1)) throw new TypeError('Duplicate OAuth parameter');
  if (form.has('client_assertion') || form.has('client_assertion_type')) throw new TypeError('Client assertions are not supported by the preregistered-client adapter');
  if (form.get('grant_type') !== 'refresh_token') return {};
  let clientId = form.get('client_id') ?? '';
  const auth = request.headers.get('authorization');
  if (auth) {
    // Provider supports Basic for pre-registered confidential clients. Reject ambiguous dual credentials.
    if (clientId || form.has('client_secret') || !/^Basic [A-Za-z0-9+/]+=*$/i.test(auth)) throw new TypeError('Ambiguous client authentication');
    const decoded = atob(auth.slice(6));
    const colon = decoded.indexOf(':');
    if (colon < 0) throw new TypeError('Malformed client authentication');
    clientId = decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, ' '));
  }
  const token = form.get('refresh_token');
  if (!token || !clientId) return {};
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return { clientId, refreshTokenHash: [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('') };
}

/**
 * The pinned provider reports refresh_token_mismatch only AFTER authenticating the client.
 * Match the presented hash and that same client against a previously validated consumption.
 * Never derive a revocation target from an unvalidated token's user/grant string components.
 */
export async function finishTokenRequest(env: McpEnv, context: TokenRequestContext): Promise<void> {
  if (!context.validatedClientRefreshMismatch || !context.refreshTokenHash || !context.clientId) return;
  const grant = await consumedRefreshGrant(env, context.refreshTokenHash, context.clientId);
  if (grant) await revokeGrantAuthoritatively(env, grant);
}
