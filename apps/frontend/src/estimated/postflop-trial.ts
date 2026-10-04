import { openSizeFor, threeBetToSize } from "./sizing.ts";
import pilot from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { multiwaySpotFor, DEFAULT_SPOT_ID, fourBetSpotFor, limpSpotFor, spotById, spotFor, threeBetSpotFor } from "../../scripts/postflop-ai/spots.mjs";
import { NODES, flopBetFraction, flopState, isFlopBet, raiseDepth } from "../../scripts/postflop-ai/tree.mjs";
import { LATER_NODES, betFraction, streetState } from "../../scripts/postflop-ai/later-tree.mjs";
import { parseFlopBoard } from "../../scripts/postflop-ai/model.mjs";
import pilotConfig from "../../scripts/data/postflop-ai-pilot.json" with { type: "json" };
import { replayObservableStreet, usesObservableActions } from "../../scripts/postflop-ai/observable-actions.mjs";

export const representativeFlops = pilot.boards.map(board => parseFlopBoard(board.cards).id);
export const deck = "23456789TJQKA".split("").flatMap(rank => "shdc".split("").map(suit => `${rank}${suit}`));
export function recognizedFlop(cards) {
  if (!Array.isArray(cards) || cards.length !== 3 || cards.some(card => !deck.includes(card)) || new Set(cards).size !== 3) return null;
  try {
    return parseFlopBoard(cards.join("")).id;
  } catch {
    return null;
  }
}
const round = value => Math.round(value * 100) / 100;

// The saved heads-up flop spot a completed preflop path reaches, or null (scripts/postflop-ai/spots.mjs):
// single-raised pots (O opens, exactly one later seat C calls), 3bet pots (O opens, X 3bets, O calls),
// 4bet pots (… O 4bets, X calls) and SB's limped pots; everyone else folds.
export function flopSpotFor({ actionBlocks = [], rangeType, opener, hero, callers = [], foldedHero, pendingRaise = null, squeezeResponse = [], limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction }) {
  const savedEvents = actionBlocks.find(block => block.kind === "end")?.postflopEvents;
  if (savedEvents) return multiwaySpotFor(savedEvents);
  if (pendingRaise === "squeeze" && callers.length === 1 && squeezeResponse.length === 2) {
    const [caller] = callers, size = threeBetToSize(opener, hero, 1);
    return multiwaySpotFor([
      { seat: opener, action: "open", to_size_bb: openSizeFor(opener) },
      { seat: caller, action: "call", to_size_bb: openSizeFor(opener) },
      { seat: hero, action: "squeeze", to_size_bb: size },
      ...[opener, caller].map((seat, i) => ({ seat, action: squeezeResponse[i], to_size_bb: squeezeResponse[i] === "call" ? size : null })),
    ]);
  }
  if (rangeType === "response") return foldedHero && callers.length === 1 ? spotFor(opener, callers[0]) : null;
  if (rangeType === "three_bet") return callers.length === 0 ? threeBetSpotFor(opener, hero) : null;
  if (rangeType === "four_bet") return callers.length === 0 ? fourBetSpotFor(opener, hero) : null;
  if (rangeType === "limp") {
    if (limpAction === "check") return limpSpotFor("SB_limp_BB_check");
    if (limpAction === "raise" && limpResponseAction === "call") return limpSpotFor("SB_limp_BB_iso_call");
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_call");
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "raise" && limpFourBetAction === "call") return limpSpotFor("SB_limp_BB_iso_SB_reraise_BB_4bet_call");
  }
  return null;
}

export function completedFlopContext({ actionBlocks, rangeType, opener, hero, callers = [], foldedHero, isDefaultTable, pendingRaise = null, squeezeResponse = [], limpAction = null, limpResponseAction = null, limpReraiseAction = null, limpFourBetAction = null }) {
  const end = actionBlocks.find(block => block.kind === "end");
  if (!end || end.continuationAvailable === false || !/^\d+人でフロップへ$/.test(end.result)) return null;
  const potBb = Number(/^ポット ([\d.]+)bb$/.exec(end.pot)?.[1]);
  if (!Number.isFinite(potBb)) return null;
  let players = end.continuationTerminal?.live_participants ?? (rangeType === "limp" ? ["SB", "BB"]
    : rangeType === "response" ? [opener, ...callers] : [opener, hero]);
  const spot = flopSpotFor({ actionBlocks, rangeType, opener, hero, callers, foldedHero, pendingRaise, squeezeResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction });
  if (spot?.history) players = [spot.oop, spot.ip];
  const pilotAvailable = Boolean(spot?.reachable) && potBb === spot.potBb && Boolean(isDefaultTable);
  return {
    players, potBb, pilotAvailable,
    spotId: pilotAvailable ? spot.id : null, ip: pilotAvailable ? spot.ip : null, oop: pilotAvailable ? spot.oop : null,
    stackBb: pilotAvailable ? spot.stackBb : null, tree: pilotAvailable ? spot.tree : null,
  };
}

