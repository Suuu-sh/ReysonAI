// Per-hand action EV and equity realization (EQR) for the local BTN-open / BB-call
// flop pilot. Both players follow the saved AI candidate on the flop and the shared
// fixed turn/river model, so these are values of the AI policy against itself —
// not GTO, not solver EV. Local-only output under .local/postflop-ai/.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, seedFor, seededRandom } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.js";
import { boards, comboRange, config, loadInputs, root } from "./inputs.mjs";
import { loadCandidate } from "./generate.mjs";
import { NODES, choose, policyMix } from "./policy.mjs";
import { continuationMix } from "./simulation.mjs";

export const HAND_EV_VERSION = 1;
export const handEvPath = join(root, ".local/postflop-ai/btn-bb-srp-v1-hand-ev.json");
export const DEFAULT_SAMPLES = 2000;
const round = value => Math.round(value * 100) / 100;
const rake = pot => Math.min(pot * gameConfig.rake.rate, gameConfig.rake.cap_bb);
const other = seat => seat === "BTN" ? "BB" : "BTN";

// The flop decision points of the pilot tree, keyed by the actions before them.
export const HISTORIES = Object.freeze({
  "": { node: "btn_first", actor: "BTN" },
  bet33: { node: "bb_vs_33", actor: "BB" },
  bet75: { node: "bb_vs_75", actor: "BB" },
  "bet33,raise": { node: "btn_vs_raise", actor: "BTN" },
  "bet75,raise": { node: "btn_vs_raise", actor: "BTN" },
});

// Plays the rest of the hand from `history` with the actor forced to `forced`.
// Returns the actor's chips won from this decision on (earlier flop chips are sunk).
export function playFromNode({ hands, flop, runout, history, forced, policy, random }) {
  const stacks = { BTN: 97.5, BB: 97.5 }, invested = { BTN: 0, BB: 0 };
  let pot = 5.5, winner = null;
  const put = (seat, amount) => {
    const value = round(Math.min(stacks[seat], amount));
    stacks[seat] = round(stacks[seat] - value);
    invested[seat] = round(invested[seat] + value);
    pot = round(pot + value);
    return value;
  };
  const { node: startNode, actor } = HISTORIES[history.join(",")];
  let atNode = null;
  const decide = (seat, node, step) => {
    if (step < history.length) return history[step];
    if (node === startNode) { atNode = { ...invested }; return forced; }
    return choose(policyMix(policy, node, hands[seat], flop), random(), NODES[node]);
  };
  const first = decide("BTN", "btn_first", 0);
  if (first !== "check") {
    const bet = put("BTN", pot * (first === "bet33" ? config.flop_bet_fractions[0] : config.flop_bet_fractions[1]));
    const response = decide("BB", first === "bet33" ? "bb_vs_33" : "bb_vs_75", 1);
    if (response === "fold") winner = "BTN";
    else if (response === "call") put("BB", bet);
    else {
      put("BB", Math.min(stacks.BB + invested.BB, round(bet * config.flop_check_raise_multiplier)) - invested.BB);
      if (decide("BTN", "btn_vs_raise", 2) === "fold") winner = "BB";
      else put("BTN", invested.BB - invested.BTN);
    }
  }
  for (let street = 0; street < 2 && !winner; street++) {
    if (!stacks.BTN || !stacks.BB) break;
    const board = [...flop, ...runout.slice(0, street + 1)];
    const cont = (seat, facing) => choose(continuationMix(hands[seat], board, "standard", facing), random());
    if (cont("BB", false) === "bet") {
      const amount = put("BB", Math.min(pot * config.continuation_bet_fraction, stacks.BTN));
      if (cont("BTN", true) === "fold") winner = "BB"; else put("BTN", amount);
    } else if (cont("BTN", false) === "bet") {
      const amount = put("BTN", Math.min(pot * config.continuation_bet_fraction, stacks.BB));
      if (cont("BB", true) === "fold") winner = "BTN"; else put("BB", amount);
    }
  }
  if (!winner) {
    const board = [...flop, ...runout];
    const btn = evaluate([...hands.BTN, ...board]), bb = evaluate([...hands.BB, ...board]);
    winner = btn === bb ? "tie" : btn > bb ? "BTN" : "BB";
  }
  if (winner !== "tie") {
    const excess = round(invested[winner] - invested[other(winner)]);
    if (excess > 0) { invested[winner] = round(invested[winner] - excess); pot = round(pot - excess); }
  }
  const paid = pot - rake(pot);
  const share = winner === actor ? paid : winner === "tie" ? paid / 2 : 0;
  return share - invested[actor] + atNode[actor];
}

