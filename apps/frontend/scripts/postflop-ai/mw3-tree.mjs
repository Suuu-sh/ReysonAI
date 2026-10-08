// Finite, chip-aware tree probes. Never choose a strategy or substitute a HU branch.
import { applyMw3Action, createMw3Table, mw3Decision, startMw3Street } from './mw3-engine.mjs';

export function mw3StateKey(table) {
  return JSON.stringify({ street: table.street, stacks: table.stacks, invested: table.invested, pot: table.pot,
    folded: [...table.folded].sort(), winner: table.winner, lastAggressor: table.lastAggressor, state: table.streetState });
}

// Enumerate exact decision/terminal states with one witness each. Merging state-equivalent
// paths is valid for geometry coverage only; it MUST NOT be used to estimate reach mass.
export function probeMw3Street(start, { maxStates = 100000 } = {}) {
  if (!Number.isInteger(maxStates) || maxStates <= 0) throw new Error('Invalid mw3 probe limit');
  const clone = table => ({ ...structuredClone({ ...table, spot: null }), spot: table.spot });
  const queue = [clone(start)], seen = new Set(), nodes = new Map(), terminals = [], decisions = [];
  for (let index = 0; index < queue.length; index++) {
    const table = queue[index], key = mw3StateKey(table);
    if (seen.has(key)) continue;
    if (seen.size >= maxStates) throw new Error(`mw3 probe incomplete: exceeded ${maxStates} unique states`);
    seen.add(key);
    const decision = mw3Decision(table);
    if (decision.end) { terminals.push(table); continue; }
    const existing = nodes.get(decision.node);
    if (existing && existing.actions.join() !== decision.actions.join()) throw new Error(`mw3 node aliases different legal actions: ${decision.node}`);
    nodes.set(decision.node, { ...decision, witness: structuredClone(table.path) });
    decisions.push({ ...decision, witness: structuredClone(table.path) });
    for (const action of decision.actions) {
      const next = clone(table); applyMw3Action(next, action); queue.push(next);
    }
  }
  return { uniqueStates: seen.size, decisions, nodes: Object.fromEntries(nodes), terminals };
}

export function probeMw3Flop(spot, options) {
  const table = createMw3Table(spot); startMw3Street(table, 'flop');
  return probeMw3Street(table, options);
}

// Strict grammar used for policies. Geometry probes are responsible for furnishing
// actual witnesses; a parseable string alone is never proof that a branch is reachable.
export function describeMw3Node(node) {
  const match = /^mw3_(flop|turn|river)_(first|middle|last)_(first(?:_low_spr)?|vs_(33|75|125|allin|raise1|raise2)_(behind|closing))$/.exec(node);
  if (!match) throw new Error(`Invalid mw3 node: ${node}`);
  const [, street, role, situation, facing, behind] = match;
  const actions = situation.startsWith('first') ? ['check', 'bet33', 'bet75', 'bet125', ...(situation.endsWith('low_spr') ? ['allin'] : [])]
    : ['fold', 'call', ...(['allin', 'raise2'].includes(facing) ? [] : ['raise'])];
  return { street, role, situation, facing: facing ?? null, pendingBehind: behind === 'behind', actions };
}

export function mw3PolicyContextKey(decision) {
  return [decision.node, decision.line, decision.players, decision.activePosition,
    decision.responseType, decision.priceBand, decision.sprBand].join('|');
}

export function probeMw3Hand(spot, { maxStates = 250000 } = {}) {
  if (!Number.isInteger(maxStates) || maxStates <= 0) throw new Error('Invalid mw3 probe limit');
  const clone = table => ({ ...structuredClone({ ...table, spot: null, log: [] }), spot: table.spot });
  const first = createMw3Table(spot); startMw3Street(first, 'flop');
  const stack = [first], seen = new Set(), nodes = {}, contexts = {}, byStreet = {}, terminalKinds = {};
  let actionEdges = 0, terminals = 0;
  while (stack.length) {
    const table = stack.pop(), key = mw3StateKey(table);
    if (seen.has(key)) continue;
    if (seen.size >= maxStates) throw new Error(`mw3 full-hand probe incomplete: exceeded ${maxStates} unique states`);
    seen.add(key); byStreet[table.street] = (byStreet[table.street] ?? 0) + 1;
    const decision = mw3Decision(table);
    if (decision.end) {
      if (table.winner || table.street === 'river') {
        terminals++; const type = table.winner ? 'fold' : decision.end.type;
        terminalKinds[type] = (terminalKinds[type] ?? 0) + 1;
      } else {
        const next = clone(table); startMw3Street(next, table.street === 'flop' ? 'turn' : 'river'); stack.push(next);
      }
      continue;
    }
    const existing = nodes[decision.node];
    if (existing && existing.actions.join() !== decision.actions.join()) throw new Error(`mw3 node aliases different legal actions: ${decision.node}`);
    const witness = structuredClone(table.path);
    if (!existing) nodes[decision.node] = { ...decision, witness };
    const context = mw3PolicyContextKey(decision);
    if (!contexts[context]) contexts[context] = { ...decision, witness };
    for (const action of [...decision.actions].reverse()) {
      const next = clone(table); applyMw3Action(next, action); actionEdges++; stack.push(next);
    }
  }
  return { uniqueStates: seen.size, actionEdges, terminals, byStreet, terminalKinds, nodes, contexts,
    scope: 'all_legal_chip_states_flop_through_river_one_witness_per_equivalent_state_not_policy_reach' };
}

// The complete node contract for the three approved 100BB SRP geometries. The
// independent full-state traversals pin this inventory against actual legal play.
export function mw3RequiredPolicyNodes(streets = ['flop', 'turn', 'river']) {
  if (!Array.isArray(streets) || streets.some(street => !['flop', 'turn', 'river'].includes(street))) throw new Error('Invalid mw3 policy street set');
  const nodes = {};
  for (const street of streets) for (const role of ['first', 'middle', 'last']) {
    const endings = ['first', ...(street === 'flop' ? [] : ['first_low_spr']),
      ...['33', '75', '125', 'raise1', 'raise2', ...(street === 'flop' ? [] : ['allin'])].flatMap(size => ['behind', 'closing'].map(position => `vs_${size}_${position}`))];
    for (const ending of endings) { const node = `mw3_${street}_${role}_${ending}`; nodes[node] = describeMw3Node(node); }
  }
  return nodes;
}
