// Deterministic range-weighted sanity checks for the locally authored postflop policies.
// These checks describe balance heuristics, not solver targets or GTO requirements.
import { seedFor, seededRandom } from "../lib/equity.ts";
import { boards, comboRange, config, seatRange } from "./inputs.ts";
import { flopTextureKeys, runoutTexture } from "./model.ts";
import { handTier } from "./hu-hand-tier.ts";
import { LATER_NODES, betFraction, laterNodeRole, streetHistories, streetState } from "./later-tree.ts";
import { laterPolicyMix, referenceLaterTierMix, validateLaterPolicy } from "./later-policy.ts";
import { NODES, effectiveMix, nodeRole, policyMix, treeNodes, validatePolicy, withRaise } from "./policy.ts";
import { FLOP_BETS, flopBetFraction, flopState, raiseDepth, treeHistories } from "./tree.ts";
import { createTable, playFlop } from "./engine.ts";
import { defenceFor, replayOrNull } from "./defence.ts";

const pct = (value: any) : any => `${(value * 100).toFixed(1)}%`;
const mean = (values: any) : any => values.length ? values.reduce((sum?: any, value?: any) : any => sum + value, 0) / values.length : null;
const lineFor = (previousAggressor?: any, role?: any) : any => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

function firstHistoryByNode(histories?: any) : any {
  const out = new Map();
  for (const [history, entry] of Object.entries<any>(histories)) if (!out.has(entry.node)) out.set(entry.node, history ? history.split(",") : ([] as any[]));
  return out;
}

function flopPathSamples(tree?: any) : any {
  const check = tree === "oop_leads" ? ["check", "check"] : ["check"];
  // For the OOP-leads tree, the representative called bet is an OOP lead; for the
  // original tree it is the IP continuation bet. Both follow the same stored 33/call line.
  return [check, [FLOP_BETS[0], "call"]].map((actions: any) : any => {
    const state = flopState(tree, actions);
    if (!state.end || !["check", "call", "raise-call"].includes(state.end.type)) throw new Error("Invalid representative flop path");
    const aggressor = state.end.type === "check" ? null : [...state.steps].reverse().find((step: any) : any =>
      FLOP_BETS.includes(step.action) || step.action === "raise")?.role ?? null;
    return { actions, steps: state.steps, aggressor };
  });
}

function laterPathSamples(street?: any) : any {
  const paths = [["check", "check"], ["bet75", "call"]];
  return paths.map((actions: any) : any => {
    const state = streetState(street, actions);
    if (!state.end || !["check", "call"].includes(state.end.type)) throw new Error(`Invalid representative ${street} path`);
    const aggressor = state.end.type === "check" ? null : [...state.steps].reverse().find((step: any) : any =>
      step.action.startsWith("bet") || step.action === "allin" || step.action === "raise")?.role ?? null;
    return { actions, steps: state.steps, aggressor };
  });
}

function makeTierReader() : any {
  const cache = new WeakMap();
  return (combo?: any, board?: any) : any => {
    let boardCache = cache.get(board);
    if (!boardCache) cache.set(board, boardCache = new Map());
    const key = `${combo[0]}-${combo[1]}`;
    if (!boardCache.has(key)) boardCache.set(key, handTier(combo, board));
    return boardCache.get(key);
  };
}

function makeFlopMixReader(policy?: any, tierFor?: any) : any {
  const cache = new Map();
  return (node?: any, combo?: any, flop?: any) : any => {
    const tier = tierFor(combo, flop), texture = flopTextureKeys(flop)[0];
    const key = `${node}|${texture}|${tier}`;
    if (!cache.has(key)) cache.set(key, policyMix(policy, node, combo, flop));
    return cache.get(key);
  };
}

function makeLaterMixReader(policy?: any, tierFor?: any) : any {
  const cache = new Map();
  return (node?: any, combo?: any, board?: any, line?: any) : any => {
    const rawTier = tierFor(combo, board);
    const tier = node.startsWith("river_") && rawTier === "draw" ? "medium" : rawTier;
    const texture = runoutTexture(board);
    const key = `${node}|${line}|${tier}|${texture}`;
    if (!cache.has(key)) {
      const rules = policy.streets[node.split("_")[0]].rules;
      const find = (matchLine?: any, matchTexture?: any) : any => rules.find((rule: any) : any => rule.node === node && rule.tier === tier &&
        rule.line === matchLine && rule.texture === matchTexture);
      const rule = find(line, texture) ?? find(line, "any") ?? find("any", texture) ?? find("any", "any");
      // Re-raise nodes (*_vs_raise2..) carry no authored rules; they use the reference mixes, as in laterPolicyMix.
      if (!rule && raiseDepth(node) >= 2) { cache.set(key, referenceLaterTierMix(node, tier)); return cache.get(key); }
      if (!rule) throw new Error(`Uncovered later policy node: ${node}/${line}/${texture}/${tier}`);
      cache.set(key, rule.mix);
    }
    return cache.get(key);
  };
}

