// Per-hand action EV and equity realization (EQR) for the local heads-up flop pilot (any
// spot in spots.mjs, on its tree). Both players follow the saved AI candidate on the flop and
// the saved later-street policy (or the fixed reference), so these are AI self-play values —
// not GTO, not solver EV. Local-only output under .local/postflop-ai/.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { artifactPaths, boards, config, laterSizingHash, loadInputs, seatRange } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { NODES, choose, policyMix, scaleByPath } from "./policy.mjs";
import { laterPolicyMix, referenceLaterPolicy } from "./later-policy.mjs";
import { LATER_NODES } from "./later-tree.mjs";
import { createTable, playFlop, playLaterStreetsWithPolicy, rake, settle } from "./engine.mjs";
import { DEFAULT_SPOT_ID, spotById } from "./spots.mjs";
import { flopState, treeHistories } from "./tree.mjs";

export const HAND_EV_VERSION = 2;
export const DEFAULT_SAMPLES = 2000;
const referenceLater = referenceLaterPolicy();
const round = value => Math.round(value * 100) / 100;

// The flop decision points of a tree, keyed by the actions before them ("oop_checks" by
// default). `role` is the in-position ("ip") or out-of-position ("oop") player of the spot.
export const historiesFor = tree => treeHistories(tree);
export const HISTORIES = Object.freeze(treeHistories("oop_checks"));

// Plays the rest of the hand from `history` with the actor forced to `forced`.
// Returns the actor's chips won from this decision on (earlier flop chips are sunk).
export function playFromNode({ hands, flop, runout, history, forced, policy, laterPolicy = referenceLater, random, spot = spotById(), tree = spot.tree ?? "oop_checks" }) {
  const start = flopState(tree, history);
  if (start.end) throw new Error("No decision after this flop history");
  const actor = spot[start.role];
  const table = createTable(spot);
  let atNode = null;
  const decide = (seat, node, step) => {
    if (step < history.length) return history[step];
    if (step === history.length) { atNode = { ...table.invested }; return forced; }
    return choose(policyMix(policy, node, hands[seat], flop), random(), NODES[node]);
  };
  playFlop(table, tree, decide, config);
  playLaterStreetsWithPolicy(table, flop, runout, (seat, node, board, line) =>
    choose(laterPolicyMix(laterPolicy, node, hands[seat], board, line), random(), LATER_NODES[node]), config, table.lastAggressor);
  const winner = settle(table, hands, [...flop, ...runout]);
  const paid = table.pot - rake(table.pot);
  const share = winner === actor ? paid : winner === "tie" ? paid / 2 : 0;
  return share - table.invested[actor] + atNode[actor];
}

// Pot at a decision and each player's reach there (saved preflop frequency × the
// candidate's earlier flop actions for that exact combo).
function nodeSetup(history, inputs, policy, flop, tree) {
  const { spot } = inputs;
  const state = flopState(tree, history);
  // Replays the chips of the history (the same rounding and stack caps as the hand itself).
  const table = createTable(spot);
  const stop = new Error("stop at the decision");
  try {
    playFlop(table, tree, (seat, node, index) => { if (index < history.length) return history[index]; throw stop; }, config);
  } catch (error) { if (error !== stop) throw error; }
  const range = role => scaleByPath(seatRange(inputs, spot[role], flop), role, state.steps, policy, flop);
  const heroRole = state.role, villainRole = heroRole === "ip" ? "oop" : "ip";
  return { pot: table.pot, hero: range(heroRole), villain: range(villainRole) };
}

const handClass = ([a, b]) => {
  const ranks = "23456789TJQKA";
  const [high, low] = (a >> 2) >= (b >> 2) ? [a, b] : [b, a];
  if ((high >> 2) === (low >> 2)) return ranks[high >> 2].repeat(2);
  return ranks[high >> 2] + ranks[low >> 2] + ((high & 3) === (low & 3) ? "s" : "o");
};

function sampler(items) {
  let total = 0;
  const cumulative = items.map(item => (total += item.weight));
  return random => {
    const target = random() * total;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    return items[lo];
  };
}

