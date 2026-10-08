import { OAuthResourceServer, insufficientScope } from '@cloudflare/workers-oauth-provider';
import { RANGE_SCOPE, entitlementAdapter, validIdentity } from './access.ts';
import { configuration, type McpEnv } from './config.ts';
import { errorResponse, privateResponse, readBoundedBody } from './http.ts';
import { AUTHORIZE_PATH, CONNECTIONS_PATH, TOKEN_PATH, authorizationPage, authorizationServer, connectionsPage } from './oauth.ts';
import { mcpHandler } from './server.ts';
import { grantRevoked, validGrant, withRevocationGuard, type McpGrant } from './revocation.ts';
import { tokenRequestContext, finishTokenRequest } from './token-request.ts';
import { accountExists } from './session.ts';

export default {
  async fetch(incoming: Request, bindings: McpEnv, ctx: ExecutionContext): Promise<Response> {
    const config = configuration(bindings);
    if (!config) return errorResponse('mcp_not_configured', 503);
    const env = withRevocationGuard(bindings);
    const url = new URL(incoming.url);
    // Never derive the canonical OAuth issuer/audience from attacker-controlled request headers.
    if (url.origin !== config.origin || incoming.headers.has('host') && incoming.headers.get('host') !== url.host) return errorResponse('invalid_host', 403);
    const origin = incoming.headers.get('origin');
    if (origin !== null && !config.allowedOrigins.includes(origin)) return errorResponse('invalid_origin', 403);
    const known = [AUTHORIZE_PATH, CONNECTIONS_PATH, TOKEN_PATH, '/mcp', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'];
    if (!known.includes(url.pathname)) return errorResponse('not_found', 404);
    if (incoming.method === 'OPTIONS') {
      if (!origin) return errorResponse('invalid_origin', 403);
      return privateResponse(new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name', 'vary': 'Origin' } }));
    }
    try {
      let request = incoming;
      if (request.method === 'POST') {
        const body = await readBoundedBody(request, 65536);
        request = new Request(request, { body });
      }
      let tokenContext = {};
      if (url.pathname === TOKEN_PATH) {
        try { tokenContext = await tokenRequestContext(request); } catch { return errorResponse('invalid_token_request', 400); }
      }
      const authorization = authorizationServer(config, tokenContext);
      let response: Response;
      if (url.pathname === AUTHORIZE_PATH) response = await authorizationPage(request, env, config, authorization.getOAuthApi(env));
      else if (url.pathname === CONNECTIONS_PATH) response = await connectionsPage(request, env, config, authorization.getOAuthApi(env));
      else if (url.pathname === TOKEN_PATH || url.pathname === '/.well-known/oauth-authorization-server') {
        response = await authorization.fetch(request, env, ctx);
        await finishTokenRequest(env, tokenContext);
      }
      else {
        const resource = new OAuthResourceServer<McpEnv, McpGrant>({
          resourceMetadata: { resource: config.resource, authorization_servers: [config.origin], resource_name: 'ReysonAI authenticated educational tools' },
          requiredScopes: [RANGE_SCOPE],
          validateToken: binding => async (audience, token) => {
            const validated = await authorization.validateToken<McpGrant>(audience, token, binding);
            if (!validated || !validGrant(validated.props) || validated.userId !== validated.props.userId || await grantRevoked(binding, validated.props)) return null;
            return validated;
          },
          handler: {
            async fetch(authorizedRequest, binding, authorizedContext) {
              const auth = authorizedContext.auth;
              const identity = { userId: auth.userId, grantId: authorizedContext.props?.grantId, clientId: auth.clientId, scopes: auth.scope, audience: auth.audience, expiresAt: auth.expiresAt };
              if (!validIdentity(identity, config.resource) || authorizedContext.props?.userId !== identity.userId || !await accountExists(binding, identity.userId)) { const denied = errorResponse('invalid_token', 401); denied.headers.set('www-authenticate', `Bearer error="invalid_token", resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp"`); return denied; }
              if (!identity.scopes.includes(RANGE_SCOPE)) return insufficientScope(auth, [RANGE_SCOPE]);
              if (!(await entitlementAdapter(binding.MCP_ACCESS_MODE).check(identity)).allowed) return errorResponse('access_not_configured', 403);
              if (url.search || authorizedRequest.headers.has('mcp-session-id')) return errorResponse('stateless_request_required', 400);
              return mcpHandler(binding, config, identity)(authorizedRequest, binding, authorizedContext);
            },
          },
        });
        response = await resource.fetch(request, env, ctx);
      }
      response = privateResponse(response);
      // Credentialed browser cookies are used only for same-origin consent pages, never cross-origin MCP.
      if (origin) { response.headers.set('access-control-allow-origin', origin); response.headers.set('vary', 'Origin'); response.headers.set('access-control-expose-headers', 'WWW-Authenticate'); }
      return response;
    } catch (error) {
      return errorResponse(error instanceof RangeError ? 'payload_too_large' : 'mcp_service_unavailable', error instanceof RangeError ? 413 : 503);
    }
  },
} satisfies ExportedHandler<McpEnv>;
