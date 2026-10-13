import type { ActionMix, FlopPolicy, Inputs, LaterPolicy, Street } from "./types.ts";
import type { PostflopSizing } from "./sizing.ts";
import type { ActionPaths, DecisionLog, Table } from "./engine.ts";
import type { BetCap, BettingCap, DefenceContext } from "./defence.ts";
import { defenceFor, comboId, finalTables, isBettingNode, rankTable, replayOrNull, requiredEquity, tierArray, VALUE_EQUITY } from "./defence.ts";
import { makeRange, equitiesVersus, releaseRangeTables } from "./range-equity.ts";
import { packWeights, unpackWeights } from "./cached-values.ts";
import { flopTextureKeys, runoutTexture, TIERS } from "./model.ts";
import { NODES, effectiveMix, withRaise } from "./policy.ts";
import { LATER_NODES, betFraction } from "./later-tree.ts";
import { flopBetFraction } from "./tree.ts";
import pilotConfig from "../data/postflop-ai-pilot.json" with { type: "json" };

// Single-only identity. The original Multi defence module and its dependency hashes stay intact.
export const SINGLE_DEFENCE_VERSION = 8;
type SizedInputs = Inputs & { sizing?: PostflopSizing };
type Defence = ReturnType<typeof defenceFor>;
type SizedDefence = Defence & { inputs: SizedInputs };
type Options = NonNullable<Parameters<typeof defenceFor>[3]>;
type PurifiedFirst = { wager: Uint8Array; fractions: Float64Array; actions: (string | null)[];
  capAfter?: { action: string; value: number; bluff: number }[] };
type SingleMethods = Pick<Defence, "releaseBoardCaches" | "trimRiverCaches" | "baseMix" | "reach" | "build" | "betting" | "entryBetting" | "buildBetting" | "bettingFacts" | "mix" | "facts"> & {
  decisionPrefix(table: Table, entry: DecisionLog): ActionPaths;
  firstKey(node: string, board: readonly number[], path: ActionPaths): string;
  capIsBinding(cap: BetCap | null | undefined): boolean;
  firstCombo(first: PurifiedFirst | null, id: number, tier: number, base: ActionMix): ActionMix | null;
  firstDecision(table: Table, board: readonly number[], node: string): PurifiedFirst | null;
  entryFirst(table: Table, board: readonly number[], entry: DecisionLog): PurifiedFirst | null;
};
type SingleDefence = SizedDefence & SingleMethods & { purifiedFirst: Record<Street, Map<string, PurifiedFirst>> };
const wrappers = new WeakMap<Defence, SingleDefence>();
const original = (self: SingleDefence): Defence => Object.getPrototypeOf(self) as Defence;
const NUM_IDS = 52 * 52, NONE = 255, FRACTIONAL_WAGER = 254;
const PURIFY_LIMITS = { flop: 96, turn: 3000, river: 16000 };
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const r2 = (value: number): number => Math.round(value * 100) / 100;
const isAggressive = (action: string): boolean => action.startsWith("bet") || action === "allin" || action === "raise";
const streetOf = (node: string): Street => LATER_NODES[node] ? node.split("_")[0] as Street : "flop";
// Independent of the original module's texture cache as well as its range/policy caches.
const textures = new Map<string, string>();
const textureOf = (street: Street, board: readonly number[]): string => {
  if (street === "flop") return flopTextureKeys(board)[0];
  const key = board.join(",");
  let value = textures.get(key);
  if (value === undefined) {
    if (textures.size > 50000) textures.clear();
    textures.set(key, value = runoutTexture(board));
  }
  return value;
};

// The original model is the prototype, not shared mutable state. Its inherited methods dispatch
// through these overrides and read only this wrapper's own policy-dependent instance caches.
export function singleSizeDefenceFor(inputs: SizedInputs, flop: FlopPolicy, later: LaterPolicy | null = null, options: Options = {}): SingleDefence {
  const base = defenceFor(inputs, flop, later, options);
  let wrapper = wrappers.get(base);
  if (!wrapper) {
    wrapper = Object.assign(Object.create(base) as SingleDefence, {
      base: new Map(), rules: new Map(), largeRun: false, stages: new Map(),
      contexts: { flop: new Map(), turn: new Map(), river: new Map() },
      bets: { flop: new Map(), turn: new Map(), river: new Map() },
      bettingFactRanges: { flop: new Map(), turn: new Map(), river: new Map() },
      purifiedFirst: { flop: new Map(), turn: new Map(), river: new Map() },
    }, overrides);
    wrappers.set(base, wrapper);
  }
  return wrapper;
}