// Seat names, starting pot, stacks and tree of the flop; the first pilot spot when none is given.
function geometry(spot) {
  const base = spot?.ip && spot?.oop && Number.isFinite(spot.potBb) && Number.isFinite(spot.stackBb) ? spot : spotById(DEFAULT_SPOT_ID);
  // Completed UI context carries spotId rather than the catalog history itself.
  // Resolve that identifier before opting into the new-HU action model.
  const catalog = base.spotId ? spotById(base.spotId) : null;
  return { ...base, ...(catalog?.history ? { history: catalog.history } : {}), tree: base.tree ?? "oop_checks" };
}

export function hasObservablePostflopActions(spot) { return usesObservableActions(geometry(spot)); }
export function canonicalStreetActions(street, actions, start, spot) {
  const g = geometry(spot);
  return usesObservableActions(g) ? replayObservableStreet({ spot: g, street, actions, start }).actions : actions;
}

function observableOptions(observation, locale = "en") {
  const t = optionText[locale] ?? optionText.en;
  return observation.classes.map(group => {
    const { action, paid, amountBb, allIn } = group;
    let label;
    if (action === "fold" || action === "check") label = t[action];
    else if (action === "call") label = `${t.call} ${formatBb(paid)}`;
    else if (allIn) label = `${t.allIn} ${formatBb(amountBb)}`;
    else if (action === "raise") {
      const role = observation.role, other = rival(role);
      // The group's totals include this wager. Undo it to recover the facing
      // amount and pot before the action, just as the legacy label contract.
      const mine = group.committed[role] - paid, theirs = group.committed[other];
      const beforePot = group.pot - paid;
      const pct = Math.round((amountBb - theirs) / (beforePot + theirs - mine) * 100);
      label = `${t.raise} ${formatBb(amountBb)} (${pct}%)`;
    } else label = `${t.bet} ${formatBb(paid)} (${action.slice(3)}%)`;
    return { action, label, amountBb: action === "call" ? paid : amountBb, allIn, paid, aliases: group.aliases };
  });
}

// Presentation over the same new-HU transition replay as the numerical engine.
// Kept behind the catalog gate so legacy UI geometry/identities stay byte-stable.
function observableReplay(street, actions, start, g) {
  const result = replayObservableStreet({ spot: g, street, actions, start });
  const history = street === "flop" && g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  const stacksBefore = [];
  for (const step of result.state.steps) {
    const group = step.observation.byAction[step.action];
    const option = observableOptions(step.observation).find(item => item.action === step.action);
    stacksBefore.push(round(group.stacks[step.role] + group.paid));
    const label = step.action === "call" ? `Call${group.allIn ? " All-in" : ""}` : option.label;
    history.push(`${g[step.role]} ${label}`);
  }
  const { state, stacks, committed } = result;
  const prior = state.steps.at(-1), observed = prior?.observation.byAction[prior.action];
  const facedAction = state.node && observed && ["bet", "raise"].includes(observed.family)
    ? { action: observed.action, allIn: observed.allIn, amountBb: observed.amountBb } : null;
  let pot = result.pot;
  // Existing flop UI reports the settled fold pot; later UI reports before
  // settlement. Do not change that separate presentation convention here.
  if (street === "flop" && state.end?.winner) {
    const winner = state.end.winner, loser = rival(winner);
    pot = round(pot - Math.max(0, committed[winner] - committed[loser]));
  }
  return { g, state, pot, history, stacks, invested: committed,
    stackNow: state.role ? stacks[state.role] : null, stacksBefore,
    end: state.end ?? null, lastAggressor: result.lastAggressor, facedAction,
    chipsNow: state.node ? { pot, committed: { ...committed }, stacks: { ...stacks }, observation: result.observation } : null };
}

