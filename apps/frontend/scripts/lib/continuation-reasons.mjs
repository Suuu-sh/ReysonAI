// Authoring-only facts and Japanese reasons for the bounded continuation tree.
// No equities or frequencies are invented here: both inputs must be saved first.
import { encodeContinuationReasons } from "../../src/estimated/continuation-reason-format.ts";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hands } from "../../src/data.ts";
import { continuationById, twoCallerFourBetToBb } from "../../src/estimated/continuation-tree.ts";
import {
  CONTINUATION_SEED, CONTINUATION_VERSION, continuationBreakEven, continuationFacts,
  continuationMix, createContinuationModel, validContinuationEquity,
} from "../../src/estimated/continuation-model.ts";
import { continuationAllInTarget, continuationCapacity } from "../../src/estimated/continuation-audit.ts";
import { allowedCall } from "../../src/estimated/call-ev.ts";
import { EQR, MULTIWAY_EQR } from "../../src/estimated/eqr.ts";
import { rakeConfig, raked } from "../../src/estimated/rake.ts";
import { effectiveStackBb, isInPosition, sizing } from "../../src/estimated/sizing.ts";

const ACTIONS = ["fold", "call", "four_bet", "all_in"];
const NAMES = { open: "オープン", call: "コール", fold: "フォールド", three_bet: "3bet", squeeze: "スクイーズ", four_bet: "4bet", all_in: "オールイン" };
const FAMILIES = { squeeze: "1人コール後のスクイーズ", cold_four_bet: "コールド4bet", two_caller_squeeze: "2人コール後のスクイーズ", three_bet_cold_call: "3betへのコールドコール" };
const POLICY_FILES = ["src/estimated/continuation-reason-format.ts", "src/estimated/sizing.ts", "src/estimated/eqr.ts", "src/estimated/rake.ts", "src/estimated/call-ev.ts",
  "src/estimated/continuation-tree.ts", "src/estimated/continuation-model.ts", "src/estimated/continuation-audit.ts", "src/estimated/continuation-defense.ts", "src/estimated/continuation-responses.ts", "src/estimated/audit-policy.ts",
  "scripts/generate-continuation-responses.mjs", "scripts/lib/continuation-profiles.mjs", "scripts/lib/continuation-equity.mjs", "scripts/lib/continuation-evaluator.mjs", "scripts/lib/all-in-call.mjs"];
const round = value => value === null ? null : Math.round(value * 1e6) / 1e6;
const number = value => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
const pct = value => value.toFixed(1);
const ev = value => `${value >= 0 ? "+" : ""}${value.toFixed(2)}BB`;
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fileAt = (directory, id) => directory instanceof URL ? new URL(`${id}.json`, directory) : resolve(directory, `${id}.json`);

// Hash documents one spot at a time, avoiding a second giant JSON allocation.
// Canonical keys make the fingerprint independent of object insertion order;
// array order, every saved row, equity, source and policy remain authoritative.
function hashDocument(hash, name, document) {
  const { spots, ...header } = document ?? {};
  hash.update(stable([name, header]));
  if (Array.isArray(spots)) {
    hash.update("[spots]");
    for (const spot of spots) hash.update(stable(spot));
  } else if (spots && typeof spots === "object") {
    hash.update("{spots}");
    for (const id of Object.keys(spots).sort()) hash.update(stable([id, spots[id]]));
  } else hash.update(stable(spots) ?? "undefined");
}

export function continuationReasonFingerprint({ data, datasets, equities }) {
  const hash = createHash("sha256");
  hash.update(stable({ version: 1, CONTINUATION_VERSION, CONTINUATION_SEED, EQR, MULTIWAY_EQR, rakeConfig,
    sizing, effectiveStackBb, twoCallerFourBetToBb }));
  for (const name of POLICY_FILES) {
    hash.update(name);
    hash.update(readFileSync(new URL(`../../${name}`, import.meta.url)));
  }
  hashDocument(hash, "continuation-responses", data);
  hashDocument(hash, "continuation-call-equities", equities);
  for (const name of Object.keys(datasets).filter(name => !["continuation-responses", "continuation-call-equities"].includes(name)).sort()) {
    hashDocument(hash, name, datasets[name]);
  }
  return hash.digest("hex");
}

