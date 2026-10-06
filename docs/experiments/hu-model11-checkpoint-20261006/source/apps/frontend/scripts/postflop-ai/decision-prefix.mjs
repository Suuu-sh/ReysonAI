import { replayDecision } from './defence.mjs';
import { canonicalPostflopPath } from './observable-actions.mjs';
import { MAX_RAISES } from './tree.mjs';
import { freezeSnapshot } from './effective-law-identity.mjs';

export const EFFECTIVE_PREFIX_VERSION = 1;
export const MAX_PREFIX_DECISIONS = 3 * (MAX_RAISES + 3);
export class EffectiveReachError extends Error {
  constructor(status, message) { super(message); this.name = 'EffectiveReachError'; this.status = status; }
}
const fail = message => { throw new EffectiveReachError('invalid-public-prefix', message); };
const streets = ['flop', 'turn', 'river'];
export function createDecisionPrefix(inputs, request, config = inputs.config) {
  if (!inputs.spot.history) fail('Model11 is available only for new HU spots');
  if (!request || Object.keys(request).some(key => !['board', 'path'].includes(key))) fail('Only revealed board and earlier public path are accepted');
  const { board, path } = request;
  if (!Array.isArray(board) || ![3,4,5].includes(board.length) || new Set(board).size !== board.length ||
      board.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) fail('Invalid revealed board');
  if (!path || Object.keys(path).some(key => !streets.includes(key)) || streets.some(key => path[key] !== undefined &&
      (!Array.isArray(path[key]) || path[key].some(action => typeof action !== 'string')))) fail('Invalid public action path');
  const current = board.length - 3;
  if (streets.some((name, index) => index > current && path[name]?.length)) fail('Future actions are not public at this decision');
  const revealed = [...board.slice(0, 3).sort((a,b) => b-a), ...board.slice(3)];
  let canonical, table;
  try {
    canonical = canonicalPostflopPath(inputs.spot, path, config);
    table = replayDecision(inputs, revealed, canonical, config);
  } catch (failure) {
    if (failure instanceof EffectiveReachError) throw failure;
    fail(failure.message);
  }
  const pending = table.log.at(-1);
  if (!pending || pending.action !== null || pending.boardLen !== revealed.length) fail('Expected the current pending decision');
  if (table.log.length > MAX_PREFIX_DECISIONS) fail('Public history exceeds the validated tree bound');
  return freezeSnapshot({ version: EFFECTIVE_PREFIX_VERSION, board: revealed, path: canonical,
    pending: { seat: pending.seat, node: pending.node, street: pending.street, line: pending.line,
      index: pending.index, canRaise: pending.canRaise, observation: pending.observation },
    geometry: { pot: table.pot, stacks: table.stacks, invested: table.invested }, decisionCount: table.log.length });
}
export function requestBeforeEntry(table, board, entry) {
  const at = streets.indexOf(entry.street), path = {};
  for (const [index, name] of streets.entries()) path[name] = index < at ? [...table.path[name]] : index === at ? table.path[name].slice(0, entry.index) : [];
  return { board: board.slice(0, entry.boardLen), path };
}
