// Deterministic range-weighted sanity checks for the locally authored postflop policies.
// These checks describe balance heuristics, not solver targets or GTO requirements.
import { seedFor, seededRandom } from "../lib/equity.mjs";
import { boards, comboRange, config, seatRange } from "./inputs.mjs";
import { boardTexture, handTier, runoutTexture } from "./model.mjs";
import { LATER_NODES, betFraction, laterNodeRole, streetHistories, streetState } from "./later-tree.mjs";
import { validateLaterPolicy } from "./later-policy.mjs";
import { NODES, nodeRole, policyMix, treeNodes, validatePolicy } from "./policy.mjs";
import { FLOP_BETS, flopState, treeHistories } from "./tree.mjs";
import { createTable, playFlop } from "./engine.mjs";

const pct = value => `${(value * 100).toFixed(1)}%`;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const lineFor = (previousAggressor, role) => previousAggressor === null
  ? "checked" : previousAggressor === role ? "aggressor" : "defender";

function firstHistoryByNode(histories) {
  const out = new Map();
  for (const [history, entry] of Object.entries(histories)) if (!out.has(entry.node)) out.set(entry.node, history ? history.split(",") : []);
  return out;
}

function flopPathSamples(tree) {
  const check = tree === "oop_leads" ? ["check", "check"] : ["check"];
  // For the OOP-leads tree, the representative called bet is an OOP lead; for the
  // original tree it is the IP continuation bet. Both follow the same stored 33/call line.
  return [check, [FLOP_BETS[0], "call"]].map(actions => {
    const state = flopState(tree, actions);
    if (!state.end || !["check", "call", "raise-call"].includes(state.end.type)) throw new Error("Invalid representative flop path");
    const aggressor = state.end.type === "check" ? null : [...state.steps].reverse().find(step =>
      FLOP_BETS.includes(step.action) || step.action === "raise")?.role ?? null;
    return { actions, steps: state.steps, aggressor };
  });
}

function laterPathSamples(street) {
  const paths = [["check", "check"], ["bet75", "call"]];
  return paths.map(actions => {
    const state = streetState(street, actions);
    if (!state.end || !["check", "call"].includes(state.end.type)) throw new Error(`Invalid representative ${street} path`);
    const aggressor = state.end.type === "check" ? null : [...state.steps].reverse().find(step =>
      step.action.startsWith("bet") || step.action === "allin" || step.action === "raise")?.role ?? null;
    return { actions, steps: state.steps, aggressor };
  });
}

function makeTierReader() {
  const cache = new WeakMap();
  return (combo, board) => {
    let boardCache = cache.get(board);
    if (!boardCache) cache.set(board, boardCache = new Map());
    const key = `${combo[0]}-${combo[1]}`;
    if (!boardCache.has(key)) boardCache.set(key, handTier(combo, board));
    return boardCache.get(key);
  };
}

function makeFlopMixReader(policy, tierFor) {
  const cache = new Map();
  return (node, combo, flop) => {
    const tier = tierFor(combo, flop), texture = boardTexture(flop);
    const key = `${node}|${texture}|${tier}`;
    if (!cache.has(key)) cache.set(key, policyMix(policy, node, combo, flop));
    return cache.get(key);
  };
}

function makeLaterMixReader(policy, tierFor) {
  const cache = new Map();
  return (node, combo, board, line) => {
    const rawTier = tierFor(combo, board);
    const tier = node.startsWith("river_") && rawTier === "draw" ? "medium" : rawTier;
    const texture = runoutTexture(board);
    const key = `${node}|${line}|${tier}|${texture}`;
    if (!cache.has(key)) {
      const rules = policy.streets[node.split("_")[0]].rules;
      const find = (matchLine, matchTexture) => rules.find(rule => rule.node === node && rule.tier === tier &&
        rule.line === matchLine && rule.texture === matchTexture);
      const rule = find(line, texture) ?? find(line, "any") ?? find("any", texture) ?? find("any", "any");
      if (!rule) throw new Error(`Uncovered later policy node: ${node}/${line}/${texture}/${tier}`);
      cache.set(key, rule.mix);
    }
    return cache.get(key);
  };
}

function scaleFlopPath(items, role, steps, mixFor, flop) {
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, flop)[step.action] / 100,
  })), items);
}

function scaleLaterPath(items, role, steps, mixFor, board, previousAggressor) {
  const line = lineFor(previousAggressor, role);
  return steps.filter(step => step.role === role).reduce((range, step) => range.map(item => ({
    ...item, weight: item.weight * mixFor(step.node, item.combo, board, line)[step.action] / 100,
  })), items);
}

