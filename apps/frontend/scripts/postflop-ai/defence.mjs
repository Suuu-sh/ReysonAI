import { makeRange, indexOf, weightOf, equityVersus, equitiesVersus, releaseRangeTables } from "./range-equity.mjs";
import { packEquities, packWeights, unpackWeights } from "./cached-values.mjs";
// Computed defence (call / fold) at facing nodes of the heads-up postflop pilot.
//
// The AI policies give every facing decision a fixed mix per hand tier, so their calls ignore the
// bet size, the bettor's value / bluff mix, where a hand sits inside its tier and blockers. This
// module replaces the call / fold part of those mixes with a calculation (docs/postflop-defence.md):
//
//   1. Bettor range B = the aggressor's saved range, scaled by the AI policy probability of every
//      earlier action of that seat including the bet / raise that is faced (the same range scaling as
//      the views: policy mixes, never the defended ones). Removing board cards and, per defender
//      combo, the bettor combos that share a card with it gives the blocker effect.
//   2. Equity of the defender combo against B (ties count half): exact on the river and the turn
//      (all remaining rivers), a seeded sample of FLOP_RUNOUTS runouts on the flop. Every combo is
//      ranked once per final board (lib/equity.mjs evaluate) and compared by rank.
//   3. Break-even: pot P before the aggressive action, chips W it added, call C (capped by the
//      stacks, as engine.mjs does), final pot F = P + W + C, calling wins when
//      realized equity * (F - rake(F)) - C > 0, i.e. required equity = C / (F - rake(F)).
//      River: realized = equity. Turn / flop: realized = equity * R(tier, role, street) from
//      the artifact-derived defence_realization table (an estimate, not a solved value).
//   4. The AI policy keeps its raise share. The rest (100 - raise) splits into call / fold with
//      call share = logistic((realized - required) / 0.02).
//
// Pure and dependency-free (no node:*), so it runs in the browser worker, the edge worker and Node.
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { comboRange } from "./browser-inputs.mjs";
import { boardTexture, handTier, runoutTexture, TIERS } from "./model.mjs";
import { NODES, effectiveMix, referenceMix, withRaise } from "./policy.mjs";
import { LATER_NODES } from "./later-tree.mjs";
import { referenceLaterTierMix } from "./later-policy.mjs";
import { betFraction } from "./later-tree.mjs";
import { flopBetFraction, raiseDepth } from "./tree.mjs";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake } from "./engine.mjs";
import pilotConfig from "../data/postflop-ai-pilot.json" with { type: "json" };

export const DEFENCE_VERSION = 4;
// Sampled turn+river runouts per flop decision (seeded by the flop, shared by every node of it).
export const FLOP_RUNOUTS = 300;
// call share = logistic(margin / LOGISTIC_SCALE): +-4pt of margin is about 88 / 12.
export // Allowed shortfall of computed defence under MDF before the floor adds calls.
const DEFENCE_FLOOR_MARGIN = 0.1;
const LOGISTIC_SCALE = 0.02;
// A bettor combo is "value" when its equity against the defender's whole range is at least this.
export const VALUE_EQUITY = 0.5;

const NUM_IDS = 52 * 52;
const NONE = 255;
const TIER_INDEX = Object.fromEntries(TIERS.map((tier, index) => [tier, index]));
export const comboId = (a, b) => a < b ? a * 52 + b : b * 52 + a;
// Order independent numeric key of a set of up to 5 cards (52^5 < 2^53), distinct per size.
function sortedKey(cards) {
  const n = cards.length;
  let a = cards[0], b = n > 1 ? cards[1] : 0, c = n > 2 ? cards[2] : 0, d = n > 3 ? cards[3] : 0, e = n > 4 ? cards[4] : 0, t;
  if (n > 1) { if (a > b) { t = a; a = b; b = t; } }
  if (n > 2) { if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } }
  if (n > 3) { if (c > d) { t = c; c = d; d = t; } if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } }
  if (n > 4) { if (d > e) { t = d; d = e; e = t; } if (c > d) { t = c; c = d; d = t; } if (b > c) { t = b; b = c; c = t; } if (a > b) { t = a; a = b; b = t; } }
  return n * 52 ** 5 + (((a * 52 + b) * 52 + c) * 52 + d) * 52 + e;
}
const round6 = value => Math.round(value * 1e6) / 1e6;
const round4 = value => Math.round(value * 1e4) / 1e4;

const textures = new Map();
const textureOf = (street, board) => {
  if (street === "flop") return boardTexture(board);
  const key = board.join(",");
  let value = textures.get(key);
  if (value === undefined) {
    if (textures.size > 50000) textures.clear();
    textures.set(key, value = runoutTexture(board));
  }
  return value;
};
const isAggressive = action => action.startsWith("bet") || action === "allin" || action === "raise";
const r2 = value => Math.round(value * 100) / 100;
// A betting decision: a first / lead node, or a facing node where the actor may raise.
export const isBettingNode = node => node.endsWith("_first") || Boolean(NODES[node]?.includes("raise") || LATER_NODES[node]?.includes("raise"));
export const isFacingNode = node => Boolean(NODES[node]?.includes("call") || LATER_NODES[node]?.includes("call"));
const streetOf = node => LATER_NODES[node] ? node.split("_")[0] : "flop";

// Break-even bookkeeping of a facing decision. `call` is the chips the defender still has to put in
// (already capped by its stack). Pure so the formula can be tested on its own.
export function requiredEquity({ potBefore, wager, call }) {
  const finalPot = potBefore + wager + call, fee = rake(finalPot);
  return { finalPot, rake: fee, required: call > 0 ? call / (finalPot - fee) : 0,
    mdf: potBefore / (potBefore + wager) };
}