function prepare({ data, datasets, equities, wanted }) {
  if (!Array.isArray(data?.spots) || !datasets || !equities?.spots) throw new Error("Missing continuation data, source datasets or equities");
  const selected = new Set(wanted ?? []);
  return { fingerprint: continuationReasonFingerprint({ data, datasets, equities }),
    model: createContinuationModel({ ...datasets, "continuation-responses": data }),
    spots: data.spots.filter(spot => !selected.size || selected.has(spot.id)) };
}

function checkedContext(model, spot, entry) {
  const node = continuationById.get(spot.id);
  if (!node || node.reused) throw new Error(`Unknown new continuation: ${spot.id}`);
  if (Object.entries(node).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(spot[key]))) throw new Error(`Invalid continuation history: ${spot.id}`);
  const context = model.context(node, spot);
  if (spot.unreachable !== context.unreachable || spot.hands?.length !== hands.length) throw new Error(`Invalid continuation reach/hands: ${spot.id}`);
  for (let i = 0; i < hands.length; i++) {
    const row = spot.hands[i];
    if (row.hand !== hands[i] || ACTIONS.some(action => !Number.isInteger(row[action]) || row[action] < 0 || row[action] > 100 ||
        !node.legal_actions.includes(action) && row[action] !== 0) || ACTIONS.reduce((sum, action) => sum + row[action], 0) !== 100 ||
        row.raise_to_size_bb !== (row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null) ||
        context.reach(row.hand) <= 0 && row.fold !== 100) throw new Error(`Invalid continuation row: ${spot.id}/${row.hand}`);
  }
  if (!validContinuationEquity(entry, context)) throw new Error(`Stale continuation equity: ${spot.id}`);
  if (node.bet_level === 5) {
    const { maxCalls } = continuationCapacity(spot, context, entry);
    if (spot.hands.some(row => row.call !== maxCalls.get(row.hand))) throw new Error(`Invalid continuation all-in mix: ${spot.id}`);
  } else for (const row of spot.hands) {
    if (context.reach(row.hand) > 0 && row.call > allowedCall(row.call, continuationFacts(context, row.hand, entry).call_ev_bb)) {
      throw new Error(`Invalid continuation call gate: ${spot.id}/${row.hand}`);
    }
  }
  return context;
}

function role(node) {
  if (node.hero === node.opener) return "元のオープナー";
  if (node.hero === node.squeezer) return "元のスクイーザー";
  if (node.hero === node.three_bettor) return "元の3bettor";
  if (node.hero === node.four_bettor) return "元のコールド4bettor";
  if (node.hero === node.cold_caller) return "3betのコールドコーラー";
  const index = node.callers.indexOf(node.hero);
  return index >= 0 ? `${index + 1}人目の元のコーラー` : "参加者";
}

function sourceAction(node, factor) {
  const item = node.history.find(item => item.source?.dataset === factor.dataset && item.source.spot_id === factor.spot_id && item.source.action === factor.action);
  return `${NAMES[factor.action] ?? factor.action}${item?.to_size_bb === null || item?.to_size_bb === undefined ? "" : `（総額${number(item.to_size_bb)}BB）`}`;
}

function unreachableReason(context, model, hand) {
  const { node } = context;
  const zeroActions = node.source_factors[node.hero].filter(factor => model.sources.get(`${factor.dataset}/${factor.spot_id}`).hands.find(row => row.hand === hand)[factor.action] === 0);
  let cause;
  if (zeroActions.length) cause = `${node.hero}の保存済み${zeroActions.map(factor => sourceAction(node, factor)).join("・")}頻度がこのハンドで0%`;
  else if (!context.historyPossible) {
    const empty = node.participants.filter(seat => ![...context.weights[seat].values()].some(weight => weight > 0));
    cause = `${empty.map(seat => `${seat}の保存済み${node.source_factors[seat].map(factor => sourceAction(node, factor)).join("→")}の積`).join("、")}が全ハンドで0%となり、元の履歴自体が空`;
  } else cause = "Heroのカードと全参加者（途中フォールド者を含む）の保存到達レンジを同時に配れる、カード重複のないホールカードの組合せがない";
  return `${cause}のため、この経路は対象外です。形式上フォールド100%であり、実際の推奨ではありません。`;
}