function summarize(items, actions, mixFor, tierFor, node, board, line, later = false) {
  const actionWeights = Object.fromEntries(actions.map(action => [action, 0]));
  const airActionWeights = Object.fromEntries(actions.map(action => [action, 0]));
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

function nodeBoardBucket(collection, node, boardId, actions) {
  let nodeRows = collection.get(node);
  if (!nodeRows) collection.set(node, nodeRows = new Map());
  let row = nodeRows.get(boardId);
  if (!row) nodeRows.set(boardId, row = {
    rangeWeight: 0, monsterWeight: 0, monsterCheckWeight: 0, nonMonsterRaiseWeight: 0,
    actionWeights: Object.fromEntries(actions.map(action => [action, 0])),
    airActionWeights: Object.fromEntries(actions.map(action => [action, 0])),
    targetActionWeights: Object.fromEntries(actions.map(action => [action, 0])),
  });
  return row;
}

function addSummary(collection, node, boardId, actions, summary, targets = {}) {
  const row = nodeBoardBucket(collection, node, boardId, actions);
  row.rangeWeight += summary.rangeWeight;
  row.monsterWeight += summary.monsterWeight;
  row.monsterCheckWeight += summary.monsterCheckWeight;
  row.nonMonsterRaiseWeight += summary.nonMonsterRaiseWeight;
  for (const action of actions) {
    row.actionWeights[action] += summary.actionWeights[action];
    row.airActionWeights[action] += summary.airActionWeights[action];
    if (targets[action] !== undefined) row.targetActionWeights[action] += summary.actionWeights[action] * targets[action];
  }
}

function averaged(collection, node, select) {
  const rows = collection.get(node);
  if (!rows) return null;
  return mean([...rows.values()].map(select).filter(Number.isFinite));
}

function cappedCheckFindings(collection, nodes) {
  const findings = [];
  for (const node of nodes.filter(name => name.endsWith("_first"))) {
    const monsterShare = averaged(collection, node, row => row.rangeWeight ? row.monsterWeight / row.rangeWeight : null);
    const monsterCheck = averaged(collection, node, row => row.monsterWeight ? row.monsterCheckWeight / row.monsterWeight : null);
    if (monsterShare !== null && monsterCheck !== null && monsterShare >= 0.05 && monsterCheck < 0.08) {
      findings.push({ check: "capped-check", severity: "warn", node,
        detail: `monster is ${pct(monsterShare)} of the reached range but checks only ${pct(monsterCheck)} on average (expected at least 8% check frequency).` });
    }
  }
  return findings;
}

function raiseFindings(collection, nodes) {
  const findings = [];
  for (const node of nodes.filter(name => NODES[name]?.includes("raise") || LATER_NODES[name]?.includes("raise"))) {
    const frequency = averaged(collection, node, row => row.rangeWeight ? row.actionWeights.raise / row.rangeWeight : null);
    const nonMonsterShare = averaged(collection, node, row => row.actionWeights.raise ? row.nonMonsterRaiseWeight / row.actionWeights.raise : null);
    if (frequency !== null && nonMonsterShare !== null && frequency >= 0.03 && nonMonsterShare < 0.03) {
      findings.push({ check: "value-only-raise", severity: "warn", node,
        detail: `raise frequency is ${pct(frequency)}, but only ${pct(nonMonsterShare)} of raise weight is non-monster (expected at least 3%).` });
    }
  }
  return findings;
}

function bluffFindings(collection, nodes) {
  const findings = [];
  for (const node of nodes.filter(name => name.startsWith("river_") && name.endsWith("_first"))) {
    const actions = LATER_NODES[node].filter(action => action !== "check");
    for (const action of actions) {
      const difference = averaged(collection, node, row => row.actionWeights[action]
        ? row.airActionWeights[action] / row.actionWeights[action] - row.targetActionWeights[action] / row.actionWeights[action]
        : null);
      const frequency = averaged(collection, node, row => row.rangeWeight ? row.actionWeights[action] / row.rangeWeight : null);
      if (difference === null || frequency === null) continue;
      const avgAir = averaged(collection, node, row => row.actionWeights[action]
        ? row.airActionWeights[action] / row.actionWeights[action] : null);
      const avgTarget = averaged(collection, node, row => row.actionWeights[action]
        ? row.targetActionWeights[action] / row.actionWeights[action] : null);
      const label = action === "allin" ? "all-in" : `${action.slice(3)}% pot`;
      if (difference > 0.15) findings.push({ check: "bluff-ratio", severity: "warn", node,
        detail: `${label} bets average ${pct(avgAir)} air versus a size target of ${pct(avgTarget)} (more than 15 percentage points over).` });
      else if (difference < -0.15 && frequency >= 0.05) findings.push({ check: "bluff-ratio", severity: "warn", node,
        detail: `${label} bets average ${pct(avgAir)} air versus a size target of ${pct(avgTarget)} at ${pct(frequency)} range frequency (more than 15 points under).` });
    }
  }
  return findings;
}

function representativeRunouts(board) {
  const random = seededRandom(seedFor(`${config.seed}|balance|${board.id}`));
  const deck = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.cards.includes(card));
  const take = cards => cards.splice(Math.floor(random() * cards.length), 1)[0];
  const turns = Array.from({ length: 4 }, () => take(deck));
  return turns.flatMap(turn => {
    const rivers = deck.filter(card => card !== turn);
    const turnBoard = [...board.cards, turn];
    return Array.from({ length: 3 }, () => {
      const river = take(rivers);
      return { turn, river, turnBoard, riverBoard: [...turnBoard, river] };
    });
  });
}