export function sizedDefenceFor(inputs: SizedInputs, flop: FlopPolicy, later: LaterPolicy | null = null, options: Options = {}): SizedDefence {
  return inputs.sizing === "single" ? singleSizeDefenceFor(inputs, flop, later, options) : defenceFor(inputs, flop, later, options);
}

const overrides: SingleMethods & ThisType<SingleDefence> = {
  releaseBoardCaches() {
    this.stages.clear();
    for (const group of [this.contexts, this.bets, this.bettingFactRanges, this.purifiedFirst]) {
      for (const cache of Object.values(group)) cache.clear();
    }
  },

  trimRiverCaches(limit: number) {
    if (this.inputs.sizing === "single" && this.purifiedFirst.river.size > limit) this.purifiedFirst.river.clear();
    if (this.contexts.river.size <= limit) return;
    this.contexts.river.clear(); this.bets.river.clear(); this.bettingFactRanges.river.clear();
    this.purifiedFirst.river.clear();
  },

  baseMix(table: Table, board: readonly number[], node: string, combo: readonly number[]): ActionMix {
    const entry = table.log.at(-1);
    if (entry?.node !== node) throw new Error("Policy mix needs the pending decision");
    const tier = tierArray(board)[comboId(combo[0], combo[1])];
    if (tier === NONE) throw new Error("Invalid private hand or board");
    const base = this.policyRule(entry, textureOf(entry.street, board), tier);
    if (this.inputs.sizing === "single" && node.endsWith("_first")) {
      const first = this.firstDecision(table, board, node);
      return this.firstCombo(first, comboId(combo[0], combo[1]), tier, base) ?? base;
    }
    return base;
  },

  decisionPrefix(table: Table, entry: DecisionLog): ActionPaths {
    const order: Street[] = ["flop", "turn", "river"], at = order.indexOf(entry.street);
    return Object.fromEntries(order.map((name, i) => [name,
      i < at ? [...table.path[name]] : i === at ? table.path[name].slice(0, entry.index) : []])) as ActionPaths;
  },

  firstKey(node: string, board: readonly number[], path: ActionPaths): string {
    return `${node}#${board.join(",")}#${path.flop}#${path.turn}#${path.river}`;
  },

  capIsBinding(cap: BetCap | null | undefined): boolean {
    if (!cap || !(cap.factor < 1)) return false;
    if (this.inputs.sizing !== "single") return true;
    const total = cap.valueAfter + cap.bluffAfter;
    return !(total > 0) || cap.bluffAfter / total <= cap.alpha + 1e-9;
  },

  firstCombo(first: PurifiedFirst | null, id: number, tier: number, base: ActionMix): ActionMix | null {
    const action = first?.actions[tier];
    if (!action || first!.wager[id] === NONE) return null;
    // Effective support contains exactly these two actions. Keep every other saved zero key.
    const out = Object.fromEntries(Object.keys(base).map(key => [key, 0]));
    out[action] = first!.wager[id] === FRACTIONAL_WAGER ? first!.fractions[tier] : first!.wager[id]; out.check = 100 - out[action];
    return out;
  },

  firstDecision(table: Table, board: readonly number[], node: string): PurifiedFirst | null {
    if (this.inputs.sizing !== "single" || !node.endsWith("_first")) return null;
    const target = table.log.at(-1);
    if (!target || target.node !== node || target.action !== null) throw new Error("Purification needs the pending decision");
    const cache = this.purifiedFirst[target.street], key = this.firstKey(node, board, table.path);
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
    const cap = this.betting(table, board, node);
    const weights = this.rangeOf(table, board, target.seat), opponent = this.rangeOf(table, board, table.other(target.seat));
    const tiers = tierArray(board), texture = textureOf(target.street, board);
    const bases = TIERS.map((_, tier) => this.policyRule(target, texture, tier));
    const groups = TIERS.map(() => [] as number[]), supports = TIERS.map(() => new Set<string>());
    const budgets = new Float64Array(TIERS.length);
    const ids = [];
    for (let id = 0; id < NUM_IDS; id++) {
      if (!(weights[id] > 0) || tiers[id] === NONE) continue;
      const tier = tiers[id], base = bases[tier], effective = cap ? cap.apply(base, cap.kind[id], tier) : base;
      groups[tier].push(id); ids.push(id);
      for (const [action, share] of Object.entries(effective)) if (share > 0) {
        supports[tier].add(action);
        if (isAggressive(action)) budgets[tier] += weights[id] * share / 100;
      }
    }
    const first: PurifiedFirst = { wager: new Uint8Array(NUM_IDS).fill(NONE), fractions: new Float64Array(TIERS.length), actions: TIERS.map(() => null) };
    for (let tier = 0; tier < TIERS.length; tier++) {
      const actions = [...supports[tier]];
      if (actions.length === 2 && actions.includes("check")) first.actions[tier] = actions.find(isAggressive) ?? null;
    }
    if (first.actions.some(Boolean)) {
      const rankedIds = ids.filter(id => first.actions[tiers[id]]);
      const range = makeRange(opponent), scores = equitiesVersus(range, rankedIds, [rankTable(board)]);
      const equity = new Float64Array(NUM_IDS).fill(-Infinity);
      for (let i = 0; i < rankedIds.length; i++) equity[rankedIds[i]] = scores[i] ?? -Infinity;
      releaseRangeTables(range);
      for (let tier = 0; tier < TIERS.length; tier++) {
        if (!first.actions[tier]) continue;
        groups[tier].sort((a, b) => equity[b] - equity[a] || a - b);
        let remaining = budgets[tier];
        for (const id of groups[tier]) {
          const used = Math.min(weights[id], Math.max(0, remaining));
          first.wager[id] = used === weights[id] ? 100 : used === 0 ? 0 : FRACTIONAL_WAGER;
          if (first.wager[id] === FRACTIONAL_WAGER) first.fractions[tier] = used / weights[id] * 100;
          remaining -= used;
        }
      }
    }
    // Cap facts must describe the actual effective wager range, not its pre-purification
    // distribution. Factors/apply remain the pre-purification cap for tier budget accounting.
    if (cap) for (const actionCap of cap.caps) {
      let value = 0, bluff = 0;
      for (const id of ids) {
        const tier = tiers[id], action = first.actions[tier], wager = first.wager[id];
        const share = action && wager !== NONE ? action === actionCap.action
          ? wager === FRACTIONAL_WAGER ? first.fractions[tier] : wager : 0
          : cap.apply(bases[tier], cap.kind[id], tier)[actionCap.action] ?? 0;
        const weight = weights[id] * share / 100;
        if (cap.kind[id] === 1) value += weight; else if (cap.kind[id] === 2) bluff += weight;
      }
      actionCap.valueAfter = value; actionCap.bluffAfter = bluff;
    }
    if (cap) first.capAfter = cap.caps.map(item => ({ action: item.action, value: item.valueAfter, bluff: item.bluffAfter }));
    if (cache.size >= PURIFY_LIMITS[target.street]) cache.delete(cache.keys().next().value!);
    cache.set(key, first);
    return first;
  },

  entryFirst(table: Table, board: readonly number[], entry: DecisionLog): PurifiedFirst | null {
    if (this.inputs.sizing !== "single" || !entry.node.endsWith("_first")) return null;
    if (entry === table.log.at(-1) && entry.action === null) return this.firstDecision(table, board.slice(0, entry.boardLen), entry.node);
    const prefix = this.decisionPrefix(table, entry), stageBoard = board.slice(0, entry.boardLen);
    const key = this.firstKey(entry.node, stageBoard, prefix), cache = this.purifiedFirst[entry.street];
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
    const before = replayOrNull(this.inputs, stageBoard, prefix, this.config);
    return before ? this.firstDecision(before, stageBoard, entry.node) : null;
  },

  reach(seat: string, entries: readonly DecisionLog[], board: readonly number[], table: Table | null = null): Float64Array {
    let weights = this.baseWeights(seat), key = seat;
    for (const entry of entries) {
      const stageBoard = board.slice(0, entry.boardLen);
      key += `|${stageBoard.join(",")}:${entry.node}:${entry.line}:${entry.action}`;
      // Single weights can depend on the other seat's earlier purified check/bet decision.
      // Never let its later uncapped stage reuse the old seat-only partial prefix cache.
      if (this.inputs.sizing === "single" && table) key += `#${this.firstKey(entry.node, stageBoard, this.decisionPrefix(table, entry))}`;
      // A bluff-capped decision (bluff cap) depends on the whole line, so its stage is not cached.
      const cap = table ? this.entryBetting(table, board, entry) : null;
      const first = table ? this.entryFirst(table, board, entry) : null;
      const cacheable = entry.street !== "river" && !cap;
      const saved = cacheable ? this.stages.get(key) : null;
      let next = saved ? unpackWeights(saved) : null;
      if (!next) {
        const tiers = tierArray(stageBoard), texture = textureOf(entry.street, stageBoard);
        const factors = new Float64Array(TIERS.length * 3);
        for (let tier = 0; tier < TIERS.length; tier++) {
          const base = this.policyRule(entry, texture, tier);
          for (let kind = 0; kind < 3; kind++) factors[tier * 3 + kind] = (cap ? cap.apply(base, kind, tier) : base)[entry.action!] / 100;
        }
        const kinds = cap ? cap.kind : null;
        next = new Float64Array(NUM_IDS);
        for (let id = 0; id < NUM_IDS; id++) {
          const weight = weights[id];
          if (weight > 0) {
            const tier = tiers[id], action = first?.actions[tier];
            const share = first?.wager[id] === FRACTIONAL_WAGER ? first.fractions[tier] : first?.wager[id];
            const purified = action && share !== NONE ? (entry.action === action ? share! : entry.action === "check" ? 100 - share! : 0) / 100 : null;
            next[id] = tier === NONE ? 0 : weight * (purified ?? factors[tier * 3 + (kinds ? kinds[id] : 0)]);
          }
        }
        if (cacheable) {
          if (this.stages.size >= 8000) { let drop = 800; for (const oldest of this.stages.keys()) { this.stages.delete(oldest); if (--drop <= 0) break; } }
          this.stages.set(key, this.largeRun ? packWeights(next) : next);
        }
      }
      weights = next;
    }
    // The last stage already removed the cards of its own board; cards of later streets remove
    // combos that earlier stages could not know about.
    const last = entries.at(-1);
    if (last && last.boardLen === board.length) return weights;
    const tiers = tierArray(board), out = new Float64Array(NUM_IDS);
    for (let id = 0; id < NUM_IDS; id++) if (weights[id] > 0 && tiers[id] !== NONE) out[id] = weights[id];
    return out;
  },

  build(table: Table, board: readonly number[], node: string, street: Street, key: string): DefenceContext | null {
    const context = original(this).build.call(this, table, board, node, street, key);
    if (context) context.capped = this.capIsBinding(context.facedCap);
    return context;
  },

  betting(table: Table, board: readonly number[], node: string): BettingCap | null {
    const info = original(this).betting.call(this, table, board, node);
    // Cap and allocation LRUs are independent; restore effective facts after a cap rebuild.
    if (info && node.endsWith("_first")) {
      const street = streetOf(node), key = this.firstKey(node, board, table.path);
      for (const after of this.purifiedFirst[street].get(key)?.capAfter ?? []) {
        const cap = info.caps.find(item => item.action === after.action);
        if (cap) { cap.valueAfter = after.value; cap.bluffAfter = after.bluff; }
      }
    }
    return info;
  },

  entryBetting(table: Table, board: readonly number[], entry: DecisionLog): BettingCap | null {
    if (!this.bluffCap || !isBettingNode(entry.node)) return null;
    if (entry === table.log.at(-1)) return this.betting(table, board, entry.node);
    const order: Street[] = ["flop", "turn", "river"], at = order.indexOf(entry.street), prefix: Partial<ActionPaths> = {};
    order.forEach((name, i) => { prefix[name] = i < at ? table.path[name] : i === at ? table.path[name].slice(0, entry.index) : []; });
    const stageBoard = board.slice(0, entry.boardLen);
    const cache = this.bets[entry.street];
    const key = `${entry.node}#${stageBoard.join(",")}#${prefix.flop}#${prefix.turn}#${prefix.river}`;
    if (cache.has(key)) {
      const hit = cache.get(key)!; cache.delete(key); cache.set(key, hit); return hit;
    }
    const before = replayOrNull(this.inputs, stageBoard, prefix, this.inputs.sizing === "single" ? this.config : pilotConfig);
    return before ? this.betting(before, stageBoard, entry.node) : null;
  },

  buildBetting(table: Table, board: readonly number[], node: string, street: Street): BettingCap | null {
    const { log } = table, target = log.at(-1);
    if (!target || target.node !== node || target.action !== null) throw new Error("Bluff cap needs the pending decision of the node");
    const bettor = target.seat, defender = table.other(bettor);
    // A first decision below the all-in merge cannot be capped on flop/turn. This is
    // just the engine's wager test; it avoids replaying all three non-all-in bet sizes.
    if (street !== "river" && node.endsWith("_first")) {
      const own = table.stacks[bettor];
      const limit = Math.min(own, table.stacks[defender] + table.invested[defender] - table.invested[bettor]);
      if (limit < own - 1e-9 && r2(own - r2(limit)) > 1e-9) return null;
      const amounts = (NODES[node] ?? LATER_NODES[node]).filter(isAggressive).map(action =>
        street === "flop" ? table.pot * flopBetFraction(action) : r2(table.pot * betFraction(street, action)));
      if (limit > 0 && amounts.every(amount => amount < limit * pilotConfig.later_all_in_merge_ratio &&
          r2(own - r2(Math.min(own, amount))) > 1e-9)) return null;
    }
    const caps: BetCap[] = [];
    for (const action of (NODES[node] ?? LATER_NODES[node]).filter(isAggressive)) {
      const after = replayOrNull(this.inputs, board, { flop: table.path.flop, turn: table.path.turn, river: table.path.river,
        [street]: [...table.path[street], action] }, this.inputs.sizing === "single" ? this.config : pilotConfig);
      if (!after) continue;
      // River bets and raises, and any all-in on an earlier street; other sized bets keep semi-bluffs.
      if (street !== "river" && after.stacks[bettor] > 1e-9) continue;
      const wager = r2(after.pot - target.pot);
      const call = Math.min(after.stacks[defender], r2(after.invested[bettor] - after.invested[defender]));
      caps.push({ action, alpha: requiredEquity({ potBefore: target.pot, wager, call }).required, ratio: wager / target.pot } as BetCap);
    }
    if (!caps.length) return null;
    const bettorWeights = this.reach(bettor, log.filter(entry => entry.seat === bettor && entry !== target), board, table);
    const defenderWeights = this.reach(defender, log.filter(entry => entry.seat === defender), board, table);
    const defenderRange = makeRange(defenderWeights), bettorRange = makeRange(bettorWeights);
    if (!(defenderRange.total > 0) || !(bettorRange.total > 0)) return null;
    const tables = finalTables(board), tiers = tierArray(board), texture = textureOf(target.street, board.slice(0, target.boardLen));
    // value = equity against the defender's whole range >= VALUE_EQUITY (the classification of the defence facts).
    const kind = new Uint8Array(NUM_IDS);
    const values = equitiesVersus(defenderRange, bettorRange.ids, tables);
    for (let i = 0; i < bettorRange.ids.length; i++) {
      const equity = values[i];
      if (equity !== null) kind[bettorRange.ids[i]] = equity >= VALUE_EQUITY ? 1 : 2;
    }
    // River all-in sized by SPR: a shove above the pot-ratio limit is replaced by the largest regular
    // bet for every hand; within the limit only the medium tier is moved (no thin shoves).
    const bigBet = street === "river" ? [...(NODES[node] ?? LATER_NODES[node])].reverse().find(a => a.startsWith("bet")) : null;
    const maxRatio = this.config.river_allin_max_pot_ratio;
    // A null limit switches the rule off (tests of the plain bluff cap and defence).
    const shoveCap = bigBet && maxRatio != null ? caps.find(item => item.action === "allin") : null;
    const reroute = (base: ActionMix, tier: number): ActionMix => {
      if (!shoveCap || !(base.allin > 0)) return base;
      if (!(shoveCap.ratio > maxRatio) && !["medium", "draw"].includes(TIERS[tier])) return base;
      return { ...base, allin: 0, [bigBet!]: round6((base[bigBet!] ?? 0) + base.allin) };
    };
    const baseMixes = TIERS.map((_, tier) => reroute(this.policyRule(target, texture, tier), tier));
    for (const cap of caps) {
      let value = 0, bluff = 0;
      for (const id of bettorRange.ids) {
        if (!kind[id]) continue;
        const weight = bettorWeights[id] * baseMixes[tiers[id]][cap.action] / 100;
        if (kind[id] === 1) value += weight; else bluff += weight;
      }
      const share = value + bluff > 0 ? bluff / (value + bluff) : 0;
      // Scale the bluffs down (never up) until their share of the action equals the caller's break-even.
      cap.factor = share <= cap.alpha || bluff <= 0 ? 1 : value > 0 ? cap.alpha * value / ((1 - cap.alpha) * bluff) : 0;
      Object.assign(cap, { valueBefore: value, bluffBefore: bluff, valueAfter: value, bluffAfter: bluff * cap.factor });
    }
    const passive = (NODES[node] ?? LATER_NODES[node]).includes("check") ? "check" : "call";
    const apply = (base: ActionMix, type: number, tier = -1): ActionMix => {
      base = reroute(base, tier);
      if (type !== 2) return base;
      let out: ActionMix | null = null;
      for (const cap of caps) {
        if (cap.factor >= 1) continue;
        const current = (out ?? base)[cap.action], next = round6(current * cap.factor);
        if (next === current) continue;
        out ??= { ...base };
        out[cap.action] = next; out[passive] = round6(out[passive] + current - next);
      }
      return out ?? base;
    };
    return { node, bettor, caps, kind, passive, apply,
      applyCombo: (base: ActionMix, combo: readonly number[]) => apply(base, kind[comboId(combo[0], combo[1])], tiers[comboId(combo[0], combo[1])]) };
  },

  bettingFacts(table: Table, board: readonly number[], node: string, combo: readonly number[]) {
    if (isBettingNode(node) && node.endsWith("_first")) this.firstDecision(table, board, node);
    const facts = original(this).bettingFacts.call(this, table, board, node, combo);
    const info = facts ? this.betting(table, board, node) : null;
    if (facts) for (const action of facts.actions) action.capped = this.capIsBinding(info?.caps.find(cap => cap.action === action.action));
    return facts;
  },

  mix(table: Table, board: readonly number[], node: string, combo: readonly number[], base: ActionMix): ActionMix {
    if (this.profileMode) return effectiveMix(withRaise(node, base), table.log.at(-1)?.canRaise);
    if (node.endsWith("_first")) {
      const id = comboId(combo[0], combo[1]), tier = tierArray(board)[id];
      const purified = this.firstCombo(this.firstDecision(table, board, node), id, tier, base);
      if (purified) return purified;
    }
    return original(this).mix.call(this, table, board, node, combo, base);
  },

  facts(table: Table, board: readonly number[], node: string, combo: readonly number[], base: ActionMix | null = null) {
    const facts = original(this).facts.call(this, table, board, node, combo, base);
    const context = facts ? this.context(table, board, node) : null;
    if (facts && context?.facedCap) facts.faced_action.capped = this.capIsBinding(context.facedCap);
    return facts;
  },
};