// Pot at a decision and each player's reach there (saved preflop frequency × the
// candidate's earlier flop actions for that exact combo).
function nodeSetup(history, inputs, policy, flop) {
  const btn = comboRange(inputs.opening.hands, "open", flop);
  const bb = comboRange(inputs.response.hands, "call", flop);
  const scale = (range, node, action) => range.map(item => ({ ...item, weight: item.weight * policyMix(policy, node, item.combo, flop)[action] / 100 }));
  const [first, second] = history;
  const bet = first ? round(5.5 * (first === "bet33" ? config.flop_bet_fractions[0] : config.flop_bet_fractions[1])) : 0;
  if (!first) return { pot: 5.5, hero: btn, villain: bb };
  const btnBet = scale(btn, "btn_first", first);
  if (!second) return { pot: round(5.5 + bet), hero: bb, villain: btnBet };
  return { pot: round(5.5 + bet + round(bet * config.flop_check_raise_multiplier)), hero: btnBet, villain: scale(bb, first === "bet33" ? "bb_vs_33" : "bb_vs_75", "raise") };
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

export function handEvForBoard(board, inputs, policy, samples = DEFAULT_SAMPLES) {
  const out = {};
  for (const [key, { node, actor }] of Object.entries(HISTORIES)) {
    const history = key ? key.split(",") : [];
    const { pot, hero, villain } = nodeSetup(history, inputs, policy, board.cards);
    const actions = NODES[node];
    const pickVillain = sampler(villain.filter(item => item.weight > 0));
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
        const hands = actor === "BTN" ? { BTN: heroCombo, BB: villainCombo } : { BTN: villainCombo, BB: heroCombo };
        const final = [...board.cards, ...runout];
        const h = evaluate([...heroCombo, ...final]), v = evaluate([...villainCombo, ...final]);
        wins += h > v ? 1 : h === v ? 0.5 : 0;
        // Common random numbers: every action replays the same deal and random stream.
        const streamSeed = Math.floor(random() * 2 ** 32);
        const mix = policyMix(policy, node, heroCombo, board.cards);
        for (const action of actions) {
          const value = playFromNode({ hands, flop: board.cards, runout, history, forced: action, policy, random: seededRandom(streamSeed) });
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

export function generateHandEv({ samples = DEFAULT_SAMPLES, onBoard = () => {} } = {}) {
  const inputs = loadInputs();
  const candidate = loadCandidate(inputs);
  const result = { kind: "ai_estimate_not_gto", version: HAND_EV_VERSION, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, samples_per_hand_action: samples, seed: config.seed,
    note: "AI方針どうしの自己対戦（ターン・リバーは固定モデル）で見積もった値。GTO・ソルバーのEVではない。", boards: {} };
  for (const board of boards()) { result.boards[board.id] = handEvForBoard(board, inputs, candidate.policy, samples); onBoard(board.id); }
  writeFileSync(handEvPath, `${JSON.stringify(result)}\n`);
  return result;
}

// Read-only lookup for the local view; null when missing or stale for the candidate.
export function loadHandEv(inputs, candidate) {
  if (!existsSync(handEvPath)) return null;
  const data = JSON.parse(readFileSync(handEvPath, "utf8"));
  return data.version === HAND_EV_VERSION && data.source_hash === inputs.fingerprint && data.policy_hash === candidate.metadata.policy_hash ? data : null;
}

// GET /local-postflop-hand-ev?board=As7d2c&history=bet33,raise&hand=AKo — read-only, local-only.
let cache = null;
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
    const inputs = loadInputs();
    const candidate = loadCandidate(inputs);
    if (!cache || cache.policy_hash !== candidate.metadata.policy_hash || cache.source_hash !== inputs.fingerprint) cache = loadHandEv(inputs, candidate);
    if (!cache) {
      res.writeHead(404).end(JSON.stringify({ error: "ハンド別EVが未計算か、方針と一致しません。npm run postflop-ai:hand-ev で計算してください。" })); return;
    }
    const history = url.searchParams.get("history") ?? "";
    const spot = cache.boards[url.searchParams.get("board")]?.[history];
    if (!spot) { res.writeHead(404).end(JSON.stringify({ error: "この場面のEVはありません。" })); return; }
    const hand = url.searchParams.get("hand");
    res.writeHead(200).end(JSON.stringify({ node: spot.node, actor: spot.actor, pot_bb: spot.pot_bb, hand,
      row: spot.rows[hand] ?? null, samples: cache.samples_per_hand_action, note: cache.note }));
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 409).end(JSON.stringify({ error: error.message }));
  }
}