// Replays the flop actions with the same chip rules as the scripts (engine.mjs): bets are a
// fraction of the pot, raises 3× the bet, both capped by the stack; an uncalled amount is returned.
// "oop_checks": the OOP player checks, then btn_* (IP) / bb_* (OOP) nodes.
// "oop_leads": the OOP preflop raiser acts first (oop_first → ip_vs_* → oop_vs_raise).
function replay(actions, spot) {
  const g = geometry(spot);
  if (usesObservableActions(g)) return observableReplay("flop", actions, undefined, g);
  const requested = flopState(g.tree, actions);
  const invested = { ip: 0, oop: 0 };
  let pot = g.potBb, aggressor = null;
  const left = role => round(g.stackBb - invested[role]);
  const rival = role => role === "ip" ? "oop" : "ip";
  const chipsNow = () => ({ pot, committed: { ...invested }, stacks: { ip: left("ip"), oop: left("oop") } });
  const put = (role, amount) => { const value = round(Math.min(left(role), amount)); invested[role] = round(invested[role] + value); pot = round(pot + value); return value; };
  const history = g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  const stacks = [], effective = [], canRaises = [];
  for (const { node, role, action: asked } of requested.steps) {
    const name = g[role], other = rival(role);
    stacks.push(left(role));
    const can = canRaiseNow(chipsNow(), role);
    canRaises.push(can);
    let action = asked;
    if (action === "raise" && !can) action = "call";
    const option = flopOptionsFor(chipsNow(), node, role).find(item => item.action === action);
    if (action === "check") history.push(`${name} Check`);
    else if (isFlopBet(action)) { put(role, option.paid); aggressor = role; history.push(`${name} ${option.label}`); }
    else if (action === "call") { put(role, invested[other] - invested[role]); history.push(`${name} Call${left(role) === 0 ? " All-in" : ""}`); }
    else if (action === "raise") { put(role, option.paid); aggressor = role; history.push(`${name} ${option.label}`); }
    else if (action === "fold") history.push(`${name} Fold`);
    effective.push(action);
    // An impossible raise plays as a call, which ends the betting: nothing may follow it.
    if (action !== asked && effective.length !== requested.steps.length) throw new Error("Illegal flop action after an effective call");
  }
  const state = flopState(g.tree, effective);
  state.steps.forEach((step, index) => { step.canRaise = canRaises[index]; });
  if (state.end && ["fold", "raise-fold"].includes(state.end.type)) {
    const winner = state.end.winner, loser = rival(winner);
    pot = round(pot - Math.max(0, invested[winner] - invested[loser]));
  }
  const chips = { invested, stacks: { ip: left("ip"), oop: left("oop") } };
  return { g, state, pot, history, stacks, stackNow: state.role ? left(state.role) : null, ...chips,
    chipsNow: state.node ? { pot, committed: { ...invested }, stacks: { ip: left("ip"), oop: left("oop") } } : null,
    lastAggressor: state.end && ["call", "raise-call"].includes(state.end.type) ? aggressor : null };
}

