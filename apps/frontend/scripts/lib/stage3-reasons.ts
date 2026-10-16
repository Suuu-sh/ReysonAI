// Authoring-only facts and Japanese reasons for the bounded stage3 tree.
// No equities or frequencies are invented here: both inputs must be saved first.
import { encodeStage3Reasons } from "../../src/estimated/stage3-reason-format.ts";
import { createHash } from "node:crypto";
import { policySourceBytes } from "./typescript-policy-source.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hands } from "../../src/data.ts";
import { stage3ById, stage3Sizing } from "../../src/estimated/stage3-tree.ts";
import {
  STAGE3_SEED, STAGE3_VERSION, stage3BreakEven, stage3Facts,
  stage3Mix, createStage3Model, validStage3Equity,
} from "../../src/estimated/stage3-model.ts";
import { stage3AllInTarget, stage3Capacity } from "../../src/estimated/stage3-audit.ts";
import { allowedCall } from "../../src/estimated/stage3-call-ev.ts";
import { EQR, MULTIWAY_EQR } from "../../src/estimated/eqr.ts";
import { rakeConfig, raked } from "../../src/estimated/rake.ts";
import { effectiveStackBb, isInPosition, sizing } from "../../src/estimated/sizing.ts";

const ACTIONS = ["fold", "call", "squeeze", "four_bet", "all_in"];
const NAMES: any = { open: "オープン", call: "コール", fold: "フォールド", three_bet: "3bet", squeeze: "スクイーズ", four_bet: "4bet", all_in: "オールイン" };
const FAMILIES: any = { squeeze_extra: "スクイーズ後の追加参加", two_caller_squeeze_extra: "2人コール後のスクイーズと追加参加", three_bet_cold_call_extra: "3betコールドコール後の追加参加", cold_four_bet_extra: "コールド4bet後の追加参加", three_callers: "3人コール", four_callers: "4人コール" };
export const STAGE3_REASON_POLICY_FILES = ["src/estimated/stage3-reason-format.ts", "src/estimated/sizing.ts", "src/estimated/eqr.ts", "src/estimated/rake.ts", "src/estimated/call-ev.ts",
  "src/estimated/stage3-tree.ts", "src/estimated/stage3-catalog.ts", "src/estimated/stage3-call-ev.ts", "src/estimated/stage3-coverage.ts", "src/estimated/stage3-model.ts", "src/estimated/stage3-audit.ts", "src/estimated/continuation-defense.ts", "src/estimated/stage3-responses.ts", "src/estimated/audit-policy.ts",
  "scripts/generate-stage3-responses.mjs", "scripts/lib/stage3-profiles.mjs", "scripts/lib/stage3-checkpoint.mjs", "scripts/lib/continuation-equity.mjs", "scripts/lib/continuation-evaluator.mjs", "scripts/lib/all-in-call.mjs", "scripts/lib/equity.mjs", "scripts/lib/stage3-reasons.mjs", "src/data.ts", "src/estimated/continuation-tree.ts", "src/estimated/cold-three-bet-responses.ts", "src/estimated/multiway-responses.ts", "src/estimated/multiway2-responses.ts"];
const round = (value: any) : any => value === null ? null : Math.round(value * 1e6) / 1e6;
const number = (value: any) : any => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
const pct = (value: any) : any => value.toFixed(1);
const ev = (value: any) : any => `${value >= 0 ? "+" : ""}${value.toFixed(2)}BB`;
const stable = (value: any) : any => JSON.stringify(value, (_key?: any, item?: any) : any => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key: any) : any => [key, item[key]])) : item);
const fileAt = (directory?: any, id?: any) : any => directory instanceof URL ? new URL(`${id}.json`, directory) : resolve(directory, `${id}.json`);

