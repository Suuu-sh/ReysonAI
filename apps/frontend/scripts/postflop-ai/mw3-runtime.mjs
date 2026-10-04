// Shared three-player Range/Agent adapter. This module is browser-safe and consumes
// explicit validated policies; it cannot load, generate or substitute missing data.
import { applyMw3Action, createMw3Table, mw3Decision, MW3_STREETS, settleMw3, startMw3Street } from './mw3-engine.mjs';
import { mw3ActionGroups, mw3ObservableMix, mw3ObservedProbability } from './mw3-actions.mjs';
import { mw3HistoryRanges } from './mw3-joint-defence.mjs';
import { mw3PolicyMix } from './mw3-policy.mjs';

function requirePolicies(inputs, policies) {
  const stagesMatch = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((street, index) => street === expected[index]);
  if (!inputs?.spot?.reachable || !policies?.flop || !policies?.later ||
      policies.flop.spot_id !== inputs.spot.id || policies.later.spot_id !== inputs.spot.id ||
      !stagesMatch(policies.flop.streets, ['flop']) || !stagesMatch(policies.later.streets, ['turn', 'river'])) {
    throw new Error('mw3 requires its own saved flop and later policies');
  }
}
export function mw3DecisionView(inputs, policies, { board, paths }) {
  requirePolicies(inputs, policies);
  const { table, ranges } = mw3HistoryRanges(inputs, policies, board, paths), decision = mw3Decision(table);
  const groups = mw3ActionGroups(table), policy = table.street === 'flop' ? policies.flop : policies.later;
  const participants = table.seats.filter(seat => !table.folded.includes(seat)).map(seat => {
    const acting = decision.seat === seat, byHand = new Map();
    for (const item of ranges[seat]) {
      const saved = acting ? mw3PolicyMix(policy, decision, item.combo, board) : null;
      const mix = saved ? Object.fromEntries(groups.map(group => [group.action, mw3ObservedProbability(groups, saved, group.action)])) : null;
      const row = byHand.get(item.hand) ?? { hand: item.hand, reachWeight: 0, combos: [], actions: acting ? Object.fromEntries(groups.map(group => [group.action, 0])) : null };
      row.reachWeight += item.weight;
      if (mix) for (const action of Object.keys(mix)) row.actions[action] += item.weight * mix[action];
      row.combos.push({ cards: item.combo, reachWeight: item.weight, tier: item.tier, actions: mix });
      byHand.set(item.hand, row);
    }
    const rows = [...byHand.values()];
    for (const row of rows) if (row.actions) for (const action of Object.keys(row.actions)) row.actions[action] /= row.reachWeight;
    const total = rows.reduce((sum, row) => sum + row.reachWeight, 0);
    const actions = acting ? Object.fromEntries(groups.map(group => [group.action, total ? rows.reduce((sum, row) => sum + row.reachWeight * row.actions[group.action], 0) / total : null])) : null;
    return { seat, originalRole: inputs.spot.roles[seat], acting, displayKind: acting ? 'current_saved_strategy' : 'historical_policy_reach',
      rows, totalReachWeight: total, actions };
  });
  return { spotId: inputs.spot.id, kind: 'mw3_srp', board, potBb: table.pot, stacks: table.stacks,
    folded: table.folded, decision, actionGroups: groups, participants, history: table.log,
    frequencySemantics: 'own_action_reach_weighted_saved_mix_observable_aliases_summed',
    rangeWeighting: 'not_joint_blocker_mass_reweighted',
    explanationFacts: decision.end ? null : { originPlayers: 3, currentPlayers: decision.players,
      activePosition: decision.activePosition, priorStreetLine: decision.line, responseType: decision.responseType,
      pendingPlayers: decision.pendingBehind.length, potBb: decision.potBb, callBb: decision.callBb,
      requiredEquity: decision.callPrice, sprAfterCall: decision.sprAfterCall, computedDefence: false } };
}

export function playMw3WithPolicies(inputs, policies, { hands, board, human = null, humanActions = [], random }) {
  requirePolicies(inputs, policies);
  if (typeof random !== "function") throw new Error("mw3 Agent requires an explicit seeded random source");
  const known = [...board, ...Object.values(hands).flat()];
  if (Object.keys(hands).sort().join() !== [...inputs.spot.seats].sort().join() || board.length !== 5 || new Set(known).size !== known.length || known.some(card => !Number.isInteger(card) || card < 0 || card > 51) ||
      inputs.spot.seats.some(seat => hands[seat]?.length !== 2) || human !== null && !inputs.spot.seats.includes(human)) throw new Error('Invalid mw3 Agent hand');
  const table = createMw3Table(inputs.spot), choices = [...humanActions];
  for (const street of MW3_STREETS) {
    if (table.winner) break;
    startMw3Street(table, street);
    const currentBoard = board.slice(0, { flop: 3, turn: 4, river: 5 }[street]);
    const policy = street === 'flop' ? policies.flop : policies.later;
    while (!mw3Decision(table).end) {
      const decision = mw3Decision(table), groups = mw3ActionGroups(table);
      let action;
      if (decision.seat === human) {
        if (!choices.length) return { status: 'awaiting', board: currentBoard, pending: { ...decision, actionGroups: groups }, table };
        action = choices.shift();
        if (!groups.some(group => group.action === action)) throw new Error('Illegal mw3 human observable action');
      } else {
        const mix = mw3ObservableMix(table, mw3PolicyMix(policy, decision, hands[decision.seat], currentBoard));
        let pick = random() * 100;
        if (!Number.isFinite(pick) || pick < 0 || pick >= 100) throw new Error('Invalid mw3 random draw');
        action = groups.at(-1).action;
        for (const group of groups) { pick -= mix[group.action]; if (pick < 0) { action = group.action; break; } }
      }
      applyMw3Action(table, action);
    }
  }
  if (choices.length) throw new Error('Unexpected mw3 human actions after hand completion');
  return { status: 'done', board: table.winner ? board.slice(0, { flop: 3, turn: 4, river: 5 }[table.street]) : board,
    settlement: settleMw3(table, hands, board), table };
}
