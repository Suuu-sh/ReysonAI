// Adopted HU-v7 chip/path helpers, extracted unchanged from development 7c2fe16.
// History does not select the dormant observable-v10 experiment.
import type { BettingAction, BettingState, FlopTree, PlayerRole } from "./tree.ts";
import type { LaterStreet } from "./later-tree.ts";
import type { PreviousLine, RoleValues, Street } from "./types.ts";
export type FlopGeometry = { ip: string; oop: string; potBb: number; stackBb: number; tree?: FlopTree };
export type FlopGeometryInput = { ip?: string | null; oop?: string | null; potBb?: number | null; stackBb?: number | null; tree?: FlopTree | null };
export type Chips = { pot: number; committed: RoleValues; stacks: RoleValues };
export type DecisionOption = { action: string; label: string; amountBb: number; allIn: boolean };
type PaidOption = DecisionOption & { paid: number };
export type LaterStartState = { pot: number; stacks: RoleValues; lastAggressor: PlayerRole | null };
import pilot from "../data/postflop-ai-pilot.json" with { type: "json" };
import pilotConfig from "../data/postflop-ai-pilot.json" with { type: "json" };
import { DEFAULT_SPOT_ID, spotById } from "./spots.ts";
import { NODES, flopBetFraction, flopState, isFlopBet, raiseDepth } from "./tree.ts";
import { LATER_NODES, betFraction, streetState } from "./later-tree.ts";
const round = (value: number): number => Math.round(value * 100) / 100;

function geometry(spot?: FlopGeometryInput | null) {
  const base = spot?.ip && spot?.oop && Number.isFinite(spot!.potBb) && Number.isFinite(spot.stackBb) ? spot as FlopGeometry : spotById(DEFAULT_SPOT_ID);
  return { ...base, tree: base.tree ?? "oop_checks" };
}