export const logistic = value => 1 / (1 + Math.exp(-value));

// Splits the non-raise part of a policy mix into call / fold. `base` is the AI policy mix
// ({ fold, call } or { fold, call, raise }); the raise share is kept. Whole percentages, sum 100.
export function splitMix(base, callShare) {
  const raise = base.raise ?? 0, rest = round6(100 - raise);
  // Whole percentages, unless the bluff cap left a fractional raise share (then two decimals).
  const call = Math.min(rest, Math.max(0, Number.isInteger(raise) ? Math.round(rest * callShare) : Math.round(rest * callShare * 100) / 100));
  return "raise" in base ? { fold: round6(rest - call), call, raise } : { fold: round6(rest - call), call };
}

// ---------------------------------------------------------------------------------------------
// Board level caches (independent of ranges and policies, shared by every Defence instance).
// ---------------------------------------------------------------------------------------------
const tableCache = new Map();
const TABLE_LIMIT = 3000;

// Ranks of all combos on a 5 card board: score[id] (-1 when the combo touches the board) and the
// unblocked ids sorted by score.
export function rankTable(board) {
  const key = sortedKey(board);
  const cached = tableCache.get(key);
  if (cached) return cached;
  if (tableCache.size >= TABLE_LIMIT) {
    let drop = Math.floor(TABLE_LIMIT / 10);
    for (const oldest of tableCache.keys()) { tableCache.delete(oldest); if (--drop <= 0) break; }
  }
  const score = new Int32Array(NUM_IDS).fill(-1);
  const blocked = new Uint8Array(52);
  for (const card of board) blocked[card] = 1;
  const ids = [], hand = [0, 0, ...board];
  for (let a = 0; a < 52; a++) {
    if (blocked[a]) continue;
    for (let b = a + 1; b < 52; b++) {
      if (blocked[b]) continue;
      hand[0] = a; hand[1] = b;
      const id = a * 52 + b;
      score[id] = evaluate(hand);
      ids.push(id);
    }
  }
  ids.sort((x, y) => score[x] - score[y]);
  const sortedIds = Int16Array.from(ids), sortedScores = new Int32Array(ids.length);
  for (let i = 0; i < ids.length; i++) sortedScores[i] = score[ids[i]];
  const table = { score, sortedIds, sortedScores };
  tableCache.set(key, table);
  return table;
}

// Turn/flop tiers (with draws, costly) and river tiers (read off the rank table) are cached apart.
const tierCache = new Map(), riverTierCache = new Map();
const TIER_LIMIT = 3000;

// handTier index of every combo on a 3-5 card board (NONE when the combo touches the board).
export function tierArray(board) {
  const key = sortedKey(board), cache = board.length === 5 ? riverTierCache : tierCache;
  const cached = cache.get(key);
  if (cached) return cached;
  if (cache.size >= TIER_LIMIT) {
    let drop = Math.floor(TIER_LIMIT / 10);
    for (const oldest of cache.keys()) { cache.delete(oldest); if (--drop <= 0) break; }
  }
  const out = new Uint8Array(NUM_IDS).fill(NONE);
  const table = board.length === 5 ? rankTable(board) : null;
  const blocked = new Uint8Array(52);
  let top = 0;
  for (const card of board) { blocked[card] = 1; top = Math.max(top, card >> 2); }
  for (let a = 0; a < 52; a++) {
    if (blocked[a]) continue;
    for (let b = a + 1; b < 52; b++) {
      if (blocked[b]) continue;
      const id = a * 52 + b;
      if (table) {
        // handTier on a river board (no draws) read off the rank: made hand category >> 20.
        const category = table.score[id] >>> 20, rankA = a >> 2, rankB = b >> 2;
        out[id] = category >= 2 ? 0 : category === 1
          ? (rankA === rankB && rankA > top || rankA === top || rankB === top ? 1 : 3) : 4;
      } else out[id] = TIER_INDEX[handTier([a, b], board)];
    }
  }
  cache.set(key, out);
  return out;
}

const runoutCache = new Map();
// The seeded sample of turn+river runouts of a flop (and their rank tables).
export function flopRunouts(flop) {
  const key = flop.join(",");
  const cached = runoutCache.get(key);
  if (cached) return cached;
  if (runoutCache.size >= 16) runoutCache.delete(runoutCache.keys().next().value);
  const random = seededRandom(seedFor(`${pilotConfig.seed}|defence|flop|${[...flop].sort((x, y) => x - y).join(",")}`));
  const live = Array.from({ length: 52 }, (_, card) => card).filter(card => !flop.includes(card));
  const runouts = Array.from({ length: FLOP_RUNOUTS }, () => {
    const turn = live[Math.floor(random() * live.length)];
    let river;
    do river = live[Math.floor(random() * live.length)]; while (river === turn);
    return [turn, river];
  });
  const entry = { runouts, tables: null };
  runoutCache.set(key, entry);
  return entry;
}

// The final boards a decision on `board` is evaluated over (each as a rank table).
function finalTables(board) {
  if (board.length === 5) return [rankTable(board)];
  if (board.length === 4) {
    const tables = [];
    for (let card = 0; card < 52; card++) if (!board.includes(card)) tables.push(rankTable([...board, card]));
    return tables;
  }
  const entry = flopRunouts(board);
  return entry.tables ??= entry.runouts.map(([turn, river]) => rankTable([...board, turn, river]));
}

// ---------------------------------------------------------------------------------------------
// Replay: rebuilds the engine table (chips + decision log) at a pending decision from the actions.
// ---------------------------------------------------------------------------------------------
const STOP = Symbol("stop at the pending decision");

