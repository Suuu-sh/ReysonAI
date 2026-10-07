export type McpConfiguration = Readonly<{ origin: string; resource: string; appUrl: string; allowedOrigins: readonly string[] }>;
// Runtime bindings come from wrangler types; never duplicate the storage binding declarations.
export type McpEnv = { [Key in keyof Env]: Env[Key] extends string ? string : Env[Key] };

export function configuration(env: McpEnv): McpConfiguration | null {
  if (env.MCP_ENABLED !== 'true' || env.AUTH_ENABLED !== 'true' || env.MCP_ACCESS_MODE !== 'authenticated_free' || !env.DB || !env.OAUTH_KV) return null;
  try {
    const origin = new URL(env.MCP_ORIGIN);
    const app = new URL(env.AUTH_APP_URL);
    if (origin.protocol !== 'https:' || origin.origin !== env.MCP_ORIGIN || origin.username || origin.password
      || app.protocol !== 'https:' || app.username || app.password || app.hash) return null;
    const allowedOrigins = env.MCP_ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
    if (!allowedOrigins.length || allowedOrigins.some(value => { const url = new URL(value); return url.protocol !== 'https:' || url.origin !== value; })) return null;
    if (!allowedOrigins.includes(app.origin)) return null;
    return { origin: origin.origin, resource: `${origin.origin}/mcp`, appUrl: new URL('/analyze/ranges', app).href, allowedOrigins: [...new Set([origin.origin, ...allowedOrigins])] };
  } catch { return null; }
}
