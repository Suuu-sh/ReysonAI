// Node tooling needs the binding types, not Cloudflare's replacement globals.
// Import Cloudflare's exported definitions to retain the actual runtime contracts.
type ExecutionContext = import('../apps/mcp/node_modules/@cloudflare/workers-types/index').ExecutionContext;
type KVNamespace = import('../apps/mcp/node_modules/@cloudflare/workers-types/index').KVNamespace;
type D1Database = import('../apps/mcp/node_modules/@cloudflare/workers-types/index').D1Database;
declare module 'cloudflare:workers' {
  export const DurableObject: typeof import('../apps/mcp/node_modules/@cloudflare/workers-types/index').CloudflareWorkersModule.DurableObject;
}
// Use the Node DOM Request/Response for Node-hosted fixture execution.
type ExportedHandler<Env = unknown> = Omit<import('../apps/mcp/node_modules/@cloudflare/workers-types/index').ExportedHandler<Env>, 'fetch'> & {
  fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
};
