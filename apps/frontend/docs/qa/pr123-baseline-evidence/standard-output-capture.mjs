import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, label, outputPath] = process.argv.slice(2);
if (!root || !label || !outputPath) throw new Error('Usage: <checkout-root> <label> <output-json>');
const start = process.hrtime.bigint();
const importAt = relative => import(pathToFileURL(join(root, relative)).href);
const [inputsModule, policyModule, laterPolicyModule, modelModule, explainModule, flopFactsModule,
  rangeFactsModule, laterExplainModule, balanceModule, viewsModule, generateModule] = await Promise.all([
  importAt('apps/frontend/scripts/postflop-ai/inputs.mjs'),
  importAt('apps/frontend/scripts/postflop-ai/policy.ts'),
  importAt('apps/frontend/scripts/postflop-ai/later-policy.ts'),
  importAt('apps/frontend/scripts/postflop-ai/model.ts'),
  importAt('apps/frontend/scripts/postflop-ai/explain.mjs'),
  importAt('apps/frontend/scripts/postflop-ai/flop-ui-facts.ts'),
  importAt('apps/frontend/scripts/postflop-ai/range-facts.ts'),
  importAt('apps/frontend/scripts/postflop-ai/explain-later.ts'),
  importAt('apps/frontend/scripts/postflop-ai/balance.mjs'),
  importAt('apps/frontend/scripts/postflop-ai/views.ts'),
  importAt('apps/frontend/scripts/postflop-ai/generate.mjs'),
]);
const { loadInputs } = inputsModule;
const { referencePolicyFor } = policyModule;
const { referenceLaterPolicy } = laterPolicyModule;
const { parseCards } = modelModule;
const { explainCombo } = explainModule;
const { flopUiComboFactsCanonical } = flopFactsModule;
const { flopRangeFacts } = rangeFactsModule;
const { explainLaterCombo } = laterExplainModule;
const { checkFlopBalance, checkLaterBalance } = balanceModule;
const { flopNodesCanonical } = viewsModule;
const { promptFor, promptForLater } = generateModule;
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const inputs = loadInputs('BTN_open_BB_call');
const flopPolicy = referencePolicyFor(inputs.spot.tree);
const laterPolicy = referenceLaterPolicy();
const board = 'Js8s5d';
const flop = parseCards(board, 3);
const outputs = {
  standard_flop_prompt: promptFor(inputs),
  standard_later_prompt: promptForLater(inputs),
  standard_4bp_flop_prompt: promptFor(loadInputs('HJ_open_BTN_4bp_call')),
  standard_limp_later_prompt: promptForLater(loadInputs('SB_limp_BB_iso_call')),
  flop_nodes_all: flopNodesCanonical(inputs, flopPolicy, flop),
  flop_explain_first: explainCombo({ boardCards: flop, node: 'btn_first', cards: 'AsKc', inputs, policy: flopPolicy }),
  flop_explain_facing: explainCombo({ boardCards: flop, node: 'bb_vs_75', cards: 'QsQc', prev: 'bet75', inputs, policy: flopPolicy }),
  flop_ui_facts: flopUiComboFactsCanonical({ boardCards: flop, node: 'bb_vs_75', cards: 'QsQc', history: ['bet75'], policy: flopPolicy, inputs }),
  flop_range_facts: flopRangeFacts({ inputs, policy: flopPolicy, laterPolicy, boardCards: flop, node: 'bb_vs_75', prev: 'bet75' }),
  turn_explanation: explainLaterCombo({ inputs, flopPolicy, laterPolicy, flop: board, flopActions: 'check', turn: '3c', turnActions: '', river: '', riverActions: '', cards: 'QsQc' }),
  river_explanation: explainLaterCombo({ inputs, flopPolicy, laterPolicy, flop: board, flopActions: 'check', turn: '3c', turnActions: 'check,check', river: '2h', riverActions: '', cards: 'QsQc' }),
  standard_flop_balance: checkFlopBalance(inputs, flopPolicy),
  standard_later_balance: checkLaterBalance(inputs, flopPolicy, laterPolicy),
};
const sha256 = Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, digest(value)]));
const record = {
  label,
  checkout_commit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  checkout_tree: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  source_commit: process.env.PR123_SOURCE_COMMIT || execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source_tree: process.env.PR123_SOURCE_TREE || execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  node: process.version,
  platform: process.platform,
  elapsed_ms: Number(process.hrtime.bigint() - start) / 1e6,
  input: { spot: inputs.spot.id, fingerprint: inputs.fingerprint, seat_rows_sha256: digest(inputs.seatRows), board, turn: '3c', river: '2h' },
  digest_method: 'SHA-256 of raw prompt strings and JSON.stringify(output objects), matching hu-v7-parity digest helper',
  sha256,
  outputs,
};
writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ label, checkout_commit: record.checkout_commit, checkout_tree: record.checkout_tree, source_commit: record.source_commit, source_tree: record.source_tree, node: record.node, platform: record.platform, elapsed_ms: record.elapsed_ms, input: record.input, sha256 }));
