// Real computed facts for the BTN_open_BB_call spot, built with the same functions the app uses, so explanation
// tests and the sample renderings are grounded in real policy output. Returns null when the artifacts are missing.
import { existsSync } from "node:fs";
import { artifactPaths, loadInputs } from "../../scripts/postflop-ai/inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../../scripts/postflop-ai/generate.mjs";
import { computeBoard, computeExplain, computeLaterExplain, computeLaterRangeFacts, computeLaterView, computeRangeFacts } from "../../src/estimated/postflop-compute.ts";
import opening from "../../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../../src/estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../../src/estimated/four-bet-responses.json" with { type: "json" };
import limp from "../../src/estimated/limp-responses.json" with { type: "json" };

export const spotId = "BTN_open_BB_call";
export function realContext() {
  const paths = artifactPaths(loadInputs(spotId).spot);
  if (!existsSync(paths.candidate) || !existsSync(paths.laterCandidate)) return null;
  const datasets = { opening, responses, threeBets, fourBets, limp };
  const inputs = loadInputs(spotId);
  const flopCandidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, flopCandidate);
  return { datasets, flopCandidate, laterCandidate };
}

const pick = (hand, cards, row) => cards ? row.combos.find(c => c.cards === cards) : null;

// Inputs for buildAdvancedExplanation of one flop decision (btn_first or bb_vs_<size>).
export function flopInput(ctx, { board, node, hand, cards, prev = "bet33" }) {
  const history = node === "btn_first" ? [] : node.startsWith("bb_vs_") ? [`bet${node.slice(6)}`] : [];
  if (node.startsWith("bb_vs_")) prev = `bet${node.slice(6)}`;
  const view = computeBoard({ spotId, board, ...ctx });
  const row = view.nodes[node]?.rows.find(r => r.hand === hand);
  if (!row || !row.reachable) return null;
  const combo = pick(hand, cards, row);
  if (cards && !combo) return null;
  const combos = (combo ? [combo] : row.combos).filter(c => c.weight > 0).map(({ cards: x, weight }) => ({ cards: x, weight }));
  const explain = computeExplain({ spotId, board, node, prev, history, datasets: ctx.datasets, flopCandidate: ctx.flopCandidate,
    laterCandidate: ctx.laterCandidate, ...(combo ? { cards: combo.cards } : { combos }) });
  const range_facts = computeRangeFacts({ spotId, board, node, prev, history, datasets: ctx.datasets, flopCandidate: ctx.flopCandidate });
  return { node, hand: combo ? combo.cards : hand, actionMix: combo ? combo.mix : row.mix, tiers: combo ? { [combo.tier]: 1 } : row.tiers,
    texture: view.texture, explain: range_facts ? { ...explain, range_facts } : explain, board,
    ...(combo ? { cards: combo.cards } : { combos }), positions: { ip: "BTN", oop: "BB" } };
}

export function laterInput(ctx, { flop, flopActions, turn, turnActions, river = "", riverActions = "", hand, cards }) {
  const base = { spotId, flop, flopActions, turn, turnActions, river, riverActions, ...ctx };
  const view = computeLaterView(base);
  const row = view.rows.find(r => r.hand === hand);
  if (!row || !row.reachable) return null;
  const combo = pick(hand, cards, row);
  if (cards && !combo) return null;
  const combos = (combo ? [combo] : row.combos).filter(c => c.weight > 0).map(({ cards: x, weight }) => ({ cards: x, weight }));
  const explain = computeLaterExplain({ ...base, ...(combo ? { cards: combo.cards } : { combos }) });
  const range_facts = computeLaterRangeFacts(base);
  return { node: view.node, hand: combo ? combo.cards : hand, actionMix: combo ? combo.mix : row.mix,
    tiers: combo ? { [combo.tier]: 1 } : row.tiers, texture: view.texture,
    explain: range_facts ? { ...explain, range_facts } : explain, board: `${flop}${turn}${river}`,
    ...(combo ? { cards: combo.cards } : { combos }), positions: { ip: "BTN", oop: "BB" }, rows: view.rows };
}

// ---- repetition measurement ---------------------------------------------------------------------------------
export const splitSentences = text => text.split(/(?<=[.。])\s*/).map(x => x.trim()).filter(Boolean);

// For one decision node and several hands: the share of each hand's sentences that also appear in the explanation
// of at least one other hand at that node. `mask` replaces each hand's own name so the shared wording is compared.
export function repetitionShare(explanations, { mask = false } = {}) {
  const sets = explanations.map(({ name, text }) => new Set(splitSentences(text).map(x => mask ? x.split(name).join("§") : x)));
  const shares = sets.map((own, i) => {
    let shared = 0;
    for (const s of own) if (sets.some((other, j) => j !== i && other.has(s))) shared++;
    return own.size ? shared / own.size : 0;
  });
  return { shares, mean: shares.reduce((a, b) => a + b, 0) / shares.length };
}

// Every n-th reachable hand class of a view, so the sample spans strong hands, draws and air.
export function sampleRows(rows, count) {
  const reachable = rows.filter(r => r.reachable && r.mix && Object.keys(r.mix).length);
  const step = Math.max(1, Math.floor(reachable.length / count));
  return reachable.filter((_, i) => i % step === 0).slice(0, count);
}