function scaleFlopPath(items?: any, role?: any, steps?: any, mixFor?: any, flop?: any) : any {
  return steps.filter((step: any) : any => step.role === role).reduce((range?: any, step?: any) : any => range.map((item: any) : any => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, flop)[step.action] / 100,
  })), items);
}

function scaleLaterPath(items?: any, role?: any, steps?: any, mixFor?: any, board?: any, previousAggressor?: any) : any {
  const line = lineFor(previousAggressor, role);
  return steps.filter((step: any) : any => step.role === role).reduce((range?: any, step?: any) : any => range.map((item: any) : any => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, board, line)[step.action] / 100,
  })), items);
}

function summarize(items?: any, actions?: any, mixFor?: any, tierFor?: any, node?: any, board?: any, line?: any, later: any = false) : any {
  const actionWeights = Object.fromEntries(actions.map((action: any) : any => [action, 0]));
  const airActionWeights = Object.fromEntries(actions.map((action: any) : any => [action, 0]));
  let rangeWeight = 0, monsterWeight = 0, monsterCheckWeight = 0, nonMonsterRaiseWeight = 0;
  for (const item of items) {
    if (!(item.weight > 0)) continue;
    const rawTier = tierFor(item.combo, board);
    const tier = later && node.startsWith("river_") && rawTier === "draw" ? "medium" : rawTier;
    const mix = later ? mixFor(node, item.combo, board, line) : mixFor(node, item.combo, board);
    rangeWeight += item.weight;
    if (tier === "monster") {
      monsterWeight += item.weight;
      monsterCheckWeight += item.weight * (mix.check ?? 0) / 100;
    }
    for (const action of actions) {
      const actionWeight = item.weight * mix[action] / 100;
      actionWeights[action] += actionWeight;
      if (tier === "air") airActionWeights[action] += actionWeight;
      if (action === "raise" && tier !== "monster") nonMonsterRaiseWeight += actionWeight;
    }
  }
  return { rangeWeight, monsterWeight, monsterCheckWeight, actionWeights, airActionWeights, nonMonsterRaiseWeight };
}

function nodeBoardBucket(collection?: any, node?: any, boardId?: any, actions?: any) : any {
  let nodeRows = collection.get(node);
  if (!nodeRows) collection.set(node, nodeRows = new Map());
  let row = nodeRows.get(boardId);
  if (!row) nodeRows.set(boardId, row = {
    rangeWeight: 0, monsterWeight: 0, monsterCheckWeight: 0, nonMonsterRaiseWeight: 0,
    minimumDefenseWeight: 0,
    actionWeights: Object.fromEntries(actions.map((action: any) : any => [action, 0])),
    airActionWeights: Object.fromEntries(actions.map((action: any) : any => [action, 0])),
    targetActionWeights: Object.fromEntries(actions.map((action: any) : any => [action, 0])),
  });
  return row;
}

function addSummary(collection?: any, node?: any, boardId?: any, actions?: any, summary?: any, targets: any = {}, minimumDefense: any = null) : any {
  const row = nodeBoardBucket(collection, node, boardId, actions);
  row.rangeWeight += summary.rangeWeight;
  row.monsterWeight += summary.monsterWeight;
  row.monsterCheckWeight += summary.monsterCheckWeight;
  row.nonMonsterRaiseWeight += summary.nonMonsterRaiseWeight;
  if (minimumDefense !== null) row.minimumDefenseWeight += summary.rangeWeight * minimumDefense;
  for (const action of actions) {
    row.actionWeights[action] += summary.actionWeights[action];
    row.airActionWeights[action] += summary.airActionWeights[action];
    if (targets[action] !== undefined) row.targetActionWeights[action] += summary.actionWeights[action] * targets[action];
  }
}

function averaged(collection?: any, node?: any, select?: any) : any {
  const rows = collection.get(node);
  if (!rows) return null;
  return mean([...rows.values()].map(select).filter(Number.isFinite));
}