// The actions do not reach the requested pending decision (an illegal path, or one the engine
// resolves differently, e.g. a wager merged into an all-in). Callers may fall back to policy mixes.
export class DefencePathError extends Error {}
const pathError = message => new DefencePathError(message);

// `board` has 3-5 cards (flop, turn, river) and `path` = { flop, turn, river } holds the actions
// taken before the pending decision (the pending street's array is its history so far). Returns the
// engine table whose last log entry is the pending decision.
export function replayDecision(inputs, board, path, config = pilotConfig) {
  const spot = inputs.spot, table = createTable(spot), flop = board.slice(0, 3);
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  const actionsOf = name => path[name] ?? [];
  try {
    playFlop(table, spot.tree, (seat, node, step) => {
      const taken = actionsOf("flop");
      if (step < taken.length) return taken[step];
      if (street === "flop") throw STOP;
      throw pathError("Flop actions do not reach the requested street");
    }, config);
    if (street === "flop") throw pathError("Flop actions do not reach a pending decision");
    playLaterStreetsWithPolicy(table, flop, board.slice(3), (seat, node) => {
      const name = node.split("_")[0], taken = actionsOf(name), index = table.path[name].length;
      if (index < taken.length) return taken[index];
      if (name === street) throw STOP;
      throw pathError(`${name} actions do not reach the requested street`);
    }, config, table.lastAggressor);
    throw pathError("Actions do not reach a pending decision");
  } catch (error) {
    if (error !== STOP) throw error;
  }
  return table;
}