export function handEvForBoard(board, inputs, policy, samples = DEFAULT_SAMPLES, laterPolicy = referenceLater) {
  const { spot } = inputs;
  const out = {};
  for (const [key, { node, role }] of Object.entries(treeHistories(spot.tree))) {
    const actor = spot[role];
    const history = key ? key.split(",") : [];
    const { pot, hero, villain } = nodeSetup(history, inputs, policy, board.cards, spot.tree);
    const actions = NODES[node];
    const reachable = villain.filter(item => item.weight > 0);
    // A node the policies never reach on this board (e.g. no hand bets 125% on a paired flop).
    if (!reachable.length || !hero.some(item => item.weight > 0)) { out[key] = { node, actor, pot_bb: pot, rows: {}, unreachable: true }; continue; }
    const pickVillain = sampler(reachable);
    const byClass = new Map();
    for (const item of hero) if (item.weight > 0) {
      const hand = handClass(item.combo);
      if (!byClass.has(hand)) byClass.set(hand, []);
      byClass.get(hand).push(item);
    }
    const rows = {};
    for (const [hand, combos] of byClass) {
      const pickHero = sampler(combos);
      const random = seededRandom(seedFor(`${config.seed}|hand-ev|${board.id}|${key}|${hand}`));
      const sums = Object.fromEntries(actions.map(action => [action, 0]));
      let wins = 0, mixEv = 0;
      for (let i = 0; i < samples; i++) {
        const heroCombo = pickHero(random).combo;
        let villainCombo;
        do villainCombo = pickVillain(random).combo; while (villainCombo.some(card => heroCombo.includes(card)));
        const used = new Set([...heroCombo, ...villainCombo, ...board.cards]);
        const runout = [];
        while (runout.length < 2) { const card = Math.floor(random() * 52); if (!used.has(card)) { used.add(card); runout.push(card); } }
        const hands = { [actor]: heroCombo, [actor === spot.ip ? spot.oop : spot.ip]: villainCombo };
        const final = [...board.cards, ...runout];
        const h = evaluate([...heroCombo, ...final]), v = evaluate([...villainCombo, ...final]);
        wins += h > v ? 1 : h === v ? 0.5 : 0;
        // Common random numbers: every action replays the same deal and random stream.
        const streamSeed = Math.floor(random() * 2 ** 32);
        const mix = policyMix(policy, node, heroCombo, board.cards);
        for (const action of actions) {
          const value = playFromNode({ hands, flop: board.cards, runout, history, forced: action, policy, laterPolicy, random: seededRandom(streamSeed), spot, tree: spot.tree });
          sums[action] += value;
          mixEv += mix[action] / 100 * value;
        }
      }
      const equity = wins / samples, ev = mixEv / samples;
      const totalWeight = combos.reduce((sum, item) => sum + item.weight, 0);
      rows[hand] = {
        equity_pct: round(equity * 100),
        ev_bb: Object.fromEntries(actions.map(action => [action, round(sums[action] / samples)])),
        mix_ev_bb: round(ev),
        // Same definition as preflop: EV = equity × EQR × raked(pot).
        eqr: equity > 0.02 ? round(ev / (equity * (pot - rake(pot)))) : null,
        mix: Object.fromEntries(actions.map(action => [action, round(combos.reduce((sum, item) => sum + item.weight * policyMix(policy, node, item.combo, board.cards)[action], 0) / totalWeight)])),
      };
    }
    out[key] = { node, actor, pot_bb: pot, rows };
  }
  return out;
}

export function generateHandEv({ spotId = DEFAULT_SPOT_ID, samples = DEFAULT_SAMPLES, onBoard = () => {} } = {}) {
  const inputs = loadInputs(spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  const laterPolicy = laterCandidate?.policy ?? referenceLater;
  const result = { kind: "ai_estimate_not_gto", version: HAND_EV_VERSION, source_hash: inputs.fingerprint,
    later_policy_hash: sha(laterPolicy), later_sizing_hash: laterSizingHash(),
    policy_hash: candidate.metadata.policy_hash, samples_per_hand_action: samples, seed: config.seed,
    note: "AI方針どうしの自己対戦（ターン・リバーは保存済み方針、未保存時は固定参照方針）で見積もった値。GTO・ソルバーのEVではない。", boards: {} };
  for (const board of boards()) { result.boards[board.id] = handEvForBoard(board, inputs, candidate.policy, samples, laterPolicy); onBoard(board.id); }
  writeFileSync(artifactPaths(inputs.spot).handEv, `${JSON.stringify(result)}\n`);
  return result;
}

// Read-only lookup for the local view; null when missing or stale for the candidate.
export function loadHandEv(inputs, candidate, laterCandidate = loadLaterCandidate(inputs, candidate)) {
  const path = artifactPaths(inputs.spot).handEv;
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return matchesHandEv(data, inputs, candidate, laterCandidate) ? data : null;
}

const matchesHandEv = (data, inputs, candidate, laterCandidate) => data?.kind === "ai_estimate_not_gto" &&
  data.version === HAND_EV_VERSION && data.source_hash === inputs.fingerprint && data.policy_hash === candidate.metadata.policy_hash &&
  data.later_policy_hash === sha(laterCandidate?.policy ?? referenceLater) && data.later_sizing_hash === laterSizingHash();

// GET /local-postflop-hand-ev?spot=BTN_open_BB_call&board=As7d2c&history=bet33,raise&hand=AKo
// — read-only, local-only. `spot` defaults to BTN_open_BB_call.
const cache = new Map();
export function handEvMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/local-postflop-hand-ev") { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const host = req.headers.host?.split(":")[0];
  if (req.method !== "GET" || !["127.0.0.1", "localhost"].includes(host)) {
    res.writeHead(req.method !== "GET" ? 405 : 403).end(JSON.stringify({ error: "ローカルの読み取り専用です。" })); return;
  }
  try {
    const inputs = loadInputs(url.searchParams.get("spot") || DEFAULT_SPOT_ID);
    const candidate = loadCandidate(inputs);
    const laterCandidate = loadLaterCandidate(inputs, candidate);
    let data = cache.get(inputs.spot.id);
    if (!matchesHandEv(data, inputs, candidate, laterCandidate)) {
      data = loadHandEv(inputs, candidate, laterCandidate);
      if (data) cache.set(inputs.spot.id, data); else cache.delete(inputs.spot.id);
    }
    if (!data) {
      res.writeHead(404).end(JSON.stringify({ error: `ハンド別EVが未計算か、方針と一致しません。npm run postflop-ai:hand-ev -- --spot ${inputs.spot.id} で計算してください。` })); return;
    }
    const history = url.searchParams.get("history") ?? "";
    const node = data.boards[url.searchParams.get("board")]?.[history];
    if (!node) { res.writeHead(404).end(JSON.stringify({ error: "この場面のEVはありません。" })); return; }
    const hand = url.searchParams.get("hand");
    res.writeHead(200).end(JSON.stringify({ spot: inputs.spot.id, node: node.node, actor: node.actor, pot_bb: node.pot_bb, hand,
      row: node.rows[hand] ?? null, samples: data.samples_per_hand_action, note: data.note }));
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 409).end(JSON.stringify({ error: error.message }));
  }
}