function cappedCheckFindings(collection?: any, nodes?: any) : any {
  const findings: any[] = [];
  for (const node of nodes.filter((name: any) : any => name.endsWith("_first"))) {
    const monsterShare = averaged(collection, node, (row: any) : any => row.rangeWeight ? row.monsterWeight / row.rangeWeight : null);
    const monsterCheck = averaged(collection, node, (row: any) : any => row.monsterWeight ? row.monsterCheckWeight / row.monsterWeight : null);
    if (monsterShare !== null && monsterCheck !== null && monsterShare >= 0.05 && monsterCheck < 0.08) {
      findings.push({ check: "capped-check", severity: "warn", node,
        detail: `monster is ${pct(monsterShare)} of the reached range but checks only ${pct(monsterCheck)} on average (expected at least 8% check frequency).` });
    }
  }
  return findings;
}

function raiseFindings(collection?: any, nodes?: any) : any {
  const findings: any[] = [];
  for (const node of nodes.filter((name: any) : any => NODES[name]?.includes("raise") || LATER_NODES[name]?.includes("raise"))) {
    const frequency = averaged(collection, node, (row: any) : any => row.rangeWeight ? row.actionWeights.raise / row.rangeWeight : null);
    const nonMonsterShare = averaged(collection, node, (row: any) : any => row.actionWeights.raise ? row.nonMonsterRaiseWeight / row.actionWeights.raise : null);
    if (frequency !== null && nonMonsterShare !== null && frequency >= 0.03 && nonMonsterShare < 0.03) {
      findings.push({ check: "value-only-raise", severity: "warn", node,
        detail: `raise frequency is ${pct(frequency)}, but only ${pct(nonMonsterShare)} of raise weight is non-monster (expected at least 3%).` });
    }
  }
  return findings;
}

function bluffFindings(collection?: any, nodes?: any) : any {
  const findings: any[] = [];
  for (const node of nodes.filter((name: any) : any => name.startsWith("river_") && name.endsWith("_first"))) {
    const actions = LATER_NODES[node].filter((action: any) : any => action !== "check");
    for (const action of actions) {
      const difference = averaged(collection, node, (row: any) : any => row.actionWeights[action]
        ? row.airActionWeights[action] / row.actionWeights[action] - row.targetActionWeights[action] / row.actionWeights[action]
        : null);
      const frequency = averaged(collection, node, (row: any) : any => row.rangeWeight ? row.actionWeights[action] / row.rangeWeight : null);
      if (difference === null || frequency === null) continue;
      const avgAir = averaged(collection, node, (row: any) : any => row.actionWeights[action]
        ? row.airActionWeights[action] / row.actionWeights[action] : null);
      const avgTarget = averaged(collection, node, (row: any) : any => row.actionWeights[action]
        ? row.targetActionWeights[action] / row.actionWeights[action] : null);
      const label = action === "allin" ? "all-in" : `${action.slice(3)}% pot`;
      if (difference > 0.15) findings.push({ check: "bluff-ratio", direction: "over", severity: "warn", node,
        detail: `${label} bets average ${pct(avgAir)} air versus a size target of ${pct(avgTarget)} (more than 15 percentage points over).` });
      else if (difference < -0.15 && frequency >= 0.05) findings.push({ check: "bluff-ratio", direction: "under", severity: "warn", node,
        detail: `${label} bets average ${pct(avgAir)} air versus a size target of ${pct(avgTarget)} at ${pct(frequency)} range frequency (more than 15 points under).` });
    }
  }
  return findings;
}

function isFlopFacingNode(node?: any) : any {
  return /^(?:bb|ip)_vs_\d+$/.test(node);
}

function isLaterFacingNode(node?: any) : any {
  return /^(?:turn|river)_(?:oop|ip)_vs_(?:33|75|125|allin)$/.test(node);
}

function flopMinimumDefense(node?: any) : any {
  if (!isFlopFacingNode(node)) return null;
  const size = node.match(/_vs_(\d+)$/)[1];
  return 1 / (1 + flopBetFraction(`bet${size}`));
}

function laterMinimumDefense(node?: any, street?: any, table?: any, inputs?: any) : any {
  if (!isLaterFacingNode(node)) return null;
  const size = node.match(/_vs_(33|75|125|allin)$/)[1];
  const betSize = size === "allin"
    ? Math.min(table.stacks[inputs.spot.ip], table.stacks[inputs.spot.oop]) / table.pot
    : betFraction(street, `bet${size}`);
  return 1 / (1 + betSize);
}

