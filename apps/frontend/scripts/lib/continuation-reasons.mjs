// Authoring-only facts and Japanese reasons for the bounded continuation tree.
// No equities or frequencies are invented here: both inputs must be saved first.
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
const POLICY_FILES = ["src/estimated/sizing.ts", "src/estimated/eqr.ts", "src/estimated/rake.ts", "src/estimated/call-ev.ts",
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

function handGroup(hand) {
  if (["AA", "KK"].includes(hand)) return "最上位ペア";
  if (hand.length === 2) return "ペア";
  if (["AKs", "AKo", "AQs", "AQo"].includes(hand)) return "高いAを含むハンド";
  if (["A5s", "A4s"].includes(hand)) return "Aのブロッカーとホイールの伸びしろを持つスーテッドハンド";
  if (hand.endsWith("s")) return "フラッシュへの伸びしろがあるスーテッドハンド";
  return "フラッシュへの伸びしろを持たないオフスートハンド";
}

function raiseReason(row) {
  if (row.four_bet + row.all_in === 0) return "";
  const name = row.four_bet ? "4bet" : "オールイン";
  const destination = `総額${number(row.raise_to_size_bb)}BBの${name}`;
  if (["AA", "KK", "QQ", "AKs", "AKo"].includes(row.hand)) return `${handGroup(row.hand)}をバリュー候補として${destination}にも配分した独立推定です。`;
  if (["A5s", "A4s"].includes(row.hand)) return `AでAA・AKの組合せを減らし、スートとホイールの伸びしろを使う少量ブラフ候補として${destination}に配分しています。`;
  return `${handGroup(row.hand)}の中で強さ順と参加者数を考慮し、${destination}へ限定的に配分した独立推定です。`;
}

function callReason(row, facts, spot) {
  if (spot.bet_level === 5) {
    const reduced = row.call < facts.all_in_target_call_pct;
    return `オールインではEQR=1、コールEVは${ev(facts.call_ev_bb)}。必要勝率との差${facts.equity_margin_pct >= 0 ? "+" : ""}${pct(facts.equity_margin_pct)}ptから共通±2pt帯・5%刻みではコール${facts.all_in_target_call_pct}%${reduced ? `ですが、同じ手役群・スート間の強さ順上限で${row.call}%へ抑えています` : "としています"}。`;
  }
  const measurement = `勝率${pct(facts.equity_pct)}%×仮定EQR ${round(facts.eqr)}で実現後${pct(facts.realized_equity_pct)}%、コールEVは${ev(facts.call_ev_bb)}です。`;
  if (facts.call_ev_bb < -0.05) return `${measurement}共通ゲートの−0.05BB未満なのでコールを除外しています。`;
  if (row.call === 0) return `${measurement}この値だけで参加を決めず、独立した手役群の配分と強さ順制約を反映してコールは0%です。`;
  const boundary = facts.call_ev_bb < 0.05 ? "共通境界帯ではコールを最大50%に制限します。" : "";
  const protect = ["AA", "KK", "QQ", "AKs"].includes(row.hand)
    ? "強い候補をコールにも残し、コールレンジの保護を意図しています。"
    : `${handGroup(row.hand)}の継続候補を、価格と仮定の実現率で絞っています。`;
  return `${measurement}${boundary}${protect}`;
}

function compose(row, facts, spot) {
  if (facts.unreachable_reason) return facts.unreachable_reason;
  const remaining = spot.pending_actors.length
    ? `未応答は${spot.pending_actors.join("・")}で、その将来の追加コール額は足していません。`
    : "Hero以外にこの賭け額への未応答者はいません。";
  const context = `${spot.family_label}の続きで、${spot.hero}は${spot.role}です。既投入${number(spot.hero_invested_bb)}BBから追加${number(spot.cost_to_call_bb)}BBを払い総額${number(spot.facing_size_bb)}BBへコールすると、実際のポットは${number(spot.total_pot_after_call_bb)}BB（うちフォールド済みのデッドマネー${number(spot.dead_money_bb)}BB）です。`;
  const dead = spot.dead_opponents.length ? `途中フォールドした${spot.dead_opponents.join("・")}の保存レンジはカードの使用可能性だけに反映します。` : "";
  const assumption = `${spot.opponents.join("・")}全員のここまでの保存行動の積で加重した到達レンジへの推定勝率${pct(facts.equity_pct)}%、レーキ後の必要勝率${pct(spot.call_break_even_equity_pct)}%を使います。${remaining}${dead}`;
  const mix = `最終配分は${ACTIONS.filter(action => row[action] > 0).map(action => `${NAMES[action]} ${row[action]}%`).join("・")}。`;
  return `${context}${assumption}${callReason(row, facts, spot)}${raiseReason(row)}${mix}`;
}

const FACT_LABELS = [
  { key: "equity_pct", label: "推定勝率（全ライブ相手の現在到達レンジ）", scope: "hand" },
  { key: "realized_equity_pct", label: "実現後の勝率（仮定EQR）", scope: "hand" },
  { key: "call_ev_bb", label: "コールEV（将来の追加投資なし）", scope: "hand", unit: "bb" },
  { key: "reach_pct", label: "この履歴でのHero到達率", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "レーキ後のコール必要勝率", scope: "spot" },
  { key: "cost_to_call_bb", label: "今回追加するコール額", scope: "spot", unit: "bb" },
  { key: "total_pot_after_call_bb", label: "Heroコール後の実際のポット", scope: "spot", unit: "bb" },
  { key: "dead_money_bb", label: "フォールド済みのデッドマネー", scope: "spot", unit: "bb" },
  ...ACTIONS.map(action => ({ key: `weighted_${action}_pct`, label: `自分の到達コンボ加重の${NAMES[action]}頻度`, scope: "spot" })),
];

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
    const byHand = new Map(saved.hands.map(item => [item.hand, item]));
    const result = {};
    for (const row of spot.hands) {
      const item = byHand.get(row.hand), { hand, unreachable_reason, ...facts } = item;
      result[hand] = { reason: compose(row, item, saved.spot), facts };
    }
    writeFileSync(fileAt(reasonDir, spot.id), JSON.stringify({ spot_id: spot.id, type: "continuation", source_fingerprint: fingerprint,
      method: "保存された最終169ハンド頻度と固定シードの推定勝率から理由を構成。履歴ごとの全ライブ相手の保存行動頻度の積、Heroの到達コンボ加重、実際の投入額、共通EQR・レーキを使用した独立AI推定で、GTOや最適性の保証ではありません。",
      equity_note: "勝率は全ライブ相手の現在の到達レンジがショウダウンへ進むと置いた近似です。未応答者の最終コールレンジや未来の投入額は仮定せず、相手の応答・追加投資による変化は厳密に扱いません。途中フォールド者の保存レンジもカード重複と残りのボードに反映しますが、そのハンドは勝負に参加しません。コールEV=勝率×仮定EQR×レーキ後の実際のHeroコール後ポット−追加コール額。複数人EQRは共通係数、オールインEQRは1。フォールド済みのチップは残します。レイズEV・相手の将来フォールド率は未計算です。参加者以外のフォールドはこの限定履歴の前提で、カードは不明として扱います。",
      fact_labels: FACT_LABELS, spot_facts: saved.spot, hands: result }) + "\n");
  }
  return spots.length;
}