// ---- amount-based action options (shared by the flop and later streets) ----
// `chips`: { pot, committed: { ip, oop } (street totals so far), stacks: { ip, oop } (remaining before acting) }.
const rival = role => role === "ip" ? "oop" : "ip";
const capOf = (chips, role) => Math.min(chips.stacks[role], chips.stacks[rival(role)] + chips.committed[rival(role)] - chips.committed[role]);
// Raising needs an opponent who is not all-in and chips beyond the call (same rule as engine.mjs).
export function canRaiseNow(chips, role) {
  const other = rival(role);
  return chips.stacks[other] > 0 && chips.committed[role] + capOf(chips, role) > chips.committed[other];
}
// A wager of `amount` chips: committing >= the merge ratio of the effective stack becomes all-in.
function wagerOf(chips, role, amount) {
  const limit = capOf(chips, role);
  return amount >= limit * pilot.later_all_in_merge_ratio ? { paid: round(limit), allIn: true } : { paid: round(Math.min(amount, chips.stacks[role])), allIn: round(Math.min(amount, chips.stacks[role])) >= chips.stacks[role] };
}
const optionText = {
  en: { check: "Check", fold: "Fold", call: "Call", bet: "Bet", raise: "Raise", allIn: "All-in" },
  ja: { check: "チェック", fold: "フォールド", call: "コール", bet: "ベット", raise: "レイズ", allIn: "オールイン" },
};
function buildOptions(chips, node, role, actions, multiplier, fractionOf, locale) {
  const t = optionText[locale] ?? optionText.en, other = rival(role), mine = chips.committed[role], theirs = chips.committed[other];
  const canRaise = canRaiseNow(chips, role);
  const out = [];
  for (const action of actions) {
    if (action === "check") out.push({ action, label: t.check, amountBb: 0, allIn: false, paid: 0 });
    else if (action === "fold") out.push({ action, label: t.fold, amountBb: 0, allIn: false, paid: 0 });
    else if (action === "call") {
      const paid = round(Math.min(chips.stacks[role], theirs - mine));
      out.push({ action, label: `${t.call} ${formatBb(paid)}`, amountBb: paid, allIn: paid >= chips.stacks[role] && paid > 0, paid });
    } else if (action === "allin") {
      const paid = round(capOf(chips, role));
      out.push({ action, label: `${t.allIn} ${formatBb(mine + paid)}`, amountBb: round(mine + paid), allIn: true, paid });
    } else if (action === "raise") {
      if (!canRaise) continue;
      const { paid, allIn } = wagerOf(chips, role, round(theirs * multiplier) - mine);
      const to = round(mine + paid), pct = Math.round((to - theirs) / (chips.pot + theirs - mine) * 100);
      const lead = allIn ? `${t.allIn} ${formatBb(to)}` : `${t.raise} ${formatBb(to)} (${pct}%)`;
      out.push({ action, label: lead, amountBb: to, allIn, paid });
    } else {
      const fraction = fractionOf(action), { paid, allIn } = wagerOf(chips, role, round(chips.pot * fraction));
      out.push({ action, label: allIn ? `${t.allIn} ${formatBb(mine + paid)}` : `${t.bet} ${formatBb(paid)} (${Math.round(fraction * 100)}%)`,
        amountBb: round(mine + paid), allIn, paid });
    }
  }
  return out;
}
function flopOptionsFor(chips, node, role, locale = "en") {
  return buildOptions(chips, node, role, NODES[node], pilot.flop_check_raise_multiplier, flopBetFraction, locale);
}
// The options of a decision with their real amounts: [{ action, label, amountBb, allIn }] (raise is dropped
// when raising is impossible). `street` is "flop", "turn" or "river"; `locale` "en" or "ja".
export function decisionOptions(chips, node, street = "flop", locale = "en") {
  if (chips?.observation) return observableOptions(chips.observation, locale).map(({ paid, ...rest }) => rest);
  if (street === "flop") return flopOptionsFor(chips, node, nodeRoleOf(node), locale).map(({ paid, ...rest }) => rest);
  return buildOptions(chips, node, nodeRoleOf(node), LATER_NODES[node], pilotConfig.later_raise_multiplier,
    action => betFraction(street, action), locale).map(({ paid, ...rest }) => rest);
}
// A bet or raise that the merge ratio turns into an all-in is the same line as the explicit all-in,
// so the action path offers it once (the explicit all-in wins).
const blockOptions = options => options
  .filter(option => !(option.allIn && option.action !== "allin" && option.action !== "call" && options.some(other => other.action === "allin")))
  .map(({ action, label }) => ({ action, label }));
const buildOptionsFor = (street, chips, node, role) =>
  buildOptions(chips, node, role, LATER_NODES[node], pilotConfig.later_raise_multiplier, action => betFraction(street, action), "en");
const nodeRoleOf = node => node.startsWith("btn_") || node.startsWith("ip_") || /^(turn|river)_ip_/.test(node) ? "ip" : "oop";

export function flopDecision(actions = [], spot) {
  const { g, state, pot, history, chipsNow, facedAction } = replay(actions, spot);
  if (state.node) {
    const options = decisionOptions(chipsNow, state.node, "flop");
    return { node: state.node, actor: g[state.role], potBb: pot, history, options, ...(facedAction ? { facedAction } : {}),
      labels: Object.fromEntries(decisionOptions(chipsNow, state.node, "flop", "en").map(o => [o.action, o.label])),
      labelsJa: Object.fromEntries(decisionOptions(chipsNow, state.node, "flop", "ja").map(o => [o.action, o.label])) };
  }
  const { type, winner } = state.end;
  const last = state.steps.at(-1);
  const result = type === "check" ? `${g[last.role]}もチェック。フロップの判断は終了です。`
    : type === "call" || type === "raise-call" ? `${g[last.role]}がコール。フロップの判断は終了です。`
    : `${g[last.role]}がフォールド。${g[winner]}の勝ちです。`;
  return { result, potBb: pot, history };
}