function overfoldFindings(collection?: any, nodes?: any) : any {
  const findings: any[] = [];
  for (const node of nodes.filter((name: any) : any => isFlopFacingNode(name) || isLaterFacingNode(name))) {
    const defense = averaged(collection, node, (row: any) : any => row.rangeWeight
      ? (row.actionWeights.call + (row.actionWeights.raise ?? 0)) / row.rangeWeight : null);
    const minimumDefense = averaged(collection, node, (row: any) : any => row.rangeWeight
      ? row.minimumDefenseWeight / row.rangeWeight : null);
    if (defense !== null && minimumDefense !== null && defense < minimumDefense - 0.15) {
      findings.push({ check: "overfold", severity: "warn", node,
        detail: `defends ${pct(defense)} versus a minimum defence of ${pct(minimumDefense)} (more than 15 percentage points under).` });
    }
  }
  return findings;
}

function overcallFindings(collection?: any, nodes?: any) : any {
  const findings: any[] = [];
  for (const node of nodes.filter((name: any) : any => isFlopFacingNode(name) || isLaterFacingNode(name))) {
    const defense = averaged(collection, node, (row: any) : any => row.rangeWeight
      ? (row.actionWeights.call + (row.actionWeights.raise ?? 0)) / row.rangeWeight : null);
    const minimumDefense = averaged(collection, node, (row: any) : any => row.rangeWeight
      ? row.minimumDefenseWeight / row.rangeWeight : null);
    // Monsters continue against any size, so judge the rest of the range: the bluff-catchers
    // it needs are the minimum defence the monsters do not already cover.
    const monsterShare = averaged(collection, node, (row: any) : any => row.rangeWeight ? row.monsterWeight / row.rangeWeight : null) ?? 0;
    if (defense === null || minimumDefense === null || monsterShare >= 1) continue;
    const needed = Math.max(0, minimumDefense - monsterShare) / (1 - monsterShare);
    const catching = Math.max(0, defense - monsterShare) / (1 - monsterShare);
    // The allowance shrinks with the need: against a shove the monsters already cover, even a
    // few bluff-catcher calls are the leak that made all-ins look far better than any bet.
    const allowance = Math.min(0.15, needed + 0.05);
    if (catching > needed + allowance) {
      findings.push({ check: "overcall", severity: "warn", node,
        detail: `non-monster hands defend ${pct(catching)} versus the ${pct(needed)} the minimum defence of ${pct(minimumDefense)} still needs (more than ${Math.round(allowance * 100)} percentage points over).` });
    }
  }
  return findings;
}

function representativeRunouts(board?: any) : any {
  const random = seededRandom(seedFor(`${config.seed}|balance|${board.id}`));
  const deck = Array.from({ length: 52 }, (_?: any, card?: any) : any => card).filter((card: any) : any => !board.cards.includes(card));
  const take = (cards: any) : any => cards.splice(Math.floor(random() * cards.length), 1)[0];
  const turns = Array.from({ length: 4 }, () : any => take(deck));
  return turns.flatMap((turn: any) : any => {
    const rivers = deck.filter((card: any) : any => card !== turn);
    const turnBoard = [...board.cards, turn];
    return Array.from({ length: 3 }, () : any => {
      const river = take(rivers);
      return { turn, river, turnBoard, riverBoard: [...turnBoard, river] };
    });
  });
}

function cachedBaseRange(inputs?: any, cache?: any, seat?: any, board?: any) : any {
  const key = `${seat}|${board.join(",")}`;
  if (!cache.has(key)) cache.set(key, comboRange(inputs.seatRows[seat], "freq", board));
  return cache.get(key);
}

function replayFlopPath(inputs?: any, path?: any) : any {
  const table = createTable(inputs.spot);
  let index = 0;
  playFlop(table, inputs.spot.tree, () : any => path.actions[index++], config);
  if (index !== path.actions.length) throw new Error("Representative flop path did not replay completely");
  return table;
}

function cloneTable(inputs?: any, source?: any) : any {
  const table = createTable(inputs.spot);
  table.pot = source.pot;
  table.stacks = { ...source.stacks };
  table.invested = { ...source.invested };
  table.winner = source.winner;
  table.lastAggressor = source.lastAggressor;
  return table;
}