function spotFacts(context) {
  const { node, input, spot } = context;
  const mix = continuationMix(spot, context);
  return {
    hero: node.hero, family: node.family, family_label: FAMILIES[node.family], role: role(node), opener: node.opener,
    callers: node.callers, squeezer: node.squeezer ?? null, three_bettor: node.three_bettor ?? null,
    cold_caller: node.cold_caller ?? null, four_bettor: node.four_bettor ?? null,
    live_participants: node.live_participants, opponents: input.opponents, pending_actors: input.pending_actors,
    dead_opponents: input.dead_opponents ?? [],
    folded: node.folded, forced_fold_seats: node.history.filter(item => item.forced && item.action === "fold").map(item => item.seat),
    position: input.opponents.every(seat => isInPosition(node.hero, seat)) ? "IP" : "OOP",
    bet_level: node.bet_level, facing_size_bb: node.facing_size_bb, hero_invested_bb: node.contributions_bb[node.hero],
    cost_to_call_bb: input.cost_to_call, pot_before_call_bb: node.pot_bb, total_pot_after_call_bb: input.total_pot_after_call,
    raked_pot_after_call_bb: raked(input.total_pot_after_call), dead_money_bb: node.dead_money_bb,
    call_break_even_equity_pct: round(continuationBreakEven(context)), three_bet_size_bb: node.three_bet_size_bb,
    four_bet_size_bb: node.four_bet_size_bb, all_in_size_bb: effectiveStackBb,
    reachable_combos: round(mix.reachable_combos),
    aggregation_model: "Hero自身の前段行動頻度×コンボ数で加重。他者カードとの整合が不可能なハンドは除外しますが、正の整合確率による再加重はしていません。共同カード条件付きの全員フォールド監査とは別の集計です。",
    ...Object.fromEntries(ACTIONS.map(action => [`weighted_${action}_pct`, round(mix[action])])),
    history_possible: context.historyPossible, unreachable: context.unreachable,
    opponent_model: input.opponent_model,
  };
}

function factsFile(context, entry, model, fingerprint) {
  const spot = spotFacts(context);
  return { spot_id: context.spot.id, type: "continuation", source_fingerprint: fingerprint, spot,
    hands: context.spot.hands.map(row => {
      const computed = continuationFacts(context, row.hand, entry);
      const reachable = computed.reach_pct > 0;
      // Keep raw computed values for threshold decisions; round only presentation.
      return { hand: row.hand, ...computed,
        equity_margin_pct: reachable ? computed.equity_pct - continuationBreakEven(context) : null,
        all_in_target_call_pct: reachable && context.input.all_in ? continuationAllInTarget(computed.equity_pct - continuationBreakEven(context)) : null,
        ...Object.fromEntries(ACTIONS.map(action => [`${action}_pct`, row[action]])), raise_to_size_bb: row.raise_to_size_bb,
        unreachable_reason: reachable ? null : unreachableReason(context, model, row.hand) };
    }) };
}

export function generateContinuationFacts({ data, datasets, equities, outDir, wanted }) {
  if (!outDir) throw new Error("Continuation fact output directory is required");
  const { fingerprint, model, spots } = prepare({ data, datasets, equities, wanted });
  mkdirSync(outDir, { recursive: true });
  for (const spot of spots) {
    const entry = equities.spots[spot.id], context = checkedContext(model, spot, entry);
    writeFileSync(fileAt(outDir, spot.id), JSON.stringify(factsFile(context, entry, model, fingerprint)) + "\n");
  }
  return spots.length;
}

export function composeContinuationReasons({ data, datasets, equities, factDir, reasonDir, wanted }) {
  if (!factDir || !reasonDir) throw new Error("Continuation fact and reason directories are required");
  const { fingerprint, model, spots } = prepare({ data, datasets, equities, wanted });
  mkdirSync(reasonDir, { recursive: true });
  for (const spot of spots) {
    const entry = equities.spots[spot.id], context = checkedContext(model, spot, entry), filename = fileAt(factDir, spot.id);
    if (!existsSync(filename)) throw new Error(`Missing continuation facts: ${spot.id}`);
    const saved = JSON.parse(readFileSync(filename, "utf8"));
    if (saved.source_fingerprint !== fingerprint || saved.spot_id !== spot.id || saved.type !== "continuation") throw new Error(`Stale continuation facts: ${spot.id}; regenerate facts`);
    const expected = factsFile(context, entry, model, fingerprint);
    if (stable(saved) !== stable(expected)) throw new Error(`Mismatched continuation facts: ${spot.id}; regenerate facts`);
    writeFileSync(fileAt(reasonDir, spot.id), JSON.stringify(encodeContinuationReasons(saved)) + "\n");
  }
  return spots.length;
}
