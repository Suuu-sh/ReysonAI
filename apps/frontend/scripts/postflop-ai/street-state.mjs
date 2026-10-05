// Shared HU chip/path facts. UI intent, labels and transport live in their consumers.
// Preserve the legacy replay arithmetic; new HU delegates to its observable model.
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
import { DEFAULT_SPOT_ID, spotById } from './spots.ts';
import { NODES, flopBetFraction, flopState, isFlopBet } from './tree.ts';
import { LATER_NODES, betFraction, streetState } from './later-tree.ts';
import { replayObservableStreet, usesObservableActions } from './observable-actions.mjs';

const round = value => Math.round(value * 100) / 100;
const rival = role => role === 'ip' ? 'oop' : 'ip';
const capOf = (chips, role) => Math.min(chips.stacks[role], chips.stacks[rival(role)] + chips.committed[rival(role)] - chips.committed[role]);
const nodeRoleOf = node => node.startsWith('btn_') || node.startsWith('ip_') || /^(turn|river)_ip_/.test(node) ? 'ip' : 'oop';

export function postflopGeometry(spot) {
  const base = spot?.ip && spot?.oop && Number.isFinite(spot.potBb) && Number.isFinite(spot.stackBb) ? spot : spotById(DEFAULT_SPOT_ID);
  // Completed UI contexts carry spotId rather than catalog history.
  const catalog = base.spotId ? spotById(base.spotId) : null;
  return { ...base, ...(catalog?.history ? { history: catalog.history } : {}), tree: base.tree ?? 'oop_checks' };
}

export function hasObservablePostflopActions(spot) { return usesObservableActions(postflopGeometry(spot)); }
export function canonicalStreetActions(street, actions, start, spot) {
  const g = postflopGeometry(spot);
  return usesObservableActions(g) ? replayObservableStreet({ spot: g, street, actions, start }).actions : actions;
}

export function canRaiseNow(chips, role) {
  const other = rival(role);
  return chips.stacks[other] > 0 && chips.committed[role] + capOf(chips, role) > chips.committed[other];
}
function wagerOf(chips, role, amount) {
  const limit = capOf(chips, role);
  return amount >= limit * pilot.later_all_in_merge_ratio ? { paid: round(limit), allIn: true }
    : { paid: round(Math.min(amount, chips.stacks[role])), allIn: round(Math.min(amount, chips.stacks[role])) >= chips.stacks[role] };
}

function observableOptionFacts(observation) {
  return observation.classes.map(group => {
    const { action, paid, amountBb, allIn } = group;
    let raisePercent;
    if (action === 'raise' && !allIn) {
      const role = observation.role, other = rival(role);
      const mine = group.committed[role] - paid, theirs = group.committed[other];
      const beforePot = group.pot - paid;
      raisePercent = Math.round((amountBb - theirs) / (beforePot + theirs - mine) * 100);
    }
    return { action, amountBb: action === 'call' ? paid : amountBb, allIn, paid, aliases: group.aliases,
      ...(raisePercent === undefined ? {} : { raisePercent }),
      ...(action.startsWith('bet') && !allIn ? { betPercent: Number(action.slice(3)) } : {}) };
  });
}

function buildOptionFacts(chips, role, actions, multiplier, fractionOf) {
  const other = rival(role), mine = chips.committed[role], theirs = chips.committed[other];
  const canRaise = canRaiseNow(chips, role), out = [];
  for (const action of actions) {
    if (action === 'check' || action === 'fold') out.push({ action, amountBb: 0, allIn: false, paid: 0 });
    else if (action === 'call') {
      const paid = round(Math.min(chips.stacks[role], theirs - mine));
      out.push({ action, amountBb: paid, allIn: paid >= chips.stacks[role] && paid > 0, paid });
    } else if (action === 'allin') {
      const paid = round(capOf(chips, role));
      out.push({ action, amountBb: round(mine + paid), allIn: true, paid });
    } else if (action === 'raise') {
      if (!canRaise) continue;
      const { paid, allIn } = wagerOf(chips, role, round(theirs * multiplier) - mine);
      const to = round(mine + paid), raisePercent = Math.round((to - theirs) / (chips.pot + theirs - mine) * 100);
      out.push({ action, amountBb: to, allIn, paid, raisePercent });
    } else {
      const fraction = fractionOf(action), { paid, allIn } = wagerOf(chips, role, round(chips.pot * fraction));
      out.push({ action, amountBb: round(mine + paid), allIn, paid, betPercent: Math.round(fraction * 100) });
    }
  }
  return out;
}