function replayLaterPath(table?: any, street?: any, path?: any) : any {
  const { ip, oop } = table.spot;
  const committed = { [ip]: 0, [oop]: 0 };
  const streetStart = { ...table.invested };
  const cap = (seat: any) : any => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + committed[table.other(seat)] - committed[seat]);
  const wager = (seat?: any, amount?: any) : any => {
    const limit = cap(seat);
    table.put(seat, amount >= limit * config.later_all_in_merge_ratio ? limit : amount);
  };
  let actions: any[] = [], state = streetState(street, actions), aggressor: any = null;
  for (const action of path.actions) {
    if (state.end) throw new Error(`Invalid representative ${street} path`);
    const seat = table.spot[state.role], other = table.other(seat);
    if (action === "allin" || action.startsWith("bet")) {
      wager(seat, action === "allin" ? cap(seat) : Math.round(table.pot * betFraction(street, action) * 100) / 100);
      committed[seat] = Math.round((table.invested[seat] - streetStart[seat]) * 100) / 100;
      aggressor = seat;
    } else if (action === "call") {
      table.put(seat, Math.round((committed[other] - committed[seat]) * 100) / 100);
      committed[seat] = Math.round((table.invested[seat] - streetStart[seat]) * 100) / 100;
    }
    actions = [...actions, action];
    state = streetState(street, actions);
  }
  if (!state.end) throw new Error(`Representative ${street} path did not finish`);
  table.lastAggressor = state.end.winner ? null : aggressor;
  return table;
}

const PROFILE_IDS = ["standard", "nit", "station", "lag", "maniac"];
const profileMode = (inputs: any) : any => inputs.opponentProfile !== undefined && inputs.opponentProfile !== "standard";

// Profile advisories describe the authored tier rules, not sampled range aggregates or
// solver/MDF targets. A deliberately unbalanced opponent must not fail standard balance
// heuristics. These warnings never change the policy's frequencies.
function profileRuleFindings(inputs?: any, rules?: any, later: any = false) : any {
  const findings: any[] = [];
  for (const rule of rules) {
    const role = later ? laterNodeRole(rule.node) : nodeRole(rule.node);
    const context = `${rule.tier}/${later ? `${rule.line}/` : ""}${rule.texture}`;
    const finding = (check?: any, detail?: any) : any => findings.push({ check, severity: "warn", node: rule.node,
      role, tier: rule.tier, texture: rule.texture, ...(later ? { line: rule.line } : {}), detail: `${context}: ${detail}` });
    if (rule.tier === "monster" && (rule.mix.fold ?? 0) >= 95) {
      finding("monster-fold", `monsters fold ${rule.mix.fold}% of the time; review this extreme policy assumption.`);
    }
    if (rule.tier === "air" && (rule.mix.allin ?? 0) >= 50) {
      finding("air-allin", `air moves all-in ${rule.mix.allin}% of the time; advisory only, including for maniac.`);
    }
    // Villain traits do not constrain the other seat's exploit policy (e.g. bluffing a nit).
    if (role !== inputs.opponentSeat || !["nit", "station"].includes(inputs.opponentProfile) || rule.tier !== "air") continue;
    const aggression = Object.entries<any>(rule.mix).reduce((sum: any, [action, value]: any) : any =>
      sum + (action === "raise" || action === "allin" || action.startsWith("bet") ? value : 0), 0);
    if (aggression >= 50) finding("profile-contradiction",
      `air bets/raises ${aggression}% under the low-bluff ${inputs.opponentProfile} opponent assumption.`);
  }
  return findings;
}