// Hash documents one spot at a time, avoiding a second giant JSON allocation.
// Canonical keys make the fingerprint independent of object insertion order;
// array order, every saved row, equity, source and policy remain authoritative.
function hashDocument(hash?: any, name?: any, document?: any) : any {
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

export function stage3ReasonFingerprint({ data, datasets, equities }: any) : any {
  const hash = createHash("sha256");
  hash.update(readFileSync(new URL("../../../../configs/multiway-preflop-stage3.json", import.meta.url)));
  hash.update(stable({ version: 1, STAGE3_VERSION, STAGE3_SEED, EQR, MULTIWAY_EQR, rakeConfig,
    sizing, effectiveStackBb, stage3Sizing }));
  for (const name of STAGE3_REASON_POLICY_FILES) {
    hash.update(name);
    hash.update(policySourceBytes(name));
  }
  hashDocument(hash, "stage3-responses", data);
  hashDocument(hash, "stage3-call-equities", equities);
  for (const name of Object.keys(datasets).filter((name: any) : any => !["stage3-responses", "stage3-call-equities"].includes(name)).sort()) {
    hashDocument(hash, name, datasets[name]);
  }
  return hash.digest("hex");
}

function prepare({ data, datasets, equities, wanted }: any) : any {
  if (!Array.isArray(data?.spots) || !datasets || !equities?.spots) throw new Error("Missing stage3 data, source datasets or equities");
  const selected = new Set(wanted ?? ([] as any[]));
  return { fingerprint: stage3ReasonFingerprint({ data, datasets, equities }),
    model: createStage3Model({ ...datasets, "stage3-responses": data }),
    spots: data.spots.filter((spot: any) : any => !selected.size || selected.has(spot.id)) };
}

function checkedContext(model?: any, spot?: any, entry?: any) : any {
  const node = stage3ById.get(spot.id);
  if (!node || node.reused) throw new Error(`Unknown new stage3: ${spot.id}`);
  if (Object.entries<any>(node).some(([key, value]: any) : any => JSON.stringify(value) !== JSON.stringify(spot[key]))) throw new Error(`Invalid stage3 history: ${spot.id}`);
  const context = model.context(node, spot);
  if (spot.unreachable !== context.unreachable || spot.hands?.length !== hands.length) throw new Error(`Invalid stage3 reach/hands: ${spot.id}`);
  for (let i = 0; i < hands.length; i++) {
    const row = spot.hands[i];
    if (row.hand !== hands[i] || ACTIONS.some((action: any) : any => !Number.isInteger(row[action]) || row[action] < 0 || row[action] > 100 ||
        !node.legal_actions.includes(action) && row[action] !== 0) || ACTIONS.reduce((sum?: any, action?: any) : any => sum + row[action], 0) !== 100 ||
        row.raise_to_size_bb !== (row.squeeze ? node.action_sizes_bb.squeeze : row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null) ||
        context.reach(row.hand) <= 0 && row.fold !== 100) throw new Error(`Invalid stage3 row: ${spot.id}/${row.hand}`);
  }
  if (!validStage3Equity(entry, context)) throw new Error(`Stale stage3 equity: ${spot.id}`);
  if (node.bet_level === 5) {
    const { maxCalls } = stage3Capacity(spot, context, entry);
    if (spot.hands.some((row: any) : any => row.call !== maxCalls.get(row.hand))) throw new Error(`Invalid stage3 all-in mix: ${spot.id}`);
  } else for (const row of spot.hands) {
    if (context.reach(row.hand) > 0 && row.call > allowedCall(row.call, (stage3Facts(context, row.hand, entry) as any).call_ev_bb)) {
      throw new Error(`Invalid stage3 call gate: ${spot.id}/${row.hand}`);
    }
  }
  return context;
}

function role(node?: any) : any {
  if (node.hero === node.entrant && !node.parent_id) return "未行動だった追加参加者";
  if (node.hero === node.opener) return "元のオープナー";
  if (node.hero === node.squeezer) return "元のスクイーザー";
  if (node.hero === node.three_bettor) return "元の3bettor";
  if (node.hero === node.four_bettor) return "元のコールド4bettor";
  if (node.hero === node.cold_caller) return "3betのコールドコーラー";
  const index = node.callers.indexOf(node.hero);
  return index >= 0 ? `${index + 1}人目の元のコーラー` : "参加者";
}

function sourceAction(node?: any, factor?: any) : any {
  const item = node.history.find((item: any) : any => item.source?.dataset === factor.dataset && item.source.spot_id === factor.spot_id && item.source.action === factor.action);
  return `${NAMES[factor.action] ?? factor.action}${item?.to_size_bb === null || item?.to_size_bb === undefined ? "" : `（総額${number(item.to_size_bb)}BB）`}`;
}

function unreachableReason(context?: any, model?: any, hand?: any) : any {
  const { node } = context;
  const zeroActions = node.source_factors[node.hero].filter((factor: any) : any => model.sources.get(`${factor.dataset}/${factor.spot_id}`).hands.find((row: any) : any => row.hand === hand)[factor.action] === 0);
  let cause: any;
  if (zeroActions.length) cause = `${node.hero}の保存済み${zeroActions.map((factor: any) : any => sourceAction(node, factor)).join("・")}頻度がこのハンドで0%`;
  else if (!context.historyPossible) {
    const empty = node.participants.filter((seat: any) : any => ![...context.weights[seat].values()].some((weight: any) : any => weight > 0));
    cause = `${empty.map((seat: any) : any => `${seat}の保存済み${node.source_factors[seat].map((factor: any) : any => sourceAction(node, factor)).join("→")}の積`).join("、")}が全ハンドで0%となり、元の履歴自体が空`;
  } else cause = "Heroのカードと全参加者（途中フォールド者を含む）の保存到達レンジを同時に配れる、カード重複のないホールカードの組合せがない";
  return `${cause}のため、この経路は対象外です。形式上フォールド100%であり、実際の推奨ではありません。`;
}

function spotFacts(context?: any) : any {
  const { node, input, spot } = context;
  const mix: any = stage3Mix(spot, context);
  return {
    hero: node.hero, family: node.family, family_label: FAMILIES[node.family], role: role(node), opener: node.opener,
    callers: node.callers, squeezer: node.squeezer ?? null, three_bettor: node.three_bettor ?? null,
    cold_caller: node.cold_caller ?? null, four_bettor: node.four_bettor ?? null,
    live_participants: node.live_participants, opponents: input.opponents, pending_actors: input.pending_actors,
    dead_opponents: input.dead_opponents ?? ([] as any[]),
    folded: node.folded, forced_fold_seats: node.history.filter((item: any) : any => item.forced && item.action === "fold").map((item: any) : any => item.seat),
    position: input.opponents.every((seat: any) : any => isInPosition(node.hero, seat)) ? "IP" : "OOP",
    bet_level: node.bet_level, facing_size_bb: node.facing_size_bb, hero_invested_bb: node.contributions_bb[node.hero],
    cost_to_call_bb: input.cost_to_call, pot_before_call_bb: node.pot_bb, total_pot_after_call_bb: input.total_pot_after_call,
    raked_pot_after_call_bb: raked(input.total_pot_after_call), dead_money_bb: node.dead_money_bb,
    call_break_even_equity_pct: round(stage3BreakEven(context)), three_bet_size_bb: node.three_bet_size_bb,
    four_bet_size_bb: node.four_bet_size_bb, all_in_size_bb: effectiveStackBb,
    reachable_combos: round(mix.reachable_combos),
    aggregation_model: "Hero自身の前段行動頻度×コンボ数で加重。他者カードとの整合が不可能なハンドは除外しますが、正の整合確率による再加重はしていません。共同カード条件付きの全員フォールド監査とは別の集計です。",
    ...Object.fromEntries(ACTIONS.map((action: any) : any => [`weighted_${action}_pct`, round(mix[action])])),
    history_possible: context.historyPossible, unreachable: context.unreachable,
    opponent_model: input.opponent_model,
  };
}

function factsFile(context?: any, entry?: any, model?: any, fingerprint?: any) : any {
  const spot = spotFacts(context);
  return { spot_id: context.spot.id, type: "stage3", source_fingerprint: fingerprint, spot,
    hands: context.spot.hands.map((row: any) : any => {
      const computed: any = stage3Facts(context, row.hand, entry);
      const reachable = computed.reach_pct > 0;
      // Keep raw computed values for threshold decisions; round only presentation.
      return { hand: row.hand, ...computed,
        equity_margin_pct: reachable ? computed.equity_pct - stage3BreakEven(context) : null,
        all_in_target_call_pct: reachable && context.input.all_in ? stage3AllInTarget(computed.equity_pct - stage3BreakEven(context)) : null,
        ...Object.fromEntries(ACTIONS.map((action: any) : any => [`${action}_pct`, row[action]])), raise_to_size_bb: row.raise_to_size_bb,
        unreachable_reason: reachable ? null : unreachableReason(context, model, row.hand) };
    }) };
}

export function generateStage3Facts({ data, datasets, equities, outDir, wanted }: any) : any {
  if (!outDir) throw new Error("Stage3 fact output directory is required");
  const { fingerprint, model, spots } = prepare({ data, datasets, equities, wanted });
  mkdirSync(outDir, { recursive: true });
  for (const spot of spots) {
    const entry = equities.spots[spot.id], context = checkedContext(model, spot, entry);
    writeFileSync(fileAt(outDir, spot.id), JSON.stringify(factsFile(context, entry, model, fingerprint)) + "\n");
  }
  return spots.length;
}

export function composeStage3Reasons({ data, datasets, equities, factDir, reasonDir, wanted }: any) : any {
  if (!factDir || !reasonDir) throw new Error("Stage3 fact and reason directories are required");
  const { fingerprint, model, spots } = prepare({ data, datasets, equities, wanted });
  mkdirSync(reasonDir, { recursive: true });
  for (const spot of spots) {
    const entry = equities.spots[spot.id], context = checkedContext(model, spot, entry), filename = fileAt(factDir, spot.id);
    if (!existsSync(filename)) throw new Error(`Missing stage3 facts: ${spot.id}`);
    const saved = JSON.parse(readFileSync(filename, "utf8"));
    if (saved.source_fingerprint !== fingerprint || saved.spot_id !== spot.id || saved.type !== "stage3") throw new Error(`Stale stage3 facts: ${spot.id}; regenerate facts`);
    const expected = factsFile(context, entry, model, fingerprint);
    if (stable(saved) !== stable(expected)) throw new Error(`Mismatched stage3 facts: ${spot.id}; regenerate facts`);
    writeFileSync(fileAt(reasonDir, spot.id), JSON.stringify(encodeStage3Reasons(saved)) + "\n");
  }
  return spots.length;
}

// Read-only delivery verification: recompute expected compact facts/templates
// solely from the already saved rows and equities. No sampling, mutation,
// strategy authoring or file output occurs. One model/fingerprint serves all
// histories; callers must compare the complete payload, not just its header.
export function* stage3ExpectedCompactReasons({ data, datasets, equities, wanted }: any) : any {
  const { fingerprint, model, spots } = prepare({ data, datasets, equities, wanted });
  for (const spot of spots) {
    const entry = equities.spots[spot.id];
    const context = checkedContext(model, spot, entry);
    yield [spot.id, encodeStage3Reasons(factsFile(context, entry, model, fingerprint))];
  }
}