export function buildFlopActionBlocks(actions = [], spot) {
  const g = geometry(spot);
  const chosenActions = usesObservableActions(g) ? canonicalStreetActions("flop", actions, undefined, g) : actions;
  const blocks = g.tree === "oop_checks"
    ? [{ key: "flop-oop-check", kind: "flop-forced", position: g.oop, stack: `${g.stackBb}`, chosen: "check", options: [{ action: "check", label: "Check" }], active: false }]
    : [];
  for (let index = 0; index <= actions.length; index++) {
    const { state, stackNow, chipsNow } = replay(actions.slice(0, index), spot);
    if (!state.node) {
      const decision = flopDecision(actions.slice(0, index), spot);
      blocks.push({ key: "flop-end", kind: "end", result: decision.result, pot: `ポット ${decision.potBb}bb`, options: [] });
      break;
    }
    blocks.push({ key: `flop-${index}`, kind: "flop", flopIndex: index, position: g[state.role], stack: `${stackNow}`,
      chosen: chosenActions[index] ?? null, options: blockOptions(decisionOptions(chipsNow, state.node, "flop")), active: index === actions.length });
  }
  return blocks;
}

const formatBb = value => `${Number(round(value).toFixed(2))}`;
const foldEnd = (state, spot) => {
  const foldedRole = state.steps.at(-1)?.role;
  const winnerRole = state.end?.winner;
  return `${spot[foldedRole]}がフォールド。${spot[winnerRole]}の勝ちです。`;
};
const showdownEnd = allIn => allIn ? "オールイン・ショウダウン" : "ショーダウン";

function isFlopContinueState(state) {
  return Boolean(state.end && ["check", "call", "raise-call"].includes(state.end.type));
}

// A later street is available only after a completed, non-folded, non-all-in flop.
// `lastAggressor` remains a role (IP/OOP), matching the later policy engine.
export function laterStart(flopActions = [], spot) {
  const { g, state, pot, stacks, lastAggressor } = replay(flopActions, spot);
  if (!isFlopContinueState(state) || stacks.ip <= 0 || stacks.oop <= 0) return null;
  return { pot, stacks, lastAggressor };
}