// An explicitly requested *pending decision* must exist in the engine and have a
// compatible positive-weight holecard assignment. Never scan every zero-frequency
// branch and call it an error: pure checks/folds are ordinary valid poker policies.
function checkRequestedProfilePath(inputs?: any, flop?: any, later?: any, request?: any) : any {
  const board = request?.board, path = request?.path;
  if (!Array.isArray(board) || ![3, 4, 5].includes(board.length) || new Set(board).size !== board.length ||
      board.some((card: any) : any => !Number.isInteger(card) || card < 0 || card >= 52) || !path || typeof path !== "object" || Array.isArray(path) ||
      Object.keys(path).some((street: any) : any => !["flop", "turn", "river"].includes(street)) ||
      Object.values<any>(path).some((actions: any) : any => !Array.isArray(actions))) throw new Error("Invalid requested profile board/path");
  if (board.length > 3 && !later) throw new Error("A later policy is required for this requested decision");
  flopState(inputs.spot.tree, path.flop ?? ([] as any[]));
  for (const street of ["turn", "river"]) if (path[street]) streetState(street, path[street]);
  const table: any = replayOrNull(inputs, board, path, inputs.config ?? config);
  if (!table || ["flop", "turn", "river"].some((street: any) : any =>
    JSON.stringify(table.path[street]) !== JSON.stringify(path[street] ?? ([] as any[])))) {
    throw new Error("Requested path does not reach the pending decision (terminal, all-in, or legalized continuation)");
  }
  const requireSavedPolicy = profileMode(inputs);
  const reached = (seat: any) : any => comboRange(inputs.seatRows[seat], "freq", board).map((item: any) : any => {
    let weight = item.weight;
    for (const entry of table.log) {
      if (entry.seat !== seat || entry.action === null || !(weight > 0)) continue;
      const cards = board.slice(0, entry.boardLen);
      const raw = entry.street === "flop" ? policyMix(flop, entry.node, item.combo, cards, { requireSavedPolicy })
        : laterPolicyMix(later, entry.node, item.combo, cards, (entry.line as any), { requireSavedPolicy });
      const mix = effectiveMix(withRaise(entry.node, raw), entry.canRaise);
      weight *= mix[entry.action] / 100;
    }
    return { ...item, weight };
  }).filter((item: any) : any => item.weight > 0);
  const ip = reached(inputs.spot.ip), oop = reached(inputs.spot.oop);
  if (!ip.some((a: any) : any => oop.some((b: any) : any => a.combo.every((card: any) : any => !b.combo.includes(card))))) {
    throw new Error("No compatible positive-weight holecard assignment reaches the requested decision");
  }
}

// Policies are already composed by seat (villain / exploit) before calling this.
// Structural policy validation is shared with standard mode; saved source identity
// validation remains with the strict candidate/audit loaders, not this heuristic.
// `requestedPaths`: [{ board: number[3..5], path: { flop?, turn?, river? } }].
// Each entry requests a pending decision, not a terminal outcome. Omitted entries
// do not assert reach for hypothetical zero-weight branches. boardList/authored
// are intentionally irrelevant to the rule-level profile advisories.
export function checkProfileBalance(inputs?: any, flopPolicy?: any, laterPolicy: any = null, { requestedPaths = ([] as any[]) }: any = {}) : any {
  const findings: any[] = [];
  let flop: any, later: any;
  try {
    if (!PROFILE_IDS.includes(inputs.opponentProfile ?? "standard") ||
        (inputs.opponentSeat !== undefined && !["ip", "oop"].includes(inputs.opponentSeat))) throw new Error("Invalid opponent profile/seat");
    flop = validatePolicy(flopPolicy, inputs.spot.tree);
    later = laterPolicy === null ? null : validateLaterPolicy(laterPolicy);
    if (!Array.isArray(requestedPaths)) throw new Error("Invalid requested profile paths");
  } catch (error: any) {
    return { findings: [{ check: "profile-structure", severity: "error", node: "policy", detail: error.message }] };
  }
  findings.push(...profileRuleFindings(inputs, flop.rules));
  if (later) findings.push(...profileRuleFindings(inputs,
    [...later.streets.turn.rules, ...later.streets.river.rules], true));
  requestedPaths.forEach((request?: any, index?: any) : any => {
    try { checkRequestedProfilePath(inputs, flop, later, request); }
    catch (error: any) { findings.push({ check: "unreachable-branch", severity: "error", node: `requested-path-${index}`, detail: error.message }); }
  });
  return { findings };
}

// `boardList` replaces the 12 configured boards (e.g. one canonical flop at a time for the all-board audit).
export function checkFlopBalance(inputs?: any, flopPolicy?: any, options: any = {}) : any {
  if (profileMode(inputs)) return checkProfileBalance(inputs, flopPolicy, null, options);
  const { boardList = boards() } = options;
  const policy = validatePolicy(flopPolicy, inputs.spot.tree);
  const nodes = treeNodes(inputs.spot.tree).filter((node: any) : any => node.endsWith("_first") || NODES[node].includes("raise"));
  const histories = firstHistoryByNode(treeHistories(inputs.spot.tree));
  const tierFor = makeTierReader(), mixFor = makeFlopMixReader(policy, tierFor), collection = new Map();
  // Facing nodes are judged on the computed defence (defence.ts), not the tier mixes of the policy.
  const defence = defenceFor(inputs, policy, null);
  for (const board of boardList) for (const node of nodes) {
    const history = histories.get(node);
    if (!history) throw new Error(`No representative history for flop node: ${node}`);
    const state = flopState(inputs.spot.tree, history);
    const role = nodeRole(node), seat = inputs.spot[role];
    // Reach weights and mixes come from the engine table at the node (computed defence and bluff cap).
    const table = replayOrNull(inputs, board.cards, { flop: history });
    const range = table ? defence.rangeItems(table, board.cards, seat)
      : scaleFlopPath(seatRange(inputs, seat, board.cards), role, state.steps, mixFor, board.cards);
    const nodeMixFor = table ? (name?: any, combo?: any, cards?: any) : any => defence.mix(table, cards, name, combo, mixFor(name, combo, cards)) : mixFor;
    const summary = summarize(range, NODES[node], nodeMixFor, tierFor, node, board.cards, null);
    addSummary(collection, node, board.id, NODES[node], summary, {}, flopMinimumDefense(node));
  }
  return { findings: [...cappedCheckFindings(collection, nodes), ...raiseFindings(collection, nodes),
    ...overfoldFindings(collection, nodes), ...overcallFindings(collection, nodes)] };
}

