// Test-only entry. NEVER deploy: administrative fixture setup exists only in an in-memory workerd test.
import worker from '../src/index.ts';
import { authorizationServer } from '../src/oauth.ts';
import { configuration, type McpEnv } from '../src/config.ts';
export default {
  async fetch(request: Request, env: McpEnv, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/__fixture/client') {
      const config = configuration(env);
      if (!config) throw new Error('test config unavailable');
      const client = await authorizationServer(config).getOAuthApi(env).createClient({
        clientId: 'fixture-client', clientName: 'Fixture <script>client</script>',
        redirectUris: ['https://client.example/callback'], tokenEndpointAuthMethod: 'none',
        grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'],
      });
      const other = await authorizationServer(config).getOAuthApi(env).createClient({clientId:'fixture-other',clientName:'Fixture other',redirectUris:['https://other-client.example/callback'],tokenEndpointAuthMethod:'none',grantTypes:['authorization_code','refresh_token'],responseTypes:['code']});
      const confidential = [];
      for (const method of ['client_secret_basic', 'client_secret_post']) {
        const registered = await authorizationServer(config).getOAuthApi(env).createClient({clientId:`fixture-${method}`,clientName:`Fixture ${method}`,clientSecret:`synthetic-${method}-fixture-only`,redirectUris:['https://client.example/callback'],tokenEndpointAuthMethod:method,grantTypes:['authorization_code','refresh_token'],responseTypes:['code']});
        confidential.push({clientId:registered.clientId,clientSecret:registered.clientSecret,method});
      }
      return Response.json({ clientId: client.clientId, otherClientId: other.clientId, confidential });
    }
    // Miniflare dispatchFetch preserves URL but replaces Host with its local listener.
    // Model the matching Cloudflare Host here, in the test-only adapter.
    const headers = new Headers(request.headers);
    headers.set('host', headers.get('x-fixture-host') ?? new URL(request.url).host);
    headers.delete('x-fixture-host');
    return worker.fetch(new Request(request, { headers }), env, ctx);
  },
};
