import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { HISTORY_SCOPE, RANGE_SCOPE, entitlementAdapter, validIdentity, type Identity } from './access.ts';
import type { McpConfiguration, McpEnv } from './config.ts';
import { getOwnLearningHistory, getSavedRange, listSavedRangeCoverage, McpDataError } from './data.ts';
import { evaluatePublishedPostflopPolicy, getSavedPostflopRange, listPostflopCoverage } from './postflop-data.ts';
import { grantRevoked } from './revocation.ts';
import { accountExists } from './session.ts';

export function createServer(env: McpEnv, config: McpConfiguration, identity: Identity) {
  const server = new McpServer({ name: 'ReysonAI', version: '0.1.0' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  async function run(scope: string, read: () => Promise<unknown>) {
    // Each tool call rechecks identity, expiration, account existence, scope and entitlement.
    // No caller-supplied account ID, SQL, URL, bearer token or scope is a tool argument.
    if (!validIdentity(identity, config.resource) || !identity.scopes.includes(scope)
      || await grantRevoked(env, identity) || !await accountExists(env, identity.userId) || !(await entitlementAdapter(env.MCP_ACCESS_MODE).check(identity)).allowed) {
      return { isError: true, content: [{ type: 'text' as const, text: 'Access denied. Reconnect with the required permission.' }] };
    }
    try {
      const data = await read();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
    } catch (error) {
      const code = error instanceof McpDataError ? error.code : 'data_unavailable';
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: code, message: 'No substitute strategy or private data is returned.' }) }] };
    }
  }
  server.registerTool('list_range_coverage', {
    title: 'List saved ReysonAI range coverage',
    description: 'List published saved AI-estimate datasets, then exact supported spot IDs for a dataset. These are educational estimates, not solver/GTO results. Unsupported or unrecorded paths have no substitute strategy.',
    inputSchema: z.strictObject({ dataset: z.string().max(100).optional(), offset: z.number().int().min(0).max(10000).optional(), limit: z.number().int().min(1).max(50).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => listSavedRangeCoverage(env.DB, args)));
  server.registerTool('get_saved_range', {
    title: 'Read an exact saved range or hand',
    description: 'Read one exact dataset and spot returned by list_range_coverage, optionally one canonical hand such as AKs. Returns saved educational AI-estimate frequencies and available saved reasons, never invents a missing strategy. No live poker assistance or solver execution.',
    inputSchema: z.strictObject({ dataset: z.string().min(1).max(100), spotId: z.string().min(1).max(100), hand: z.string().min(2).max(3).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => getSavedRange(env.DB, args)));
  server.registerTool('list_postflop_coverage', {
    title: 'List saved ReysonAI postflop coverage',
    description: 'Discover only postflop spots and canonical flop boards present in the published D1 data. With an exact spotId and flop, list the decision histories stored for that flop. Turn/river policy publication does not imply an exact saved turn/river range. Missing and unreachable paths have no substitute.',
    inputSchema: z.strictObject({ spotId: z.string().min(1).max(100).optional(), flop: z.string().length(6).optional(), offset: z.number().int().min(0).max(2_048).optional(), limit: z.number().int().min(1).max(50).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => listPostflopCoverage(env.DB, args)));
  server.registerTool('get_saved_postflop_range', {
    title: 'Read an exact saved postflop flop range',
    description: 'Read the exact saved range for one published spot, flop board, and action history returned by list_postflop_coverage; optionally select one canonical hand such as AKs. Frequencies are aggregated from stored combo mixes using stored reach weights. Only published saved flop bases are supported; no policy evaluation, new generation, missing-board substitution, turn/river range, live decision support, or solver output.',
    inputSchema: z.strictObject({ spotId: z.string().min(1).max(100), flop: z.string().length(6), history: z.array(z.string().max(10)).max(20).optional(), hand: z.string().min(2).max(3).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => getSavedPostflopRange(env.DB, args)));
  server.registerTool('evaluate_postflop_policy', {
    title: 'Evaluate one published postflop policy node',
    description: 'Read the exact published flop policy view for one reachable head-up spot, three-card flop, and legal action history. Use list_postflop_coverage for published spot IDs and policy-evaluation availability. Returns at most 169 hand classes and the exact release, policy, and input dataset hashes. It uses the same deterministic frontend AI estimate, including its defense-estimate adjustment; get_saved_postflop_range still reads only exact saved bases. Missing/unreachable paths, unsupported source families, or incomplete policy rules return unavailable without reference-mix substitution. Saved educational AI estimates only; no solver/GTO, live-game assistance, policy generation, new strategy, all-board generation, or turn/river range.',
    inputSchema: z.strictObject({ spotId: z.string().min(1).max(100), flop: z.string().length(6), history: z.array(z.string().max(10)).max(20).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => evaluatePublishedPostflopPolicy(env.DB, args)));
  if (identity.scopes.includes(HISTORY_SCOPE)) server.registerTool('get_my_learning_history', {
    title: 'Read my synced learning summary',
    description: 'Read only the signed-in account’s bounded synced practice summary and recent answer facts. Local-only browser history is unavailable. Scores compare saved AI estimates; they do not measure real-game skill or profit. Never accepts another account identifier.',
    inputSchema: z.strictObject({ limit: z.number().int().min(1).max(50).optional() }), annotations,
  }, args => run(HISTORY_SCOPE, () => getOwnLearningHistory(env.DB, identity.userId, args)));
  return server;
}

export function mcpHandler(env: McpEnv, config: McpConfiguration, identity: Identity) {
  return createMcpHandler(() => createServer(env, config, identity), {
    route: '/mcp', responseMode: 'auto', legacy: 'stateless', corsOptions: false,
    allowedHostnames: [new URL(config.origin).hostname],
    // Full exact-origin validation (including scheme/port) is performed by index.ts before this handler.
    allowedOriginHostnames: config.allowedOrigins.map(origin => new URL(origin).hostname),
    onerror: () => {},
  });
}
