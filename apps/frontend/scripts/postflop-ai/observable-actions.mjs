// New-HU public actions. Saved policy labels remain latent sampling choices;
// only their physical chip transition can be observed by another player.
import { NODES, flopBetFraction, flopState, facingNode, raiseNode, raiseDepth } from './tree.ts';
import { LATER_NODES, betFraction, streetState, laterRaiseNode } from './later-tree.ts';
import pilotConfig from '../data/postflop-ai-pilot.json' with { type: 'json' };

export const NEW_HU_ACTION_MODEL_VERSION = 10;
export const usesObservableActions = spot => Boolean(spot?.history);
export const actionModelIdentity = spot => usesObservableActions(spot) ? { action_model_version: NEW_HU_ACTION_MODEL_VERSION } : {};
export const hasCurrentActionModel = (spot, report) => !usesObservableActions(spot) || report?.action_model_version === NEW_HU_ACTION_MODEL_VERSION;
const r2 = value => Math.round(value * 100) / 100;
const other = role => role === 'ip' ? 'oop' : 'ip';
const nodeActions = node => NODES[node] ?? LATER_NODES[node];
const stateFor = (street, tree, actions) => street === 'flop' ? flopState(tree, actions) : streetState(street, actions);
export const roleOfPostflopNode = node => node.startsWith('btn_') || node.startsWith('ip_') || /^(turn|river)_ip_/.test(node) ? 'ip' : 'oop';
const capOf = (stacks, committed, role) => Math.min(stacks[role], stacks[other(role)] + committed[other(role)] - committed[role]);
const canRaiseAt = (stacks, committed, role) => stacks[other(role)] > 0 && committed[role] + capOf(stacks, committed, role) > committed[other(role)];

// The actual probability law used by policy.choose and exact-ev.fillProbs.
// Preserve original ordering and the final action's remainder, without rounding
// or re-normalizing a six-decimal capped mix. Percentages in and out.
export function playedActionMass(mix, actions = Object.keys(mix)) {
  if (!Array.isArray(actions) || !actions.length || new Set(actions).size !== actions.length ||
      actions.some(action => !Number.isFinite(mix[action]) || mix[action] < 0)) throw new Error('Invalid played action mix');
  const out = {}, last = actions.length - 1;
  let cumulative = 0, previous = 0;
  for (let i = 0; i < last; i++) {
    cumulative += mix[actions[i]];
    const clipped = Math.min(Math.max(cumulative, 0), 100);
    out[actions[i]] = clipped - previous;
    previous = clipped;
  }
  out[actions[last]] = 100 - previous;
  return out;
}

// Pure street-local geometry. Never infer equivalence from labels/paid amount
// alone: fold/check/call and their terminal/next-player effects remain distinct.
export function actionProjection({ street, node, role = roleOfPostflopNode(node), pot, stacks, committed,
  config = pilotConfig, tree = 'oop_checks' }) {
  const actions = nodeActions(node);
  if (!actions || !['flop', 'turn', 'river'].includes(street) ||
      (street === 'flop' ? !NODES[node] : !node.startsWith(`${street}_`)) ||
      !['ip', 'oop'].includes(role) || role !== roleOfPostflopNode(node) ||
      !Number.isFinite(pot) || pot < 0 || ['ip', 'oop'].some(key => !Number.isFinite(stacks?.[key]) || stacks[key] < 0 ||
        !Number.isFinite(committed?.[key]) || committed[key] < 0)) throw new Error('Invalid observable decision geometry');
  const ratio = config.later_all_in_merge_ratio, multiplier = street === 'flop' ? config.flop_check_raise_multiplier : config.later_raise_multiplier;
  if (!(ratio > 0 && ratio <= 1) || !Number.isFinite(multiplier) || multiplier < 2) throw new Error('Invalid observable sizing');
  const opponent = other(role), canRaise = canRaiseAt(stacks, committed, role), groups = new Map();
  for (const raw of actions) {
    const effective = raw === 'raise' && !canRaise ? 'call' : raw;
    let paid = 0, terminal = null, nextActor = null, nextNode = null;
    const bet = effective === 'allin' || effective.startsWith('bet');
    if (bet || effective === 'raise') {
      const limit = capOf(stacks, committed, role);
      let amount;
      if (effective === 'allin') amount = limit;
      else if (effective === 'raise') amount = street === 'flop'
        ? r2(committed[opponent] * multiplier) - committed[role]
        : r2(committed[opponent] * multiplier - committed[role]);
      else amount = street === 'flop' ? pot * flopBetFraction(effective) : r2(pot * betFraction(street, effective));
      paid = r2(Math.min(stacks[role], amount >= limit * ratio ? limit : amount));
      nextActor = opponent;
      if (bet) nextNode = street === 'flop' ? facingNode(role, effective)
        : `${street}_${opponent}_vs_${effective === 'allin' ? 'allin' : effective.slice(3)}`;
      else {
        const depth = raiseDepth(node) + 1;
        // Odd prior depth faces the original bettor; even depth faces the responder.
        const bettor = raiseDepth(node) % 2 ? role : opponent;
        nextNode = street === 'flop' ? raiseNode(depth, bettor) : laterRaiseNode(street, depth, bettor);
      }
    } else if (effective === 'call') { paid = r2(Math.min(stacks[role], committed[opponent] - committed[role])); terminal = 'call'; }
    else if (effective === 'fold') terminal = 'fold';
    else if (effective === 'check') {
      if (role === 'oop') { nextActor = 'ip'; nextNode = street === 'flop' ? 'btn_first' : `${street}_ip_first`; }
      else terminal = 'check';
    } else throw new Error(`Unknown observable action: ${raw}`);
    if (!Number.isFinite(paid) || paid < 0) throw new Error('Invalid observable wager');
    const nextStacks = { ...stacks, [role]: r2(stacks[role] - paid) };
    const nextCommitted = { ...committed, [role]: r2(committed[role] + paid) };
    const nextCanRaise = Boolean(nextActor && nodeActions(nextNode)?.includes('raise') && canRaiseAt(nextStacks, nextCommitted, nextActor));
    const family = bet ? 'bet' : effective;
    const allIn = paid > 0 && (nextStacks[role] === 0 || (bet || effective === 'raise') && paid === r2(capOf(stacks, committed, role)));
    const key = JSON.stringify([family, paid, nextCommitted.ip, nextCommitted.oop, nextStacks.ip, nextStacks.oop,
      terminal, nextActor, nextCanRaise]);
    let group = groups.get(key);
    if (!group) groups.set(key, group = { action: effective, aliases: [], key, paid, amountBb: nextCommitted[role], allIn,
      family, terminal, nextActor, canRaise: nextCanRaise, pot: r2(pot + paid), stacks: nextStacks, committed: nextCommitted });
    group.aliases.push(raw);
    if (raw === 'allin') group.action = 'allin';
  }
  const classes = [...groups.values()];
  for (const group of classes) if (group.family === 'bet' && group.aliases.length > 1 && !group.allIn && group.canRaise) {
    throw new Error('Unsupported observable non-all-in collision with legal raises');
  }
  return { node, street, role, actions: [...actions], canRaise, classes,
    byAction: Object.fromEntries(classes.flatMap(group => group.aliases.map(action => [action, group]))) };
}