// replayDecision, or null when the actions do not reach a pending decision.
export function replayOrNull(inputs, board, path, config = pilotConfig) {
  try { return replayDecision(inputs, board, path, config); } catch (error) {
    if (error instanceof DefencePathError) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// The defence model of one (inputs, flop policy, later policy).
// ---------------------------------------------------------------------------------------------
const instances = new WeakMap(), uncappedInstances = new WeakMap();
const NO_LATER = {};

// One shared instance per (inputs, flopPolicy, laterPolicy) so every consumer reuses its caches.
// `bluffCap: false` (tests, comparisons) leaves every betting decision as the policy mix.
export function defenceFor(inputs, flopPolicy, laterPolicy = null, { bluffCap = true } = {}) {
  const roots = bluffCap ? instances : uncappedInstances;
  let byFlop = roots.get(inputs);
  if (!byFlop) roots.set(inputs, byFlop = new WeakMap());
  let byLater = byFlop.get(flopPolicy);
  if (!byLater) byFlop.set(flopPolicy, byLater = new WeakMap());
  const key = laterPolicy ?? NO_LATER;
  let instance = byLater.get(key);
  if (!instance) byLater.set(key, instance = new Defence(inputs, flopPolicy, laterPolicy, bluffCap));
  return instance;
}

// Contexts kept per street: a river context is small, a turn context may hold up to 46 prefix tables.
const LIMITS = { flop: 96, turn: 3000, river: 16000 };
const FACT_RANGE_LIMITS = { flop: 24, turn: 64, river: 96 };
// Small/cold requests favour shared dense stages. Only a large self-play run
// needs sparse reach storage; avoid expansion work on the interactive path.
const COMPACT_CACHE_AFTER = 4096;

class Defence {
  constructor(inputs, flopPolicy, laterPolicy, bluffCap = true) {
    this.bluffCap = bluffCap;
    this.inputs = inputs; this.flopPolicy = flopPolicy; this.laterPolicy = laterPolicy;
    this.config = inputs.config ?? pilotConfig;
    this.realization = this.config.defence_realization ?? pilotConfig.defence_realization;
    this.base = new Map();
    this.rules = new Map();
    this.largeRun = false;
    this.stages = new Map();
    this.contexts = { flop: new Map(), turn: new Map(), river: new Map() };
    this.bets = { flop: new Map(), turn: new Map(), river: new Map() };
    this.bettingFactRanges = { flop: new Map(), turn: new Map(), river: new Map() };
  }

  // Offline whole-board jobs never revisit a completed board. Release its large
  // graphs before the worker starts another board, retaining policy/base weights
  // and the large-run storage mode. No cache is cleared between hands/histories.
  releaseBoardCaches() {
    this.stages.clear();
    for (const group of [this.contexts, this.bets, this.bettingFactRanges]) {
      for (const cache of Object.values(group)) cache.clear();
    }
  }

  // Exact hand-EV visits thousands of river boards; drop the river contexts (the only large ones) once
  // more than `limit` are held. Everything else (policy, base weights, flop / turn stages) is kept.
  trimRiverCaches(limit) {
    if (this.contexts.river.size <= limit) return;
    this.contexts.river.clear(); this.bets.river.clear(); this.bettingFactRanges.river.clear();
  }

  // Saved preflop weights of a seat by combo id (no board removed).
  baseWeights(seat) {
    let weights = this.base.get(seat);
    if (!weights) {
      const rows = this.inputs.seatRows[seat];
      if (!rows) throw new Error(`Missing saved range for ${seat}`);
      weights = new Float64Array(NUM_IDS);
      for (const item of comboRange(rows, "freq", [])) weights[comboId(item.combo[0], item.combo[1])] += item.weight;
      this.base.set(seat, weights);
    }
    return weights;
  }

  // The AI policy mix of a tier at a decision (the same lookup as policyMix / laterPolicyMix).
  policyRule(entry, texture, tierIndex) {
    const flop = entry.street === "flop";
    const key = `${entry.node}|${entry.line}|${texture}|${tierIndex}|${entry.canRaise === false ? 0 : 1}`;
    let mix = this.rules.get(key);
    if (mix) return mix;
    let tier = TIERS[tierIndex];
    if (flop) {
      const rules = this.flopPolicy.rules;
      mix = (rules.find(rule => rule.node === entry.node && rule.tier === tier && rule.texture === texture) ??
        rules.find(rule => rule.node === entry.node && rule.tier === tier && rule.texture === "any"))?.mix;
    } else {
      if (entry.street === "river" && tier === "draw") tier = "medium";
      const rules = this.laterPolicy.streets[entry.street].rules;
      for (const [line, tex] of [[entry.line, texture], [entry.line, "any"], ["any", texture], ["any", "any"]]) {
        const rule = rules.find(item => item.node === entry.node && item.tier === tier && item.line === line && item.texture === tex);
        if (rule) { mix = rule.mix; break; }
      }
    }
    if (!mix && raiseDepth(entry.node) >= 2) mix = flop ? referenceMix(entry.node, tier) : referenceLaterTierMix(entry.node, tier);
    if (!mix) throw new Error(`Uncovered policy node: ${entry.node}/${texture}/${tier}`);
    // Saved *_vs_raise rules have no raise key; a raise that is impossible plays as a call.
    mix = effectiveMix(withRaise(entry.node, mix), entry.canRaise);
    this.rules.set(key, mix);
    return mix;
  }

  // The same policy lookup as policyMix/laterPolicyMix, reusing board-wide tiers and rules.
  // Engine callers already have the pending entry (including its previous-street line).
  baseMix(table, board, node, combo) {
    const entry = table.log.at(-1);
    if (entry?.node !== node) throw new Error("Policy mix needs the pending decision");
    const tier = tierArray(board)[comboId(combo[0], combo[1])];
    if (tier === NONE) throw new Error("Invalid private hand or board");
    return this.policyRule(entry, textureOf(entry.street, board), tier);
  }

  // Reach weights of a seat after `entries` (its earlier decisions, in order) by combo id: the saved
  // range times the policy probability of every action it took. Flop and turn stages are cached.
  reach(seat, entries, board, table = null) {
    let weights = this.baseWeights(seat), key = seat;
    for (const entry of entries) {
      const stageBoard = board.slice(0, entry.boardLen);
      key += `|${stageBoard.join(",")}:${entry.node}:${entry.line}:${entry.action}`;
      // A bluff-capped decision (bluff cap) depends on the whole line, so its stage is not cached.
      const cap = table ? this.entryBetting(table, board, entry) : null;
      const cacheable = entry.street !== "river" && !cap;
      const saved = cacheable ? this.stages.get(key) : null;
      let next = saved ? unpackWeights(saved) : null;
      if (!next) {
        const tiers = tierArray(stageBoard), texture = textureOf(entry.street, stageBoard);
        const factors = new Float64Array(TIERS.length * 3);
        for (let tier = 0; tier < TIERS.length; tier++) {
          const base = this.policyRule(entry, texture, tier);
          for (let kind = 0; kind < 3; kind++) factors[tier * 3 + kind] = (cap ? cap.apply(base, kind, tier) : base)[entry.action] / 100;
        }
        const kinds = cap ? cap.kind : null;
        next = new Float64Array(NUM_IDS);
        for (let id = 0; id < NUM_IDS; id++) {
          const weight = weights[id];
          if (weight > 0) { const tier = tiers[id]; next[id] = tier === NONE ? 0 : weight * factors[tier * 3 + (kinds ? kinds[id] : 0)]; }
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
  }

  // The defence context of the pending decision of `table` at `node` (null when it is not a facing
  // decision or the bettor range is empty). Cached per (node, board, actions taken).
  context(table, board, node) {
    if (!isFacingNode(node)) return null;
    const street = streetOf(node), cache = this.contexts[street];
    const key = `${node}#${board.join(",")}#${table.path.flop}#${table.path.turn}#${table.path.river}`;
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
    const context = this.build(table, board, node, street, key);
    if (cache.size >= LIMITS[street]) cache.delete(cache.keys().next().value);
    cache.set(key, context);
    if (street === "river" && cache.size >= COMPACT_CACHE_AFTER) this.largeRun = true;
    return context;
  }

  build(table, board, node, street, key) {
    const { log } = table, target = log.at(-1), prior = log.at(-2);
    if (!target || target.node !== node || target.action !== null) throw new Error("Defence needs the pending decision of the node");
    if (!prior || prior.seat === target.seat || prior.street !== target.street) return null;
    const spot = this.inputs.spot, defender = target.seat, bettor = prior.seat;
    const role = defender === spot.ip ? "ip" : "oop";
    const wager = Math.round((table.pot - prior.pot) * 100) / 100;
    const call = Math.min(table.stacks[defender], Math.round((table.invested[bettor] - table.invested[defender]) * 100) / 100);
    const chips = requiredEquity({ potBefore: prior.pot, wager, call });
    const bettorWeights = this.reach(bettor, log.filter(entry => entry.seat === bettor), board, table);
    const bettorRange = makeRange(bettorWeights);
    if (!(bettorRange.total > 0)) return null;
    const priorBetting = this.entryBetting(table, board, prior);
    const facedCap = priorBetting?.caps.find(item => item.action === prior.action) ?? null;
    return { key, node, street, board, role, bettor, defender, target, ...chips,
      potBefore: prior.pot, wager, call,
      bettorRange, defenderEntries: log.filter(entry => entry.seat === defender && entry !== target),
      table, cap: this.betting(table, board, node), tables: null, ceiling: undefined, floor: undefined,
      // The faced action was under the bluff cap: its range is at or below break-even in bluffs.
      capped: Boolean(facedCap && facedCap.factor < 1), facedCap,
      equities: new Map(), summary: null };
  }

  // The bluff cap of the pending betting decision (null when nothing is capped). See docs/postflop-defence.md.
  betting(table, board, node) {
    if (!this.bluffCap || !isBettingNode(node)) return null;
    const street = streetOf(node), cache = this.bets[street];
    const key = `${node}#${board.join(",")}#${table.path.flop}#${table.path.turn}#${table.path.river}`;
    if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
    const info = this.buildBetting(table, board, node, street);
    if (cache.size >= LIMITS[street]) cache.delete(cache.keys().next().value);
    cache.set(key, info);
    return info;
  }

  // The betting decision of `entry` (an earlier decision of the table's hand), rebuilt from the actions before it.
  entryBetting(table, board, entry) {
    if (!this.bluffCap || !isBettingNode(entry.node)) return null;
    if (entry === table.log.at(-1)) return this.betting(table, board, entry.node);
    const order = ["flop", "turn", "river"], at = order.indexOf(entry.street), prefix = {};
    order.forEach((name, i) => { prefix[name] = i < at ? table.path[name] : i === at ? table.path[name].slice(0, entry.index) : []; });
    const stageBoard = board.slice(0, entry.boardLen);
    const cache = this.bets[entry.street];
    const key = `${entry.node}#${stageBoard.join(",")}#${prefix.flop}#${prefix.turn}#${prefix.river}`;
    if (cache.has(key)) {
      const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit;
    }
    const before = replayOrNull(this.inputs, stageBoard, prefix);
    return before ? this.betting(before, stageBoard, entry.node) : null;
  }

  buildBetting(table, board, node, street) {
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
    const caps = [];
    for (const action of (NODES[node] ?? LATER_NODES[node]).filter(isAggressive)) {
      const after = replayOrNull(this.inputs, board, { flop: table.path.flop, turn: table.path.turn, river: table.path.river,
        [street]: [...table.path[street], action] });
      if (!after) continue;
      // River bets and raises, and any all-in on an earlier street; other sized bets keep semi-bluffs.
      if (street !== "river" && after.stacks[bettor] > 1e-9) continue;
      const wager = r2(after.pot - target.pot);
      const call = Math.min(after.stacks[defender], r2(after.invested[bettor] - after.invested[defender]));
      caps.push({ action, alpha: requiredEquity({ potBefore: target.pot, wager, call }).required, ratio: wager / target.pot });
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
    const reroute = (base, tier) => {
      if (!shoveCap || !(base.allin > 0)) return base;
      if (!(shoveCap.ratio > maxRatio) && !["medium", "draw"].includes(TIERS[tier])) return base;
      return { ...base, allin: 0, [bigBet]: round6((base[bigBet] ?? 0) + base.allin) };
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
    const apply = (base, type, tier = -1) => {
      base = reroute(base, tier);
      if (type !== 2) return base;
      let out = null;
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
      applyCombo: (base, combo) => apply(base, kind[comboId(combo[0], combo[1])], tiers[comboId(combo[0], combo[1])]) };
  }

  // Break-even requirement and supported bluffs for every aggressive option at a betting node.
  bettingFacts(table, board, node, combo) {
    if (!isBettingNode(node)) return null;
    const info = this.betting(table, board, node);
    const type = info?.kind[comboId(combo[0], combo[1])] ?? 0;
    const street = streetOf(node), factCache = this.bettingFactRanges[street];
    const key = `${node}#${board.join(",")}#${table.path.flop}#${table.path.turn}#${table.path.river}`;
    let rangeContext = factCache.get(key);
    if (!rangeContext) {
      const target = table.log.at(-1), defender = table.other(target.seat);
      const weights = this.reach(defender, table.log.filter(entry => entry.seat === defender), board, table);
      rangeContext = { range: makeRange(weights), tables: finalTables(board), equities: new Map() };
      if (factCache.size >= FACT_RANGE_LIMITS[street]) factCache.delete(factCache.keys().next().value);
      factCache.set(key, rangeContext);
    }
    const id = comboId(combo[0], combo[1]);
    let equityVsDefender = rangeContext.equities.get(id);
    if (equityVsDefender === undefined) {
      equityVsDefender = equityVersus(rangeContext.range, id, rangeContext.tables);
      rangeContext.equities.set(id, equityVsDefender);
    }
    const share = (value, bluff) => value + bluff > 0 ? round4(bluff / (value + bluff)) : null;
    const target = table.log.at(-1), bettor = target.seat, defender = table.other(bettor);
    const actions = (NODES[node] ?? LATER_NODES[node]).filter(isAggressive).flatMap(action => {
      const after = replayOrNull(this.inputs, board, { flop: table.path.flop, turn: table.path.turn, river: table.path.river,
        [target.street]: [...table.path[target.street], action] });
      if (!after) return [];
      const wager = r2(after.pot - target.pot);
      const call = Math.min(after.stacks[defender], r2(after.invested[bettor] - after.invested[defender]));
      const alpha = requiredEquity({ potBefore: target.pot, wager, call }).required;
      const cap = info?.caps.find(item => item.action === action);
      return [{ action, alpha: round4(alpha), bluffs_per_100_value: round4(alpha < 1 ? alpha / (1 - alpha) * 100 : 0),
        capped: Boolean(cap && cap.factor < 1), factor: round4(cap?.factor ?? 1),
        value_before: cap ? round4(cap.valueBefore) : null, bluff_before: cap ? round4(cap.bluffBefore) : null,
        bluff_share_before: cap ? share(cap.valueBefore, cap.bluffBefore) : null,
        bluff_share_before_pct: cap && share(cap.valueBefore, cap.bluffBefore) !== null ? round4(share(cap.valueBefore, cap.bluffBefore) * 100) : null,
        value_after: cap ? round4(cap.valueAfter) : null, bluff_after: cap ? round4(cap.bluffAfter) : null,
        bluff_share_after: cap ? share(cap.valueAfter, cap.bluffAfter) : null,
        bluff_share_after_pct: cap && share(cap.valueAfter, cap.bluffAfter) !== null ? round4(share(cap.valueAfter, cap.bluffAfter) * 100) : null }];
    });
    return { node, combo_class: type === 1 ? "value" : type === 2 ? "bluff" : "unranked",
      equity_vs_defender: Number.isFinite(equityVsDefender) ? round4(equityVsDefender) : null,
      passive: info?.passive ?? ((NODES[node] ?? LATER_NODES[node]).includes("check") ? "check" : "call"), actions };
  }

  // Reach weights (dense by combo id) of `seat` at the pending decision of `table`, with the bluff cap applied.
  rangeOf(table, board, seat) {
    const pending = table.log.at(-1);
    return this.reach(seat, table.log.filter(entry => entry.seat === seat && entry !== pending), board, table);
  }

  // [{ combo, weight }] of `seat` at the pending decision (reach weights, saved-range order).
  rangeItems(table, board, seat) {
    const dense = this.rangeOf(table, board, seat);
    return comboRange(this.inputs.seatRows[seat], "freq", board)
      .map(item => ({ combo: item.combo, weight: dense[comboId(item.combo[0], item.combo[1])] })).filter(item => item.weight > 0);
  }

  tablesOf(context) { return context.tables ??= finalTables(context.board); }

  // Equity of a defender combo against the bettor range (null when no bettor combo is compatible).
  equity(context, combo) {
    const id = comboId(combo[0], combo[1]);
    let value = context.equities.get(id);
    if (value === undefined) {
      value = equityVersus(context.bettorRange, id, this.tablesOf(context));
      context.equities.set(id, value);
    }
    // Keep the interactive hot lookup small/inlinable; large-run storage work is outlined.
    if (this.largeRun) this.completeEquityCache(context);
    return value;
  }

  completeEquityCache(context) {
    // Computed calls can reach a combo that the saved policy assigned zero reach.
    // Such a later query used to rebuild and retain dozens of prefix tables.
    // Complete saved preflop support only after the original three scan queries.
    if (context.floor !== undefined || context.ceiling !== undefined) {
      if (!context.completeEquities && context.bettorRange.queries >= 3) this.prime(context, null);
      else if (context.bettorRange.dense) releaseRangeTables(context.bettorRange);
    }
  }

  prime(context, weights) {
    const ids = [];
    if (weights) for (let id = 0; id < NUM_IDS; id++) if (weights[id] > 0 && !context.equities.has(id)) ids.push(id);
    if (!context.completeEquities && this.largeRun &&
        context.bettorRange.queries + ids.length >= 3) {
      const base = this.baseWeights(context.defender), tiers = tierArray(context.board);
      // Append extras after the original reach queries: their first-three scan
      // identities/order remain exactly the reference's, and extras are indexed.
      for (let id = 0; id < NUM_IDS; id++) if (base[id] > 0 && tiers[id] !== NONE &&
          !(weights?.[id] > 0) && !context.equities.has(id)) ids.push(id);
      context.completeEquities = true;
    }
    if (!ids.length) { releaseRangeTables(context.bettorRange); return; }
    const values = equitiesVersus(context.bettorRange, ids, this.tablesOf(context));
    for (let i = 0; i < ids.length; i++) context.equities.set(ids[i], values[i]);
    context.equities = packEquities(context.equities);
    releaseRangeTables(context.bettorRange);
  }

  realizationFor(context, combo) {
    if (context.street === "river") return 1;
    const tiers = context.tiers ??= tierArray(context.board);
    const factors = context.realizationFactors ??= TIERS.map(tier => {
      const value = this.realization?.[context.street]?.[context.role]?.[tier];
      return Number.isFinite(value) ? value : 1;
    });
    return factors[tiers[comboId(combo[0], combo[1])]] ?? 1;
  }

  applyEquity(context, base, equity, combo, raw = false) {
    const realized = equity * this.realizationFor(context, combo), margin = realized - context.required;
    const mix = splitMix(base, logistic(margin / LOGISTIC_SCALE));
    const floor = raw ? null : this.floorOf(context);
    if (floor) {
      const factor = realized > floor.threshold + 1e-9 ? 1 : realized >= floor.threshold - 1e-9 ? floor.fraction : 0;
      if (!(factor > 0) || !(mix.fold > 0)) return mix;
      const moved = Number.isInteger(mix.fold) && Number.isInteger(mix.call) ? Math.round(mix.fold * factor) : round6(mix.fold * factor);
      return { ...mix, fold: round6(mix.fold - moved), call: round6(mix.call + moved) };
    }
    const ceiling = raw ? null : this.ceilingOf(context);
    if (!ceiling) return mix;
    const factor = realized > ceiling.threshold + 1e-9 ? 1 : realized >= ceiling.threshold - 1e-9 ? ceiling.fraction : 0;
    if (factor >= 1) return mix;
    const call = Number.isInteger(mix.fold) && Number.isInteger(mix.call) ? Math.round(mix.call * factor) : round6(mix.call * factor);
    return { ...mix, fold: round6(mix.fold + mix.call - call), call };
  }

  // Defence ceiling. Once the bettor's bluffs are capped at the caller's break-even, every bluff-catcher
  // that beats all the bluffs sits near zero margin and the logistic would call most of them, far above
  // the minimum defence the bettor's bluffs need to break even. Against a capped range the total
  // continue frequency (calls + raises) is therefore limited to MDF, keeping the strongest hands.
  ceilingOf(context) {
    if (context.ceiling !== undefined) return context.ceiling;
    context.ceiling = null;
    if (!context.capped) return null;
    const { board } = context, entry = context.target;
    const weights = this.reach(context.defender, context.defenderEntries, board, context.table);
    this.prime(context, weights);
    const tiers = context.tiers ??= tierArray(board), texture = textureOf(entry.street, board.slice(0, entry.boardLen));
    const baseMixes = TIERS.map((_, tier) => this.policyRule(entry, texture, tier));
    const items = [];
    let total = 0, raiseWeight = 0, callWeight = 0;
    for (let id = 0; id < NUM_IDS; id++) {
      const weight = weights[id];
      if (!(weight > 0)) continue;
      const combo = [Math.floor(id / 52), id % 52];
      const equity = this.equity(context, combo);
      if (equity === null) continue;
      let base = baseMixes[tiers[id]];
      if (context.cap) base = context.cap.apply(base, context.cap.kind[id]);
      const mix = this.applyEquity(context, base, equity, combo, true);
      total += weight; raiseWeight += weight * (mix.raise ?? 0) / 100;
      const call = weight * mix.call / 100;
      callWeight += call;
      items.push({ realized: equity * this.realizationFor(context, combo), call });
    }
    const budget = Math.max(0, context.mdf * total - raiseWeight);
    if (!(callWeight > budget + 1e-9)) return null;
    items.sort((a, b) => b.realized - a.realized);
    let used = 0;
    for (let i = 0; i < items.length;) {
      let j = i, group = 0;
      while (j < items.length && Math.abs(items[j].realized - items[i].realized) <= 1e-9) group += items[j++].call;
      if (used + group > budget + 1e-12) {
        context.ceiling = { threshold: items[i].realized, fraction: group > 0 ? Math.max(0, (budget - used) / group) : 0 };
        return context.ceiling;
      }
      used += group; i = j;
    }
    return null;
  }

  // Defence floor. Against an uncapped action the bettor may under-bluff, and the best response then
  // folds far below MDF (a dry-board 75% bet made almost only with value drew 12% defence). That is a
  // read on this AI policy, not a strategy to teach: any extra bluffs would exploit it. So when the
  // computed defence is more than DEFENCE_FLOOR_MARGIN under MDF, the strongest folding hands (by
  // realized equity) call until defence reaches MDF minus that margin.
  floorOf(context) {
    if (context.floor !== undefined) return context.floor;
    context.floor = null;
    if (context.capped) return null;
    const { board } = context, entry = context.target;
    const weights = this.reach(context.defender, context.defenderEntries, board, context.table);
    this.prime(context, weights);
    const tiers = context.tiers ??= tierArray(board), texture = textureOf(entry.street, board.slice(0, entry.boardLen));
    const baseMixes = TIERS.map((_, tier) => this.policyRule(entry, texture, tier));
    const items = [];
    let total = 0, continued = 0;
    for (let id = 0; id < NUM_IDS; id++) {
      const weight = weights[id];
      if (!(weight > 0)) continue;
      const combo = [Math.floor(id / 52), id % 52];
      const equity = this.equity(context, combo);
      if (equity === null) continue;
      let base = baseMixes[tiers[id]];
      if (context.cap) base = context.cap.apply(base, context.cap.kind[id]);
      const mix = this.applyEquity(context, base, equity, combo, true);
      total += weight;
      continued += weight * ((mix.call ?? 0) + (mix.raise ?? 0)) / 100;
      items.push({ realized: equity * this.realizationFor(context, combo), fold: weight * (mix.fold ?? 0) / 100 });
    }
    const target = Math.max(0, context.mdf - DEFENCE_FLOOR_MARGIN) * total;
    if (!(total > 0) || !(continued < target - 1e-9)) return null;
    items.sort((a, b) => b.realized - a.realized);
    let added = 0;
    const need = target - continued;
    for (let i = 0; i < items.length;) {
      let j = i, group = 0;
      while (j < items.length && Math.abs(items[j].realized - items[i].realized) <= 1e-9) group += items[j++].fold;
      if (added + group >= need - 1e-12) {
        context.floor = { threshold: items[i].realized, fraction: group > 0 ? Math.min(1, (need - added) / group) : 0 };
        return context.floor;
      }
      added += group; i = j;
    }
    context.floor = { threshold: -Infinity, fraction: 1 };
    return context.floor;
  }

  // The defended mix of `combo` at the pending decision of `table`; `base` is the AI policy mix,
  // returned unchanged when the node is not a facing decision or no context can be built.
  mix(table, board, node, combo, base) {
    if (!isFacingNode(node)) {
      const cap = isBettingNode(node) ? this.betting(table, board, node) : null;
      return cap ? cap.applyCombo(base, combo) : base;
    }
    const context = this.context(table, board, node);
    const capped = context ? (context.cap ? context.cap.applyCombo(base, combo) : base)
      : (isBettingNode(node) ? this.betting(table, board, node)?.applyCombo(base, combo) ?? base : base);
    if (!context) return capped;
    const equity = this.equity(context, combo);
    return equity === null ? capped : this.applyEquity(context, capped, equity, combo);
  }

  // Chips and break-even of the facing decision (null when it is not a facing decision).
  requirement(table, board, node) {
    const context = this.context(table, board, node);
    return context && { potBefore: context.potBefore, wager: context.wager, call: context.call, finalPot: context.finalPot,
      rake: context.rake, required: context.required, mdf: context.mdf };
  }

  // Range level facts of a context, computed once: defender and bettor ranges, their equities, the
  // value / bluff split, the percentile order and the overall defence frequency.
  summarize(context) {
    if (context.summary) return context.summary;
    const { board } = context, tables = this.tablesOf(context);
    const defenderWeights = this.reach(context.defender, context.defenderEntries, board, context.table);
    const defenderRange = makeRange(defenderWeights);
    const tiers = tierArray(board), entry = context.target, texture = textureOf(entry.street, board.slice(0, entry.boardLen));
    const baseMixes = TIERS.map((_, tier) => this.policyRule(entry, texture, tier));
    // Defender: equity, defended mix and realized equity of every combo of its range.
    const defenders = [];
    let continued = 0;
    for (const id of defenderRange.ids) {
      const combo = [Math.floor(id / 52), id % 52];
      const equity = this.equity(context, combo);
      if (equity === null) continue;
      let base = baseMixes[tiers[id]];
      if (context.cap) base = context.cap.apply(base, context.cap.kind[id]);
      const mix = this.applyEquity(context, base, equity, combo);
      defenders.push({ id, weight: defenderWeights[id], equity,
        realized: equity * this.realizationFor(context, combo) });
      continued += defenderWeights[id] * (mix.call + (mix.raise ?? 0)) / 100;
    }
    defenders.sort((a, b) => a.realized - b.realized);
    let defenderTotal = 0;
    const cumulative = defenders.map(item => (defenderTotal += item.weight));
    // Bettor: value = equity against the defender's whole range >= VALUE_EQUITY, bluff = the rest.
    const kind = new Uint8Array(NUM_IDS); // 1 value, 2 bluff
    let valueWeight = 0, bluffWeight = 0;
    if (defenderRange.total > 0) for (const id of context.bettorRange.ids) {
      const equity = equityVersus(defenderRange, id, tables);
      if (equity === null) continue;
      const weight = weightOf(context.bettorRange, id);
      if (equity >= VALUE_EQUITY) { kind[id] = 1; valueWeight += weight; } else { kind[id] = 2; bluffWeight += weight; }
    }
    context.summary = { defenders, cumulative, defenderTotal, kind, valueWeight, bluffWeight,
      defenceFrequency: defenderTotal ? Math.min(1, continued / defenderTotal) : null };
    return context.summary;
  }

  // Facts for explanations / UI about one defender combo at the pending decision (null when the
  // node is not a facing decision or no context exists).
  facts(table, board, node, combo, base = null) {
    const context = this.context(table, board, node);
    if (!context) return null;
    const equity = this.equity(context, combo);
    const summary = this.summarize(context);
    const c1 = combo[0], c2 = combo[1];
    const removed = { 1: 0, 2: 0 };
    const range = indexOf(context.bettorRange);
    const seen = new Set();
    for (const card of [c1, c2]) for (const bettorId of range.byCard[card]) {
      if (seen.has(bettorId)) continue;
      seen.add(bettorId);
      const type = summary.kind[bettorId];
      if (type) removed[type] += range.dense[bettorId];
    }
    let percentile = null;
    if (equity !== null && summary.defenderTotal > 0) {
      const realized = equity * this.realizationFor(context, combo);
      const target = realized - 1e-12;
      let lo = 0, hi = summary.defenders.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (summary.defenders[mid].realized < target) lo = mid + 1; else hi = mid; }
      percentile = lo ? summary.cumulative[lo - 1] / summary.defenderTotal : 0;
    }
    const split = summary.valueWeight + summary.bluffWeight;
    const realization = this.realizationFor(context, combo);
    const realized = equity === null ? null : equity * realization;
    const margin = realized === null ? null : realized - context.required;
    const mix = base && equity !== null ? this.applyEquity(context, context.cap ? context.cap.applyCombo(base, combo) : base, equity, combo) : null;
    const share = (value, bluff) => value + bluff > 0 ? round4(bluff / (value + bluff) * 100) : null;
    return {
      node, street: context.street, role: context.role, fallback: equity === null,
      pot_before_bb: round4(context.potBefore), bet_bb: round4(context.wager), call_bb: round4(context.call),
      final_pot_bb: round4(context.finalPot), rake_bb: round4(context.rake),
      required_equity: round4(context.required), equity: equity === null ? null : round4(equity),
      realization, realized_equity: realized === null ? null : round4(realized),
      margin: margin === null ? null : round4(margin),
      call_share: margin === null ? null : round4(logistic(margin / LOGISTIC_SCALE)),
      percentile: percentile === null ? null : round4(percentile),
      defence_frequency: summary.defenceFrequency === null ? null : round4(summary.defenceFrequency),
      mdf: round4(context.mdf),
      bettor_range: { value_weight: round4(summary.valueWeight), bluff_weight: round4(summary.bluffWeight),
        value_pct: split ? round4(summary.valueWeight / split * 100) : null, bluff_pct: split ? round4(summary.bluffWeight / split * 100) : null },
      faced_action: context.facedCap ? { action: context.facedCap.action, alpha: round4(context.facedCap.alpha),
        capped: context.facedCap.factor < 1,
        bluff_share_before_pct: share(context.facedCap.valueBefore, context.facedCap.bluffBefore),
        bluff_share_after_pct: share(context.facedCap.valueAfter, context.facedCap.bluffAfter) }
        : { action: context.table.log.at(-2)?.action ?? null, capped: false },
      blockers: { value_removed_pct: summary.valueWeight ? round4(removed[1] / summary.valueWeight * 100) : 0,
        bluff_removed_pct: summary.bluffWeight ? round4(removed[2] / summary.bluffWeight * 100) : 0 },
      ...(mix ? { mix } : {}),
    };
  }
}