// Replay one turn or river with the exact effective-stack and all-in merge rules used by
// scripts/postflop-ai/engine.mjs. `start` is the state at the beginning of this street.
export function replayLater(street, actions = [], start, spot) {
  if (!start || !["turn", "river"].includes(street)) throw new Error("Invalid later-street start");
  const g = geometry(spot);
  if (usesObservableActions(g)) return observableReplay(street, actions, start, g);
  const stacks = { ip: round(start.stacks.ip), oop: round(start.stacks.oop) };
  let pot = round(start.pot), aggressor = null;
  const committed = { ip: 0, oop: 0 }, history = [];
  const put = (role, amount) => {
    const value = round(Math.min(stacks[role], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid later-street wager");
    stacks[role] = round(stacks[role] - value);
    committed[role] = round(committed[role] + value);
    pot = round(pot + value);
    return value;
  };
  const cap = role => {
    const other = role === "ip" ? "oop" : "ip";
    return Math.min(stacks[role], stacks[other] + committed[other] - committed[role]);
  };
  const wager = (role, amount) => {
    const limit = cap(role);
    return put(role, amount >= limit * pilotConfig.later_all_in_merge_ratio ? limit : amount);
  };
  const requestedState = streetState(street, actions);
  const actualActions = [], canRaises = [];
  for (let index = 0; index < requestedState.steps.length; index++) {
    const { node, role } = requestedState.steps[index];
    const name = g[role], other = role === "ip" ? "oop" : "ip";
    let action = requestedState.steps[index].action;
    const chips = { pot, committed: { ...committed }, stacks: { ip: stacks.ip, oop: stacks.oop } };
    const can = canRaiseNow(chips, role);
    canRaises.push(can);
    if (action === "raise" && !can) action = "call";
    const option = buildOptionsFor(street, chips, node, role).find(item => item.action === action);
    if (action === "allin" || action.startsWith("bet") || action === "raise") {
      put(role, option.paid);
      aggressor = role;
      history.push(`${name} ${option.label}`);
    }
    if (action === "check") history.push(`${name} Check`);
    else if (action === "call") {
      const paid = put(role, round(committed[other] - committed[role]));
      history.push(`${name} Call${stacks[role] === 0 && paid > 0 ? " All-in" : ""}`);
    } else if (action === "fold") history.push(`${name} Fold`);
    actualActions.push(action);
    // The engine treats a raise that cannot reopen action as a call. Do not replay
    // impossible decisions that may follow that effective call.
    if (action === "call" && requestedState.steps[index].action === "raise") {
      if (index !== requestedState.steps.length - 1) throw new Error(`Illegal action after ${street} was effectively called`);
    }
  }
  const state = streetState(street, actualActions);
  state.steps.forEach((step, index) => { step.canRaise = canRaises[index]; });
  const lastAggressor = state.end?.winner ? null : state.end ? aggressor : start.lastAggressor;
  return { state, pot, stacks, history, end: state.end ?? null, lastAggressor,
    chipsNow: state.node ? { pot, committed: { ...committed }, stacks: { ip: stacks.ip, oop: stacks.oop } } : null };
}

function boardBlock(street, card, potBb) {
  return { key: `${street}-board`, kind: "board", cards: card ? [card] : [], street, pending: !card, potBb };
}

function appendLaterDecisionBlocks(blocks, street, actions, start, spot, hasNextStreet = false) {
  const g = geometry(spot);
  const chosenActions = usesObservableActions(g) ? canonicalStreetActions(street, actions, start, g) : actions;
  for (let index = 0; index <= actions.length; index++) {
    const replayed = replayLater(street, actions.slice(0, index), start, spot);
    const state = replayed.state;
    if (!state.node) {
      const isFold = ["fold", "raise-fold"].includes(state.end.type);
      const allIn = replayed.stacks.ip <= 0 || replayed.stacks.oop <= 0;
      if (isFold || allIn || !hasNextStreet) {
        const result = isFold ? foldEnd(state, g) : showdownEnd(allIn);
        blocks.push({ key: `${street}-end`, kind: "end", result, options: [] });
      }
      return replayed;
    }
    const role = state.role;
    blocks.push({ key: state.node, kind: "flop", street, laterIndex: index, position: g[role],
      stack: formatBb(replayed.stacks[role]), chosen: chosenActions[index] ?? null, options: blockOptions(decisionOptions(replayed.chipsNow, state.node, street)), active: index === actions.length });
  }
  return replayLater(street, actions, start, spot);
}

// Build later street board/decision blocks in action order. The end block for a normally
// completed flop is replaced by its turn block; folds and all-ins are left to the flop view.
export function buildLaterActionBlocks({ flopActions = [], turnCard = "", turnActions = [], riverCard = "", riverActions = [] } = {}, spot) {
  const turnStart = laterStart(flopActions, spot);
  if (!turnStart) return [];
  const blocks = [boardBlock("turn", turnCard, turnStart.pot)];
  if (!turnCard) return blocks;
  const turnReplay = appendLaterDecisionBlocks(blocks, "turn", turnActions, turnStart, spot, true);
  if (!turnReplay.state.end || ["fold", "raise-fold"].includes(turnReplay.state.end.type) ||
      turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) return blocks;
  const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
  blocks.push(boardBlock("river", riverCard, riverStart.pot));
  if (!riverCard) return blocks;
  appendLaterDecisionBlocks(blocks, "river", riverActions, riverStart, spot);
  return blocks;
}

function lineFor(previousAggressor, role) {
  return previousAggressor === null ? "checked" : previousAggressor === role ? "aggressor" : "defender";
}

// Presentation contract used by the local range API: the current node, actor, pot, and
// the previous-street line from the acting player's perspective.
export function laterDecision(street, actions = [], start, spot) {
  const replayed = replayLater(street, actions, start, spot);
  if (!replayed.state.node) return { street, end: replayed.end, potBb: replayed.pot, stacks: replayed.stacks, history: replayed.history, lastAggressor: replayed.lastAggressor };
  const role = replayed.state.role;
  const labelsFor = locale => Object.fromEntries(decisionOptions(replayed.chipsNow, replayed.state.node, street, locale).map(o => [o.action, o.label]));
  return { street, node: replayed.state.node, actor: geometry(spot)[role], role, potBb: replayed.pot,
    ...(replayed.facedAction ? { facedAction: replayed.facedAction } : {}),
    options: decisionOptions(replayed.chipsNow, replayed.state.node, street), labels: labelsFor("en"), labelsJa: labelsFor("ja"),
    line: lineFor(start.lastAggressor ?? null, role), history: replayed.history, lastAggressor: replayed.lastAggressor };
}