function cachedBaseRange(inputs, cache, seat, board) {
  const key = `${seat}|${board.join(",")}`;
  if (!cache.has(key)) cache.set(key, comboRange(inputs.seatRows[seat], "freq", board));
  return cache.get(key);
}

function replayFlopPath(inputs, path) {
  const table = createTable(inputs.spot);
  let index = 0;
  playFlop(table, inputs.spot.tree, () => path.actions[index++], config);
  if (index !== path.actions.length) throw new Error("Representative flop path did not replay completely");
  return table;
}

function cloneTable(inputs, source) {
  const table = createTable(inputs.spot);
  table.pot = source.pot;
  table.stacks = { ...source.stacks };
  table.invested = { ...source.invested };
  table.winner = source.winner;
  table.lastAggressor = source.lastAggressor;
  return table;
}

function replayLaterPath(table, street, path) {
  const { ip, oop } = table.spot;
  const committed = { [ip]: 0, [oop]: 0 };
  const streetStart = { ...table.invested };
  const cap = seat => Math.min(table.stacks[seat], table.stacks[table.other(seat)] + committed[table.other(seat)] - committed[seat]);
  const wager = (seat, amount) => {
    const limit = cap(seat);
    table.put(seat, amount >= limit * config.later_all_in_merge_ratio ? limit : amount);
  };
  let actions = [], state = streetState(street, actions), aggressor = null;
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

export function checkFlopBalance(inputs, flopPolicy) {
  const policy = validatePolicy(flopPolicy, inputs.spot.tree);
  const nodes = treeNodes(inputs.spot.tree).filter(node => node.endsWith("_first") || NODES[node].includes("raise"));
  const histories = firstHistoryByNode(treeHistories(inputs.spot.tree));
  const tierFor = makeTierReader(), mixFor = makeFlopMixReader(policy, tierFor), collection = new Map();
  for (const board of boards()) for (const node of nodes) {
    const history = histories.get(node);
    if (!history) throw new Error(`No representative history for flop node: ${node}`);
    const state = flopState(inputs.spot.tree, history);
    const role = nodeRole(node), seat = inputs.spot[role];
    const range = scaleFlopPath(seatRange(inputs, seat, board.cards), role, state.steps, mixFor, board.cards);
    const summary = summarize(range, NODES[node], mixFor, tierFor, node, board.cards, null);
    addSummary(collection, node, board.id, NODES[node], summary);
  }
  return { findings: [...cappedCheckFindings(collection, nodes), ...raiseFindings(collection, nodes)] };
}

// `authored`: the policy is a generated/authored candidate, which must show both override
// dimensions on first nodes. The fixed reference comparator is exempt.
export function checkLaterBalance(inputs, flopPolicy, laterPolicy, { authored = true } = {}) {
  const flop = validatePolicy(flopPolicy, inputs.spot.tree);
  const later = validateLaterPolicy(laterPolicy);
  const findings = [];
  for (const street of ["turn", "river"]) {
    const firstNodes = streetHistories(street);
    for (const node of [...new Set(Object.values(firstNodes).map(item => item.node))].filter(name => name.endsWith("_first"))) {
      const rules = later.streets[street].rules.filter(rule => rule.node === node);
      const lineCount = rules.filter(rule => rule.line !== "any").length;
      const textureCount = rules.filter(rule => rule.texture !== "any").length;
      if (authored && (!lineCount || !textureCount)) findings.push({ check: "no-overrides", severity: "error", node,
        detail: `first node has ${lineCount} line override(s) and ${textureCount} texture override(s); each must be nonzero.` });
    }
    for (const role of ["oop", "ip"]) {
      const node = `${street}_${role}_first`;
      const peer = `${street}_${role === "oop" ? "ip" : "oop"}_first`;
      const fallbacks = name => later.streets[street].rules.filter(rule =>
        rule.node === name && rule.line === "any" && rule.texture === "any")
        .sort((a, b) => a.tier.localeCompare(b.tier))
        .map(rule => [rule.tier, Object.fromEntries(Object.entries(rule.mix).sort(([a], [b]) => a.localeCompare(b)))]);
      if (JSON.stringify(fallbacks(node)) === JSON.stringify(fallbacks(peer))) {
        findings.push({ check: "role-copy", severity: "warn", node: `${street}_oop_first / ${street}_ip_first`,
          detail: `${node} and ${peer} have identical fallback mixes for every tier.` });
        break;
      }
    }
  }

  const tierFor = makeTierReader(), flopMixFor = makeFlopMixReader(flop, tierFor);
  const mixFor = makeLaterMixReader(later, tierFor), collection = new Map(), baseCache = new Map();
  const flopPaths = flopPathSamples(inputs.spot.tree), turnPaths = laterPathSamples("turn");
  const flopTableByPath = new Map(flopPaths.map(path => [path.actions.join(","), replayFlopPath(inputs, path)]));
  const turnHistoryByNode = firstHistoryByNode(streetHistories("turn"));
  const riverHistoryByNode = firstHistoryByNode(streetHistories("river"));
  const turnNodes = [...turnHistoryByNode.keys()], riverNodes = [...riverHistoryByNode.keys()];
  const turnCheckNodes = turnNodes.filter(node => node.endsWith("_first") || LATER_NODES[node].includes("raise"));
  const riverCheckNodes = riverNodes.filter(node => node.endsWith("_first"));

  for (const flopBoard of boards()) {
    const runouts = representativeRunouts(flopBoard);
    const turnBoards = [...new Map(runouts.map(runout => [runout.turn, runout.turnBoard])).values()];
    for (const turnBoard of turnBoards) for (const flopPath of flopPaths) for (const node of turnCheckNodes) {
      const history = turnHistoryByNode.get(node);
      const state = streetState("turn", history);
      const role = laterNodeRole(node), seat = inputs.spot[role];
      const baseItems = cachedBaseRange(inputs, baseCache, seat, turnBoard);
      const reached = scaleFlopPath(baseItems, role, flopPath.steps, flopMixFor, flopBoard.cards);
      const line = lineFor(flopPath.aggressor, role);
      const items = scaleLaterPath(reached, role, state.steps, mixFor, turnBoard, flopPath.aggressor);
      const summary = summarize(items, LATER_NODES[node], mixFor, tierFor, node, turnBoard, line, true);
      addSummary(collection, node, flopBoard.id, LATER_NODES[node], summary);
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
            let items = scaleFlopPath(baseItems, role, flopPath.steps, flopMixFor, flopBoard.cards);
            items = scaleLaterPath(items, role, turnSteps, mixFor, runout.turnBoard, flopPath.aggressor);
            items = scaleLaterPath(items, role, state.steps, mixFor, runout.riverBoard, riverAggressor);
            const line = lineFor(riverAggressor, role);
            const targets = {};
            if (node.endsWith("_first")) for (const action of LATER_NODES[node].filter(value => value !== "check")) {
              const size = action === "allin" ? Math.min(table.stacks[inputs.spot.ip], table.stacks[inputs.spot.oop]) / table.pot
                : betFraction("river", action);
              targets[action] = size / (1 + 2 * size);
            }
            const summary = summarize(items, LATER_NODES[node], mixFor, tierFor, node, runout.riverBoard, line, true);
            addSummary(collection, node, flopBoard.id, LATER_NODES[node], summary, targets);
          }
        }
      }
    }
  }

  const laterNodes = [...turnNodes, ...riverNodes];
  findings.push(...cappedCheckFindings(collection, laterNodes), ...raiseFindings(collection, turnNodes), ...bluffFindings(collection, riverNodes));
  return { findings };
}
