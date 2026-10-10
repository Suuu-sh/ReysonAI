// Cloudflare-only entry. Keep Node route tests free of runtime virtual imports.
import apiWorker from './index.ts';
import mcpWorker from '../../mcp/src/index.ts';
import type { McpEnv } from '../../mcp/src/config.ts';

type ApiEnv = Parameters<typeof apiWorker.fetch>[1];
type ComposedEnv = ApiEnv & McpEnv;

const MCP_PATHS = new Set([
  '/mcp',
  '/oauth/mcp',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]);

function isMcpPath(pathname: string): boolean {
  return MCP_PATHS.has(pathname) || pathname.startsWith('/oauth/mcp/');
}

export default {
  async fetch(request: Request, env: ComposedEnv, ctx: ExecutionContext): Promise<Response> {
    if (isMcpPath(new URL(request.url).pathname)) {
      // The MCP adapter validates its own bindings, issuer, Host, Origin and CORS.
      // An absent/unapproved MCP config fails closed before any API fallback.
      return mcpWorker.fetch(request, env, ctx);
    }
    return apiWorker.fetch(request, env);
  },
};

export { FastFoldRuntime } from './fastfold-do.ts';