export function projectActionMix(mix, observation) {
  if (!observation) return mix;
  const mass = playedActionMass(mix, observation.actions);
  return Object.fromEntries(observation.classes.map(group => [group.action, group.aliases.reduce((sum, action) => sum + mass[action], 0)]));
}

// Import/replay compatibility: validate the old structural path before erasing
// its labels. A legacy merged bet→impossible raise becomes call; explicit
// allin→raise and any suffix after an effective call remain illegal.
export function replayObservableStreet({ spot, street, actions = [], start, config = pilotConfig }) {
  const tree = spot.tree ?? 'oop_checks';
  if (!Array.isArray(actions)) throw new Error('Invalid observable action path');
  const requested = stateFor(street, tree, actions), canonical = [], steps = [];
  let pot = start?.pot ?? spot.potBb;
  let stacks = { ...(start?.stacks ?? { ip: spot.stackBb, oop: spot.stackBb }) };
  let committed = { ip: 0, oop: 0 }, aggressor = null;
  for (const source of requested.steps) {
    const state = stateFor(street, tree, canonical);
    if (state.end) throw new Error(`Illegal action after ${street} effectively ended`);
    const observation = actionProjection({ street, node: state.node, role: state.role, pot, stacks, committed, config, tree });
    let action = source.action;
    if (action === 'raise' && !observation.canRaise && nodeActions(source.node)?.includes('raise')) action = 'call';
    const group = observation.byAction[action];
    if (!group) throw new Error(`Illegal observable action at ${state.node}`);
    steps.push({ node: state.node, role: state.role, action: group.action, canRaise: observation.canRaise, observation });
    canonical.push(group.action);
    if (group.family === 'bet' || group.family === 'raise') aggressor = state.role;
    ({ pot, stacks, committed } = group);
  }
  const state = stateFor(street, tree, canonical);
  state.steps = steps;
  return { actions: canonical, state, pot, stacks, committed,
    lastAggressor: state.end?.winner ? null : state.end ? aggressor : start?.lastAggressor ?? null,
    observation: state.node ? actionProjection({ street, node: state.node, role: state.role, pot, stacks, committed, config, tree }) : null };
}

export function canonicalPostflopPath(spot, path, config = pilotConfig) {
  if (!usesObservableActions(spot)) return path;
  const out = { flop: [], turn: [], river: [] };
  let start;
  for (const street of ['flop', 'turn', 'river']) {
    const result = replayObservableStreet({ spot, street, actions: path[street] ?? [], start, config });
    out[street] = result.actions;
    if (!result.state.end || result.state.end.winner || result.stacks.ip === 0 || result.stacks.oop === 0) {
      const rest = street === 'flop' ? ['turn', 'river'] : street === 'turn' ? ['river'] : [];
      if (rest.some(name => path[name]?.length)) throw new Error('Action history continues after a pending or completed hand');
      break;
    }
    start = { pot: result.pot, stacks: result.stacks, lastAggressor: result.lastAggressor };
  }
  return out;
}

// A caller may still carry an old size-facing node alongside a valid imported
// path. Accept only a member of the immediately faced observable class, never
// an arbitrary known node or a fabricated all-in node.
export function canonicalNodeForTable(table, requested) {
  if (!usesObservableActions(table.spot)) return requested;
  const pending = table.log.at(-1);
  if (!pending || pending.action !== null || !nodeActions(requested)) throw new Error('Invalid observable pending node');
  if (requested === pending.node) return requested;
  const prior = table.log.at(-2), group = prior?.observation?.byAction[prior.action];
  if (prior?.street === pending.street && prior.seat !== pending.seat && group?.family === 'bet') {
    const role = prior.seat === table.spot.ip ? 'ip' : 'oop';
    const aliases = group.aliases.map(action => prior.street === 'flop' ? facingNode(role, action)
      : `${prior.street}_${other(role)}_vs_${action === 'allin' ? 'allin' : action.slice(3)}`);
    if (aliases.includes(requested)) return pending.node;
  }
  throw new Error(`Observable node does not match history: ${requested}`);
}