// Ordered legal actions are numerical facts, including merged observable classes.
// amountBb is incremental for call and total-to for wagers, matching existing consumers.
export function decisionOptionFacts(chips, node, street = 'flop') {
  if (chips?.observation) return observableOptionFacts(chips.observation);
  const role = nodeRoleOf(node);
  return street === 'flop'
    ? buildOptionFacts(chips, role, NODES[node], pilot.flop_check_raise_multiplier, flopBetFraction)
    : buildOptionFacts(chips, role, LATER_NODES[node], pilot.later_raise_multiplier, action => betFraction(street, action));
}

function observableReplay(street, actions, start, g) {
  const result = replayObservableStreet({ spot: g, street, actions, start });
  const trace = [], stacksBefore = [];
  for (const step of result.state.steps) {
    const group = step.observation.byAction[step.action];
    const option = observableOptionFacts(step.observation).find(item => item.action === step.action);
    stacksBefore.push(round(group.stacks[step.role] + group.paid));
    trace.push({ role: step.role, action: step.action, option, callAllIn: group.allIn });
  }
  const { state, stacks, committed } = result;
  const prior = state.steps.at(-1), observed = prior?.observation.byAction[prior.action];
  const facedAction = state.node && observed && ['bet', 'raise'].includes(observed.family)
    ? { action: observed.action, allIn: observed.allIn, amountBb: observed.amountBb } : null;
  let pot = result.pot;
  // Preserve the old exported replay convention: flop fold is settled, later fold is not.
  if (street === 'flop' && state.end?.winner) {
    const winner = state.end.winner, loser = rival(winner);
    pot = round(pot - Math.max(0, committed[winner] - committed[loser]));
  }
  return { g, state, pot, trace, stacks, invested: committed,
    stackNow: state.role ? stacks[state.role] : null, stacksBefore,
    end: state.end ?? null, lastAggressor: result.lastAggressor, facedAction,
    chipsNow: state.node ? { pot, committed: { ...committed }, stacks: { ...stacks }, observation: result.observation } : null };
}

export function replayFlop(actions = [], spot) {
  const g = postflopGeometry(spot);
  if (usesObservableActions(g)) return observableReplay('flop', actions, undefined, g);
  const requested = flopState(g.tree, actions), invested = { ip: 0, oop: 0 };
  let pot = g.potBb, aggressor = null;
  const left = role => round(g.stackBb - invested[role]);
  const chipsNow = () => ({ pot, committed: { ...invested }, stacks: { ip: left('ip'), oop: left('oop') } });
  const put = (role, amount) => { const value = round(Math.min(left(role), amount)); invested[role] = round(invested[role] + value); pot = round(pot + value); return value; };
  const trace = [], effective = [], canRaises = [];
  for (const { node, role, action: asked } of requested.steps) {
    const other = rival(role), can = canRaiseNow(chipsNow(), role);
    canRaises.push(can);
    let action = asked;
    if (action === 'raise' && !can) action = 'call';
    const option = decisionOptionFacts(chipsNow(), node, 'flop').find(item => item.action === action);
    if (isFlopBet(action)) { put(role, option.paid); aggressor = role; }
    else if (action === 'call') put(role, invested[other] - invested[role]);
    else if (action === 'raise') { put(role, option.paid); aggressor = role; }
    trace.push({ role, action, option, callAllIn: left(role) === 0 });
    effective.push(action);
    if (action !== asked && effective.length !== requested.steps.length) throw new Error('Illegal flop action after an effective call');
  }
  const state = flopState(g.tree, effective);
  state.steps.forEach((step, index) => { step.canRaise = canRaises[index]; });
  if (state.end && ['fold', 'raise-fold'].includes(state.end.type)) {
    const winner = state.end.winner, loser = rival(winner);
    pot = round(pot - Math.max(0, invested[winner] - invested[loser]));
  }
  return { g, state, pot, trace, stackNow: state.role ? left(state.role) : null,
    invested, stacks: { ip: left('ip'), oop: left('oop') },
    chipsNow: state.node ? { pot, committed: { ...invested }, stacks: { ip: left('ip'), oop: left('oop') } } : null,
    lastAggressor: state.end && ['call', 'raise-call'].includes(state.end.type) ? aggressor : null };
}

