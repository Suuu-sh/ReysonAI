import { AuthorizationError, OAuthError, OAuthAuthorizationServer, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { HISTORY_SCOPE, RANGE_SCOPE, SCOPES } from './access.ts';
import type { McpConfiguration, McpEnv } from './config.ts';
import { consentCompletionHtml, errorResponse, escapeHtml, html, oauthFormHtml, readBoundedBody, SECURITY_HEADERS } from './http.ts';
import { authorizationFailureDetails } from './auth-diagnostics.ts';
import { accountExists, browserSession, sessionProof, validSessionProof } from './session.ts';

import { advanceGrantRevision, claimAuthorizationCode, claimRefreshToken, grantRevoked, revokeGrantAuthoritatively, validGrant } from './revocation.ts';

import type { TokenRequestContext } from './token-request.ts';

export const AUTHORIZE_PATH = '/oauth/mcp/authorize';
export const TOKEN_PATH = '/oauth/mcp/token';
export const CONNECTIONS_PATH = '/oauth/mcp/connections';
const LABELS: Record<string, string> = {
  [RANGE_SCOPE]: 'Read published AI-estimate ranges and their saved explanations (not GTO or live advice)',
  [HISTORY_SCOPE]: 'Read a limited summary of your own synced learning history; no profile or local-only data',
  offline_access: 'Allow this client to refresh access for up to 30 days',
};
const CONSENT_OFFER_PREFIX = 'mcp:consent-offer:';
const CONSENT_OFFER_TTL_SECONDS = 600;
type ConsentOffer = Readonly<{ version: 1; requestedScopes: string[]; offeredScopes: string[] }>;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
async function consentOfferKey(handle: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(handle));
  return `${CONSENT_OFFER_PREFIX}${hex(hash)}`;
}
function validScopeList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= SCOPES.length
    && value.every(scope => typeof scope === 'string' && (SCOPES as readonly string[]).includes(scope))
    && new Set(value).size === value.length && value.includes(RANGE_SCOPE);
}
function validConsentOffer(value: unknown): value is ConsentOffer {
  if (!value || typeof value !== 'object' || !('version' in value) || !('requestedScopes' in value) || !('offeredScopes' in value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || record.version !== 1 || !validScopeList(record.requestedScopes) || !validScopeList(record.offeredScopes)) return false;
  const expected = [...record.requestedScopes];
  if (!expected.includes('offline_access')) expected.push('offline_access');
  return JSON.stringify(record.offeredScopes) === JSON.stringify(expected);
}

export function authorizationServer(config: McpConfiguration, tokenContext: TokenRequestContext = {}): OAuthAuthorizationServer<McpEnv> {
  return new OAuthAuthorizationServer<McpEnv>({
    issuer: config.origin,
    resources: [config.resource],
    authorizeEndpoint: AUTHORIZE_PATH,
    tokenEndpoint: TOKEN_PATH,
    scopesSupported: [...SCOPES],
    accessTokenTTL: 300,
    refreshTokenTTL: 30 * 24 * 60 * 60,
    async tokenExchangeCallback(options) {
      const grant = { userId: options.userId, grantId: options.grantId };
      if (!validGrant(grant) || !await accountExists(options.env, grant.userId) || await grantRevoked(options.env, grant)) throw new OAuthError('invalid_grant', { description: 'Authorization is no longer available' });
      if (options.grantType === 'authorization_code' && !await claimAuthorizationCode(options.env, grant)) {
        // A duplicate code can arrive through another isolate's stale KV snapshot.
        // Revoke even an in-flight first issuance; at most one claim may succeed.
        await revokeGrantAuthoritatively(options.env, grant);
        throw new OAuthError('invalid_grant', { description: 'Authorization code was already redeemed' });
      }
      let revision = 0;
      if (options.grantType === 'refresh_token') {
        if (!tokenContext.refreshTokenHash || tokenContext.clientId !== options.clientId) throw new OAuthError('invalid_grant', { description: 'Refresh request context unavailable' });
        if (!await claimRefreshToken(options.env, grant, options.clientId, tokenContext.refreshTokenHash)) {
          await revokeGrantAuthoritatively(options.env, grant);
          throw new OAuthError('invalid_grant', { description: 'Refresh token was already redeemed' });
        }
        const props: unknown = options.props;
        const previous = props && typeof props === 'object' && 'revision' in props ? props.revision : undefined;
        const next = validGrant(props) && props.userId === grant.userId && props.grantId === grant.grantId && typeof previous === 'number'
          ? await advanceGrantRevision(options.env, grant, previous) : null;
        if (next === null) {
          await revokeGrantAuthoritatively(options.env, grant);
          throw new OAuthError('invalid_grant', { description: 'Refresh generation was already used' });
        }
        revision = next;
      }
      return { newProps: { ...grant, revision }, refreshTokenTTL: options.scope.includes('offline_access') ? 30 * 24 * 60 * 60 : 0 };
    },
    clientIdMetadataDocumentEnabled: false,
    allowTokenExchangeGrant: false,
    cookiePrefix: '__Host-reysonai-mcp-',
    // Deliberately no public registration endpoint, external bearer resolver or upstream token.
    // Do not let provider diagnostics include credentials, request bodies or personal history.
    onError: error => {
      if (error.internal.category === 'refresh-token-grant' && error.internal.reason === 'refresh_token_mismatch') tokenContext.validatedClientRefreshMismatch = true;
    },
  });
}

function validAuthRequest(request: AuthRequest, config: McpConfiguration): boolean {
  // Require PKCE even for pre-registered confidential clients, beyond the library's public-client minimum.
  return request.resource === config.resource && request.codeChallengeMethod === 'S256'
    && typeof request.codeChallenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(request.codeChallenge)
    && request.scope.includes(RANGE_SCOPE) && new Set(request.scope).size === request.scope.length
    && request.scope.every(scope => (SCOPES as readonly string[]).includes(scope));
}
function signedOut(config: McpConfiguration): Response {
  return html(`<h1>Sign in to ReysonAI</h1><p>A ReysonAI account is required. This connection is currently free.</p><p><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(config.appUrl)}">Open ReysonAI and sign in</a></p><p>After signing in, return to this page and reload it to review this client's permissions. No access has been granted.</p>`, 401);
}

export async function authorizationPage(request: Request, env: McpEnv, config: McpConfiguration, oauth: OAuthHelpers): Promise<Response> {
  try {
    if (request.method === 'GET') {
      if (request.url.length > 8192) return errorResponse('request_too_large', 414);
      const auth = await oauth.parseAuthRequest(request);
      if (!validAuthRequest(auth, config)) return errorResponse('invalid_scope_resource_or_pkce', 400);
      const details = await oauth.describeConsent(auth);
      const session = await browserSession(request, env);
      if (!session) return signedOut(config);
      const consent = await oauth.beginConsent(auth);
      const requestedScopes = [...auth.scope];
      const offeredScopes = [...requestedScopes];
      if (!offeredScopes.includes('offline_access')) offeredScopes.push('offline_access');
      const offer: ConsentOffer = { version: 1, requestedScopes, offeredScopes };
      const offerKey = await consentOfferKey(consent.handle);
      await env.OAUTH_KV.put(offerKey, JSON.stringify(offer), { expirationTtl: CONSENT_OFFER_TTL_SECONDS });
      const proof = await sessionProof(session, `consent:${consent.handle}:${JSON.stringify([requestedScopes, offeredScopes])}`);
      const scopes = details.scope.filter(scope => scope !== 'offline_access')
        .map(scope => `<label class="permission"><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked><span class="permission-copy"><span>${escapeHtml(LABELS[scope] ?? scope)}</span></span></label>`).join('');
      const offlineChecked = requestedScopes.includes('offline_access') ? ' checked' : '';
      const offlineDescription = requestedScopes.includes('offline_access')
        ? 'The client requested this optional permission.'
        : 'The client did not request this permission; select it only if you want this connection to support refresh.';
      const offlineScope = `<label class="permission permission-optional"><input type="checkbox" name="scope" value="offline_access"${offlineChecked}><span class="permission-copy"><span>${escapeHtml(LABELS.offline_access)}</span><small>${escapeHtml(offlineDescription)}</small></span></label>`;
      return oauthFormHtml(`<section class="consent-flow" aria-labelledby="consent-title">
<p class="eyebrow">Secure connection request</p>
<h1 id="consent-title">Connect ${escapeHtml(details.clientName)} to ReysonAI?</h1>
<p class="account-context">Signed in as <strong>${escapeHtml(session.email)}</strong>. Review the app and its requested access before continuing.</p>
<div class="client-details"><div class="client-detail"><span>Client ID</span><code>${escapeHtml(details.clientId)}</code></div><div class="client-detail"><span>Access returns to</span><strong>${escapeHtml(details.redirectHost)}</strong></div></div>
${details.redirectIsLoopback ? '<p class="loopback-warning"><strong>This grants access to an app on your computer.</strong> Continue only if you just started this connection.</p>' : ''}
<p class="security-note"><strong>How access works.</strong> Access tokens expire after five minutes. Optional refresh access lets this client keep the connection until you revoke it or 30 days pass. Login is required; use is currently free, with no payment or subscription.</p>
<form class="consent-form" method="post" action="${AUTHORIZE_PATH}"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><input type="hidden" name="session_proof" value="${proof}"><fieldset class="permissions"><legend>Permissions</legend><div class="permission-list">${scopes}${offlineScope}</div></fieldset><div class="consent-actions"><button name="decision" value="approve">Allow access</button><button name="decision" value="deny">Deny</button></div></form>
<p class="manage-link"><a href="${CONNECTIONS_PATH}">Manage or revoke connections</a></p>
</section>`, 200, consent.headers);
    }
    if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
    if (request.headers.get('origin') !== config.origin || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return errorResponse('invalid_origin_or_content_type', 403);
    const session = await browserSession(request, env);
    if (!session) return signedOut(config);
    const form = new URLSearchParams(await readBoundedBody(request));
    const allowedFields = new Set(['handle', 'session_proof', 'decision', 'scope']);
    if ([...new Set(form.keys())].some(key => !allowedFields.has(key))) return errorResponse('invalid_consent_form', 400);
    const handleValues = form.getAll('handle');
    const proofValues = form.getAll('session_proof');
    const decisionValues = form.getAll('decision');
    if (handleValues.length !== 1 || proofValues.length !== 1 || decisionValues.length !== 1) return errorResponse('invalid_consent_form', 400);
    const handle = handleValues[0];
    if (!handle || handle.length > 512) return errorResponse('consent_session_changed_or_invalid', 403);
    const offerKey = await consentOfferKey(handle);
    const serializedOffer = await env.OAUTH_KV.get(offerKey);
    let offer: unknown;
    try { offer = serializedOffer ? JSON.parse(serializedOffer) : null; } catch { offer = null; }
    if (!validConsentOffer(offer)) return errorResponse('invalid_consent_form', 400);
    const purpose = `consent:${handle}:${JSON.stringify([offer.requestedScopes, offer.offeredScopes])}`;
    if (!await validSessionProof(session, purpose, proofValues[0])) return errorResponse('consent_session_changed_or_invalid', 403);
    if (decisionValues[0] === 'deny') {
      const denied = await oauth.denyConsent(request, handle);
      try { await env.OAUTH_KV.delete(offerKey); } catch { /* The offer expires after ten minutes if cleanup is unavailable. */ }
      return consentCompletionHtml('denied', denied.headers.get('location'), denied.headers);
    }
    if (decisionValues[0] !== 'approve') return errorResponse('invalid_decision', 400);
    const selected = form.getAll('scope');
    if (selected.length > offer.offeredScopes.length || !selected.includes(RANGE_SCOPE) || new Set(selected).size !== selected.length
      || selected.some(scope => !offer.offeredScopes.includes(scope) || !(SCOPES as readonly string[]).includes(scope))) return errorResponse('invalid_scope', 400);
    const approved = await oauth.approveConsent(request, handle, { scope: selected });
    if (!validAuthRequest(approved.request, config) || JSON.stringify(approved.request.scope) !== JSON.stringify(selected)) return errorResponse('invalid_scope_resource_or_pkce', 400);
    try { await env.OAUTH_KV.delete(offerKey); } catch { /* The offer expires after ten minutes if cleanup is unavailable. */ }
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, userId: session.userId, metadata: {}, scope: approved.request.scope,
      props: { userId: session.userId },
    });
    return consentCompletionHtml('approved', redirectTo, approved.headers);
  } catch (error) {
    if (error instanceof RangeError) return errorResponse('payload_too_large', 413);
    // Render validation failures locally; never construct a redirect from untrusted input.
    if (error instanceof AuthorizationError) return Response.json(authorizationFailureDetails(error, request.method), { status: 400, headers: SECURITY_HEADERS });
    throw error;
  }
}