function replay(actions: readonly string[], spot?: FlopGeometryInput | null) {
  const g = geometry(spot);
  const requested = flopState(g.tree, actions);
  const invested = { ip: 0, oop: 0 };
  let pot = g.potBb, aggressor: PlayerRole | null = null;
  const left = (role: PlayerRole) => round(g.stackBb - invested[role]);
  const rival = (role: PlayerRole) => role === "ip" ? "oop" : "ip";
  const chipsNow = () => ({ pot, committed: { ...invested }, stacks: { ip: left("ip"), oop: left("oop") } });
  const put = (role: PlayerRole, amount: number) => { const value = round(Math.min(left(role), amount)); invested[role] = round(invested[role] + value); pot = round(pot + value); return value; };
  const history = g.tree === "oop_checks" ? [`${g.oop} Check`] : [];
  const stacks: number[] = [], effective: BettingAction[] = [], canRaises: boolean[] = [];
  for (const { node, role, action: asked } of requested.steps) {
    const name = g[role], other = rival(role);
    stacks.push(left(role));
    const can = canRaiseNow(chipsNow(), role);
    canRaises.push(can);
    let action = asked;
    if (action === "raise" && !can) action = "call";
    const option = flopOptionsFor(chipsNow(), node, role).find(item => item.action === action)!;
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
  if (state.end && ["fold", "raise-fold"].includes(state.end!.type)) {
    const winner = state.end.winner!, loser = rival(winner);
    pot = round(pot - Math.max(0, invested[winner] - invested[loser]));
  }
  const chips = { invested, stacks: { ip: left("ip"), oop: left("oop") } };
  return { g, state, pot, history, stackNow: state.role ? left(state.role) : null, ...chips,
    chipsNow: state.node ? { pot, committed: { ...invested }, stacks: { ip: left("ip"), oop: left("oop") } } : null,
    lastAggressor: state.end && ["call", "raise-call"].includes(state.end!.type) ? aggressor : null };
}

const rival = (role: PlayerRole) => role === "ip" ? "oop" : "ip";

const capOf = (chips: Chips, role: PlayerRole): number => Math.min(chips.stacks[role], chips.stacks[rival(role)] + chips.committed[rival(role)] - chips.committed[role]);

export function canRaiseNow(chips: Chips, role: PlayerRole): boolean {
  const other = rival(role);
  return chips.stacks[other] > 0 && chips.committed[role] + capOf(chips, role) > chips.committed[other];
}

function wagerOf(chips: Chips, role: PlayerRole, amount: number) {
  const limit = capOf(chips, role);
  return amount >= limit * pilot.later_all_in_merge_ratio ? { paid: round(limit), allIn: true } : { paid: round(Math.min(amount, chips.stacks[role])), allIn: round(Math.min(amount, chips.stacks[role])) >= chips.stacks[role] };
}

const optionText = {
  en: { check: "Check", fold: "Fold", call: "Call", bet: "Bet", raise: "Raise", allIn: "All-in" },
  ja: { check: "チェック", fold: "フォールド", call: "コール", bet: "ベット", raise: "レイズ", allIn: "オールイン" },
};

function buildOptions(chips: Chips, node: string, role: PlayerRole, actions: readonly string[], multiplier: number, fractionOf: (action: string) => number, locale: string): PaidOption[] {
  const t = optionText[locale as keyof typeof optionText] ?? optionText.en, other = rival(role), mine = chips.committed[role], theirs = chips.committed[other];
  const canRaise = canRaiseNow(chips, role);
  const out: PaidOption[] = [];
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

function flopOptionsFor(chips: Chips, node: string, role: PlayerRole, locale = "en") {
  return buildOptions(chips, node, role, NODES[node], pilot.flop_check_raise_multiplier, flopBetFraction, locale);
}

export function decisionOptions(chips: Chips, node: string, street: string = "flop", locale = "en"): DecisionOption[] {
  if (street === "flop") return flopOptionsFor(chips, node, nodeRoleOf(node), locale).map(({ paid, ...rest }) => rest);
  return buildOptions(chips, node, nodeRoleOf(node), LATER_NODES[node], pilotConfig.later_raise_multiplier,
    action => betFraction(street, action), locale).map(({ paid, ...rest }) => rest);
}

const buildOptionsFor = (street: string, chips: Chips, node: string, role: PlayerRole) =>
  buildOptions(chips, node, role, LATER_NODES[node], pilotConfig.later_raise_multiplier, action => betFraction(street, action), "en");

const nodeRoleOf = (node: string): PlayerRole => node.startsWith("btn_") || node.startsWith("ip_") || /^(turn|river)_ip_/.test(node) ? "ip" : "oop";

const formatBb = (value: number): string => `${Number(round(value).toFixed(2))}`;

function isFlopContinueState(state: BettingState): boolean {
  return Boolean(state.end && ["check", "call", "raise-call"].includes(state.end!.type));
}

export function laterStart(flopActions: readonly string[] = [], spot?: FlopGeometryInput | null): LaterStartState | null {
  const { g, state, pot, stacks, lastAggressor } = replay(flopActions, spot);
  if (!isFlopContinueState(state) || stacks.ip <= 0 || stacks.oop <= 0) return null;
  return { pot, stacks, lastAggressor };
}

export function replayLater(street: string, actions: readonly string[] = [], start: LaterStartState, spot?: FlopGeometryInput | null) {
  if (!start || !["turn", "river"].includes(street)) throw new Error("Invalid later-street start");
  const g = geometry(spot);
  const stacks = { ip: round(start.stacks.ip), oop: round(start.stacks.oop) };
  let pot = round(start.pot), aggressor: PlayerRole | null = null;
  const committed = { ip: 0, oop: 0 }, history: string[] = [];
  const put = (role: PlayerRole, amount: number) => {
    const value = round(Math.min(stacks[role], amount));
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid later-street wager");
    stacks[role] = round(stacks[role] - value);
    committed[role] = round(committed[role] + value);
    pot = round(pot + value);
    return value;
  };
  const cap = (role: PlayerRole) => {
    const other = role === "ip" ? "oop" : "ip";
    return Math.min(stacks[role], stacks[other] + committed[other] - committed[role]);
  };
  const wager = (role: PlayerRole, amount: number) => {
    const limit = cap(role);
    return put(role, amount >= limit * pilotConfig.later_all_in_merge_ratio ? limit : amount);
  };
  const requestedState = streetState(street, actions);
  const actualActions: string[] = [], canRaises: boolean[] = [];
  for (let index = 0; index < requestedState.steps.length; index++) {
    const { node, role } = requestedState.steps[index];
    const name = g[role], other = role === "ip" ? "oop" : "ip";
    let action = requestedState.steps[index].action;
    const chips = { pot, committed: { ...committed }, stacks: { ip: stacks.ip, oop: stacks.oop } };
    const can = canRaiseNow(chips, role);
    canRaises.push(can);
    if (action === "raise" && !can) action = "call";
    const option = buildOptionsFor(street, chips, node, role).find(item => item.action === action)!;
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

function lineFor(previousAggressor: PlayerRole | null, role: PlayerRole): PreviousLine {
  return previousAggressor === null ? "checked" : previousAggressor === role ? "aggressor" : "defender";
}

export function laterDecision(street: string, actions: readonly string[] = [], start: LaterStartState, spot?: FlopGeometryInput | null) {
  const replayed = replayLater(street, actions, start, spot);
  if (!replayed.state.node) return { street, end: replayed.end, potBb: replayed.pot, stacks: replayed.stacks, history: replayed.history, lastAggressor: replayed.lastAggressor };
  const role = replayed.state.role;
  const labelsFor = (locale: string) => Object.fromEntries(decisionOptions(replayed.chipsNow!, replayed.state.node!, street, locale).map(o => [o.action, o.label]));
  return { street, node: replayed.state.node, actor: geometry(spot)[role], role, potBb: replayed.pot,
    options: decisionOptions(replayed.chipsNow!, replayed.state.node!, street), labels: labelsFor("en"), labelsJa: labelsFor("ja"),
    line: lineFor(start.lastAggressor ?? null, role), history: replayed.history, lastAggressor: replayed.lastAggressor };
}
export { geometry, replay, formatBb, flopOptionsFor };
