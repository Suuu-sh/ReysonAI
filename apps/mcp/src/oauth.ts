import { AuthorizationError, OAuthError, OAuthAuthorizationServer, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { HISTORY_SCOPE, RANGE_SCOPE, SCOPES } from './access.ts';
import type { McpConfiguration, McpEnv } from './config.ts';
import { errorResponse, escapeHtml, html, readBoundedBody } from './http.ts';
import { accountExists, browserSession, sessionProof, validSessionProof } from './session.ts';

import { advanceGrantRevision, claimAuthorizationCode, claimRefreshToken, grantRevoked, revokeGrantAuthoritatively, validGrant } from './revocation.ts';

import type { TokenRequestContext } from './token-request.ts';

export const AUTHORIZE_PATH = '/oauth/mcp/authorize';
export const TOKEN_PATH = '/oauth/mcp/token';
export const CONNECTIONS_PATH = '/oauth/mcp/connections';
const LABELS: Record<string, string> = {
  [RANGE_SCOPE]: 'Read published AI-estimate ranges and their saved explanations (not GTO or live advice)',
  [HISTORY_SCOPE]: 'Read a limited summary of your own synced learning history; no profile or local-only data',
  offline_access: 'Keep this connection until revoked or its 30-day authorization expires',
};

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
    && request.scope.includes(RANGE_SCOPE) && request.scope.every(scope => (SCOPES as readonly string[]).includes(scope));
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
      const requested = details.scope.join(" ");
      const proof = await sessionProof(session, `consent:${consent.handle}:${requested}`);
      const scopes = details.scope.map(scope => `<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked> ${escapeHtml(LABELS[scope] ?? scope)}</label><br>`).join('');
      return html(`<h1>Connect ${escapeHtml(details.clientName)} to ReysonAI?</h1>
<p>This app will receive permission to act for your signed-in ReysonAI account: ${escapeHtml(session.email)}. Review the client and destination before continuing.</p>
<p>Client ID: ${escapeHtml(details.clientId)}<br>Access returns to: <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p><strong>This grants access to an app on your computer. Continue only if you just started this connection.</strong></p>' : ''}
<p>Login is required. Use is currently free. No payment or subscription is created. This connection can last for up to 30 days; revoke it any time.</p>
<form method="post" action="${AUTHORIZE_PATH}"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><input type="hidden" name="session_proof" value="${proof}"><input type="hidden" name="requested" value="${escapeHtml(requested)}">${scopes}<p><button name="decision" value="approve">Allow access</button> <button name="decision" value="deny">Deny</button></p></form><p><a href="${CONNECTIONS_PATH}">Manage and revoke connections</a></p>`, 200, consent.headers);
    }
    if (request.method !== 'POST') return errorResponse('method_not_allowed', 405);
    if (request.headers.get('origin') !== config.origin || !/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return errorResponse('invalid_origin_or_content_type', 403);
    const session = await browserSession(request, env);
    if (!session) return signedOut(config);
    const form = new URLSearchParams(await readBoundedBody(request));
    const handle = form.get('handle') ?? '';
    if (!handle || handle.length > 512 || !await validSessionProof(session, `consent:${handle}:${form.get("requested") ?? ""}`, form.get('session_proof') ?? '')) return errorResponse('consent_session_changed_or_invalid', 403);
    if (form.get('decision') === 'deny') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 303, headers: denied.headers });
    }
    if (form.get('decision') !== 'approve') return errorResponse('invalid_decision', 400);
    const selected = form.getAll('scope');
    if (selected.some(scope => !(form.get('requested') ?? '').split(' ').includes(scope)) || !selected.includes(RANGE_SCOPE) || new Set(selected).size !== selected.length || selected.some(scope => !(SCOPES as readonly string[]).includes(scope))) return errorResponse('invalid_scope', 400);
    const approved = await oauth.approveConsent(request, handle, { scope: selected });
    if (!validAuthRequest(approved.request, config)) return errorResponse('invalid_scope_resource_or_pkce', 400);
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, userId: session.userId, metadata: {}, scope: approved.request.scope,
      props: { userId: session.userId },
    });
    approved.headers.set('location', redirectTo);
    return new Response(null, { status: 303, headers: approved.headers });
  } catch (error) {
    if (error instanceof RangeError) return errorResponse('payload_too_large', 413);
    // Render validation failures locally; never construct a redirect from untrusted input.
    if (error instanceof AuthorizationError) return errorResponse('authorization_request_invalid_or_expired', 400);
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
  return html(`<h1>Your ReysonAI MCP connections</h1><p>Signing out of the website does not revoke these separate connections. Revoke each one here when you no longer want it to read your data.</p><ul>${entries.join('')}</ul>${grants.cursor ? `<a href="?cursor=${encodeURIComponent(grants.cursor)}">Next page</a>` : ''}`);
}