export async function connectionsPage(request: Request, env: McpEnv, config: McpConfiguration, oauth: OAuthHelpers): Promise<Response> {
  const session = await browserSession(request, env);
  if (!session) return signedOut(config);
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== config.origin || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return errorResponse('invalid_origin_or_content_type', 403);
    const form = new URLSearchParams(await readBoundedBody(request));
    const grant = form.get('grant') ?? '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(grant) || !await validSessionProof(session, `revoke:${grant}`, form.get('session_proof') ?? '')) return errorResponse('invalid_revoke_request', 403);
    // User identity is taken only from the existing authenticated browser session.
    await revokeGrantAuthoritatively(env, { userId: session.userId, grantId: grant });
    await oauth.revokeGrant(grant, session.userId);
    return html('<h1>Connection revoked</h1><p>New MCP requests and refreshes are now blocked. A request already executing may finish. No new access token is issued here.</p><p><a href="./connections">Back to connections</a></p>');
  }
  if (request.method !== 'GET') return errorResponse('method_not_allowed', 405);
  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined;
  if (cursor && cursor.length > 2048) return errorResponse('invalid_cursor', 400);
  const grants = await oauth.listUserGrants(session.userId, { limit: 20, cursor });
  const entries = await Promise.all(grants.items.filter(grant => grant.userId === session.userId && grant.resource === config.resource).map(async grant => `<li>Client: ${escapeHtml(grant.clientId)}<br>Permissions: ${escapeHtml(grant.scope.join(', '))}<form method="post"><input type="hidden" name="grant" value="${escapeHtml(grant.id)}"><input type="hidden" name="session_proof" value="${await sessionProof(session, `revoke:${grant.id}`)}"><button>Revoke this connection</button></form></li>`));
  return oauthFormHtml(`<h1>Your ReysonAI MCP connections</h1><p>Signing out of the website does not revoke these separate connections. Revoke each one here when you no longer want it to read your data.</p><ul>${entries.join('')}</ul>${grants.cursor ? `<a href="?cursor=${encodeURIComponent(grants.cursor)}">Next page</a>` : ''}`);
}