// `authored`: the policy is a generated/authored candidate, which must show both override
// dimensions on first nodes. The fixed reference comparator is exempt.
export function checkLaterBalance(inputs?: any, flopPolicy?: any, laterPolicy?: any, options: any = {}) : any {
  if (profileMode(inputs)) return checkProfileBalance(inputs, flopPolicy, laterPolicy, options);
  const { authored = true, boardList = boards() } = options;
  const flop = validatePolicy(flopPolicy, inputs.spot.tree);
  const later: any = validateLaterPolicy(laterPolicy);
  const findings: any[] = [];
  for (const street of ["turn", "river"]) {
    const firstNodes = streetHistories(street);
    for (const node of [...new Set(Object.values<any>(firstNodes).map((item: any) : any => item.node))].filter((name: any) : any => name.endsWith("_first"))) {
      const rules = later.streets[street].rules.filter((rule: any) : any => rule.node === node);
      const lineCount = rules.filter((rule: any) : any => rule.line !== "any").length;
      const textureCount = rules.filter((rule: any) : any => rule.texture !== "any").length;
      if (authored && (!lineCount || !textureCount)) findings.push({ check: "no-overrides", severity: "error", node,
        detail: `first node has ${lineCount} line override(s) and ${textureCount} texture override(s); each must be nonzero.` });
    }
    for (const role of ["oop", "ip"]) {
      const node = `${street}_${role}_first`;
      const peer = `${street}_${role === "oop" ? "ip" : "oop"}_first`;
      const fallbacks = (name: any) : any => later.streets[street].rules.filter((rule: any) : any =>
        rule.node === name && rule.line === "any" && rule.texture === "any")
        .sort((a?: any, b?: any) : any => a.tier.localeCompare(b.tier))
        .map((rule: any) : any => [rule.tier, Object.fromEntries(Object.entries<any>(rule.mix).sort(([a]: any, [b]: any) : any => a.localeCompare(b)))]);
      if (JSON.stringify(fallbacks(node)) === JSON.stringify(fallbacks(peer))) {
        findings.push({ check: "role-copy", severity: "warn", node: `${street}_oop_first / ${street}_ip_first`,
          detail: `${node} and ${peer} have identical fallback mixes for every tier.` });
        break;
      }
    }
  }

  const tierFor = makeTierReader(), flopMixFor = makeFlopMixReader(flop, tierFor);
  const mixFor = makeLaterMixReader(later, tierFor), collection = new Map(), baseCache = new Map();
  // Facing nodes are judged on the computed defence (defence.ts), not the tier mixes of the policy.
  const defence = defenceFor(inputs, flop, later);
  const defended = (table?: any, name?: any, combo?: any, cards?: any, line?: any) : any => defence.mix(table, cards, name, combo, mixFor(name, combo, cards, line));
  const flopPaths = flopPathSamples(inputs.spot.tree), turnPaths = laterPathSamples("turn");
  const flopTableByPath = new Map(flopPaths.map((path: any) : any => [path.actions.join(","), replayFlopPath(inputs, path)]));
  const turnHistoryByNode = firstHistoryByNode(streetHistories("turn"));
  const riverHistoryByNode = firstHistoryByNode(streetHistories("river"));
  const turnNodes = [...turnHistoryByNode.keys()], riverNodes = [...riverHistoryByNode.keys()];
  const turnCheckNodes = turnNodes.filter((node: any) : any => node.endsWith("_first") || LATER_NODES[node].includes("raise") || isLaterFacingNode(node));
  const riverCheckNodes = riverNodes.filter((node: any) : any => node.endsWith("_first") || isLaterFacingNode(node));

  for (const flopBoard of boardList) {
    const runouts = representativeRunouts(flopBoard);
    const turnBoards = [...new Map(runouts.map((runout: any) : any => [runout.turn, runout.turnBoard])).values()];
    for (const turnBoard of turnBoards) for (const flopPath of flopPaths) for (const node of turnCheckNodes) {
      const history = turnHistoryByNode.get(node);
      const state = streetState("turn", history);
      const role = laterNodeRole(node), seat = inputs.spot[role];
      const line = lineFor(flopPath.aggressor, role);
      const table = replayOrNull(inputs, (turnBoard as any), { flop: flopPath.actions, turn: history });
      const items = table ? defence.rangeItems(table, (turnBoard as any), seat)
        : scaleLaterPath(scaleFlopPath(cachedBaseRange(inputs, baseCache, seat, turnBoard), role, flopPath.steps, flopMixFor, flopBoard.cards),
          role, state.steps, mixFor, turnBoard, flopPath.aggressor);
      const nodeMixFor = table ? (name?: any, combo?: any, cards?: any, cardLine?: any) : any => defended(table, name, combo, cards, cardLine) : mixFor;
      const summary = summarize(items, LATER_NODES[node], nodeMixFor, tierFor, node, turnBoard, line, true);
      const minimumDefense = laterMinimumDefense(node, "turn", flopTableByPath.get(flopPath.actions.join(",")), inputs);
      addSummary(collection, node, flopBoard.id, LATER_NODES[node], summary, {}, minimumDefense);
    }

    for (const runout of runouts) {
      for (const flopPath of flopPaths) {
        for (const turnPath of turnPaths) {
          const table = cloneTable(inputs, flopTableByPath.get(flopPath.actions.join(",")));
          replayLaterPath(table, "turn", turnPath);
          if (table.stacks[inputs.spot.ip] <= 0 || table.stacks[inputs.spot.oop] <= 0) continue;
          const riverAggressor = table.lastAggressor;
          const turnSteps = turnPath.steps;
          for (const node of riverCheckNodes) {
            const history = riverHistoryByNode.get(node);
            const state = streetState("river", history);
            const role = laterNodeRole(node), seat = inputs.spot[role];
            const baseItems = cachedBaseRange(inputs, baseCache, seat, runout.riverBoard);
            const defenceTable = replayOrNull(inputs, runout.riverBoard, { flop: flopPath.actions, turn: turnPath.actions, river: history });
            let items: any;
            if (defenceTable) items = defence.rangeItems(defenceTable, runout.riverBoard, seat);
            else {
              items = scaleFlopPath(baseItems, role, flopPath.steps, flopMixFor, flopBoard.cards);
              items = scaleLaterPath(items, role, turnSteps, mixFor, runout.turnBoard, flopPath.aggressor);
              items = scaleLaterPath(items, role, state.steps, mixFor, runout.riverBoard, riverAggressor);
            }
            // An unreachable facing node (e.g. the all-in the SPR rule removed) has no bettor range to judge.
            if (defenceTable && isLaterFacingNode(node) && !defence.context(defenceTable, runout.riverBoard, node)) continue;
            const line = lineFor(riverAggressor, role);
            const targets: Record<string, any> = {};
            if (node.endsWith("_first")) for (const action of LATER_NODES[node].filter((value: any) : any => value !== "check")) {
              const size = action === "allin" ? Math.min(table.stacks[inputs.spot.ip], table.stacks[inputs.spot.oop]) / table.pot
                : betFraction("river", action);
              targets[action] = size / (1 + 2 * size);
            }
            const nodeMixFor = defenceTable ? (name?: any, combo?: any, cards?: any, cardLine?: any) : any => defended(defenceTable, name, combo, cards, cardLine) : mixFor;
            const summary = summarize(items, LATER_NODES[node], nodeMixFor, tierFor, node, runout.riverBoard, line, true);
            const minimumDefense = laterMinimumDefense(node, "river", table, inputs);
            addSummary(collection, node, flopBoard.id, LATER_NODES[node], summary, targets, minimumDefense);
          }
        }
      }
    }
  }

  const laterNodes = [...turnNodes, ...riverNodes];
  findings.push(...cappedCheckFindings(collection, laterNodes), ...raiseFindings(collection, turnNodes),
    ...bluffFindings(collection, riverNodes), ...overfoldFindings(collection, laterNodes),
    ...overcallFindings(collection, laterNodes));
  return { findings };
}
