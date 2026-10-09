import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import { HISTORY_SCOPE, RANGE_SCOPE, entitlementAdapter, validIdentity, type Identity } from './access.ts';
import type { McpConfiguration, McpEnv } from './config.ts';
import { getOwnLearningHistory, getSavedRange, listSavedRangeCoverage, McpDataError, MAX_POSTFLOP_SOURCE_BYTES } from './data.ts';
import { evaluatePublishedPostflopPolicy, getSavedPostflopRange, listPostflopCoverage } from './postflop-data.ts';
import { grantRevoked } from './revocation.ts';
import { accountExists } from './session.ts';

const SERVER_INSTRUCTIONS = `Answer natural-language requests in the user's language and choose the tools yourself. Never ask the user for a tool name, JSON, or an internal spot ID.

For ordinary postflop strategy, range, mix, or hand questions, first call list_postflop_coverage without arguments. Match the user's positions and preflop line to an exact published spot, and inspect policyNodeEvaluation separately from savedFlopCoverage. Follow pagination when needed. If the published flop policy supports evaluation, call evaluate_postflop_policy for the exact three-card flop and prior actions even when savedFlopCoverage reports no_saved_boards or lookupSupported is false. A saved-board search is not a prerequisite for policy evaluation.

Use get_saved_postflop_range only when the user explicitly asks for an already saved/materialized flop base or range. It reads exact stored data and never evaluates a policy. If that saved data is absent, say it is unavailable; do not substitute a policy evaluation or general poker theory.

For an oop_checks spot, the opening out-of-position check is implicit. BTN's first decision after BB checks uses history=[]; do not add a check. After BTN bets 33, BB's response uses history=["bet33"]. Use only exact legal actions; never round or map an unsupported size such as bet40 to bet33. evaluate_postflop_policy has no hand argument: for a question about AA, AKs, or another hand, read that row from its result rather than requesting a saved base just to filter a hand.

Explain returned fractional frequencies as mixed percentages (for example, 0.30 is 30%); they are a preflop-range-weighted projection, not path-conditioned frequencies or one recommended action. preflopSupport only means combos remain in the input range after blockers. A row with nodeReachable=false is not a reached-node recommendation, even if preflopSupport is true.

If an exact spot, board suit, or prior action needed for lookup is missing, ask only for that detail in natural language. For example, for “952はどう打つ？” ask for the suits and the relevant action sequence. If lookup or evaluation is unavailable, unsupported, illegal, or ended, explain that exact limitation; do not substitute another board, branch, or general poker theory as a ReysonAI result. These are educational saved AI estimates, not solver/GTO results or live-play advice.

Examples: “What is the AA mix on 2♣9♠5♥ after BTN opened and BB called?” / “BTNオープン、BBコール。BBチェック後、2♣9♠5♥のAAは？” Resolve the published BTN_open_BB_call spot, evaluate history=[], and report the AA mix as check 30%, bet33 35%, bet75 30%, bet125 5%.`;

export function createServer(env: McpEnv, config: McpConfiguration, identity: Identity) {
  const server = new McpServer({ name: 'ReysonAI', version: '0.1.0' }, { instructions: SERVER_INSTRUCTIONS });
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
    title: 'Discover published ReysonAI postflop spots',
    description: 'Discovery entry point for ordinary natural-language postflop questions: call without spotId or flop first to list published spots, policyNodeEvaluation support, and savedFlopCoverage separately. Resolve the user’s positions and preflop line to the exact published spot internally. If its published flop policy is supported, evaluate the exact board and action history even when savedFlopCoverage is no_saved_boards or lookupSupported is false; do not require a saved-board search. Supplying spotId/flop here only lists materialized saved boards or histories. Turn/river policy publication does not imply an exact saved turn/river range.',
    inputSchema: z.strictObject({ spotId: z.string().min(1).max(100).optional(), flop: z.string().length(6).optional(), offset: z.number().int().min(0).max(2_048).optional(), limit: z.number().int().min(1).max(50).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => listPostflopCoverage(env.DB, args)));
  server.registerTool('get_saved_postflop_range', {
    title: 'Read an exact saved postflop flop range',
    description: 'Use only when the user explicitly asks for an already saved/materialized postflop range or flop base. Read the exact stored range for one published spot, board, and action history; optionally select one canonical hand such as AKs. Frequencies are aggregated from stored combo mixes using stored reach weights. This is not the route for ordinary natural-language strategy, mix, or hand questions; use evaluate_postflop_policy for those. Missing saved data stays unavailable. No policy evaluation, new generation, missing-board substitution, turn/river range, live decision support, or solver output.',
    inputSchema: z.strictObject({ spotId: z.string().min(1).max(100), flop: z.string().length(6), history: z.array(z.string().max(10)).max(20).optional(), hand: z.string().min(2).max(3).optional() }), annotations,
  }, args => run(RANGE_SCOPE, () => getSavedPostflopRange(env.DB, args)));
  server.registerTool('evaluate_postflop_policy', {
    title: 'Evaluate a published flop policy mix',
    description: `Use for ordinary natural-language postflop strategy, range-mix, and hand questions across supported head-up spots and the exact 40 published HU-after-multiway spots. First call list_postflop_coverage without arguments to resolve the exact published spot and inspect policyNodeEvaluation; a supported flop policy can be evaluated even when savedFlopCoverage says no_saved_boards or lookupSupported=false. Evaluate the exact three-card board and exact legal prior actions; never round an unsupported size (bet40 is not bet33). For an oop_checks spot, BB's opening check is implicit: BTN's first decision uses history=[], and after BTN bets 33 the BB response uses history=["bet33"]. This tool has no hand argument; filter a requested hand such as AA or AKs from the returned rows. Returns at most 169 hand classes and exact release, policy, and input dataset hashes. Frequencies are fractional values (0.30 means 30%) from the Web-compatible preflop-range-weighted projection, not path-conditioned frequencies. preflopSupport means combos remain in the input range after blockers; nodeReachable means the saved action path has positive reach. Never present nodeReachable=false rows as recommendations. The response includes evaluator and defense versions. Exact published source inputs are bounded to ${MAX_POSTFLOP_SOURCE_BYTES} bytes per evaluation; multiway spots read only their indexed source rows and verified storage parts. One active evaluation per worker isolate; over-budget or busy calls return data_unavailable. On unsupported, incomplete, unreachable, or unavailable data, report the limitation without substituting another board or general theory. Educational estimates only: no solver/GTO, live-game help, policy generation, new strategy, all-board generation, or turn/river range.`,
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