export function laterStart(flopActions = [], spot) {
  const { state, pot, stacks, lastAggressor } = replayFlop(flopActions, spot);
  if (!state.end || !['check', 'call', 'raise-call'].includes(state.end.type) || stacks.ip <= 0 || stacks.oop <= 0) return null;
  return { pot, stacks, lastAggressor };
}

export function replayLater(street, actions = [], start, spot) {
  if (!start || !['turn', 'river'].includes(street)) throw new Error('Invalid later-street start');
  const g = postflopGeometry(spot);
  if (usesObservableActions(g)) return observableReplay(street, actions, start, g);
  const stacks = { ip: round(start.stacks.ip), oop: round(start.stacks.oop) };
  let pot = round(start.pot), aggressor = null;
  const committed = { ip: 0, oop: 0 }, trace = [];
  const put = (role, amount) => {
    const value = round(Math.min(stacks[role], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid later-street wager');
    stacks[role] = round(stacks[role] - value);
    committed[role] = round(committed[role] + value);
    pot = round(pot + value);
    return value;
  };
  const requestedState = streetState(street, actions), actualActions = [], canRaises = [];
  for (let index = 0; index < requestedState.steps.length; index++) {
    const { node, role } = requestedState.steps[index], other = rival(role);
    let action = requestedState.steps[index].action;
    const chips = { pot, committed: { ...committed }, stacks: { ip: stacks.ip, oop: stacks.oop } };
    const can = canRaiseNow(chips, role);
    canRaises.push(can);
    if (action === 'raise' && !can) action = 'call';
    const option = decisionOptionFacts(chips, node, street).find(item => item.action === action);
    let callAllIn = false;
    if (action === 'allin' || action.startsWith('bet') || action === 'raise') { put(role, option.paid); aggressor = role; }
    else if (action === 'call') {
      const paid = put(role, round(committed[other] - committed[role]));
      callAllIn = stacks[role] === 0 && paid > 0;
    }
    trace.push({ role, action, option, callAllIn });
    actualActions.push(action);
    if (action === 'call' && requestedState.steps[index].action === 'raise' && index !== requestedState.steps.length - 1) {
      throw new Error(`Illegal action after ${street} was effectively called`);
    }
  }
  const state = streetState(street, actualActions);
  state.steps.forEach((step, index) => { step.canRaise = canRaises[index]; });
  const lastAggressor = state.end?.winner ? null : state.end ? aggressor : start.lastAggressor;
  return { state, pot, stacks, trace, end: state.end ?? null, lastAggressor,
    chipsNow: state.node ? { pot, committed: { ...committed }, stacks: { ip: stacks.ip, oop: stacks.oop } } : null };
}

const lineFor = (previousAggressor, role) => previousAggressor === null ? 'checked' : previousAggressor === role ? 'aggressor' : 'defender';
export function laterDecisionState(street, actions = [], start, spot) {
  const replayed = replayLater(street, actions, start, spot);
  if (!replayed.state.node) return { street, end: replayed.end, potBb: replayed.pot, stacks: replayed.stacks, lastAggressor: replayed.lastAggressor };
  const role = replayed.state.role;
  return { street, node: replayed.state.node, actor: postflopGeometry(spot)[role], role, potBb: replayed.pot,
    ...(replayed.facedAction ? { facedAction: replayed.facedAction } : {}),
    options: decisionOptionFacts(replayed.chipsNow, replayed.state.node, street),
    line: lineFor(start.lastAggressor ?? null, role), lastAggressor: replayed.lastAggressor };
}
