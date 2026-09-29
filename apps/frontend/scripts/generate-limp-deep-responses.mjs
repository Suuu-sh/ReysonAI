// Deep SB-limp branch, staging-only (npm run build:estimates). Not a solver.
//   SB_vs_BB_limp_four_bet: SB (limped, then limp-reraised to 10.5BB) facing BB's 26BB 4bet:
//     authored fold / call / all-in (100BB) profile; calls then pass the shared EV gate.
//   BB_vs_SB_limp_five_bet: BB facing that all-in: computed call / fold from equity versus
//     the saved shove range (SB limp × limp-reraise × all-in) against the raked pot odds,
//     with the same ±2pt mix band and seeded Monte Carlo as five-bet-responses.json.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { comboCount, equityVsRange, seedFor, seededRandom, weightedRange } from "./lib/equity.mjs";
import { ALL_IN_CALL_SAMPLES, MIX_BAND_PCT, allInCallFrequency } from "./lib/all-in-call.mjs";
import { rakeMetadata, raked } from "../src/estimated/rake.ts";
import { effectiveStackBb, fiveBetToSize, fourBetToSize, isoVsLimpToBb, limpReraiseToBb, openSizeBb, sbCompleteToBb } from "../src/estimated/sizing.ts";
import { limpFiveBetFoldThreshold, limpFourBetFoldThreshold } from "../src/estimated/call-ev.ts";
import { LIMP_DEEP_LEGAL_ACTIONS, LIMP_FIVE_BET_RESPONSE_ID, LIMP_FOUR_BET_RESPONSE_ID, validateLimpDeepResponses } from "../src/estimated/limp-deep-responses.ts";
import { hands as HANDS } from "../src/data.ts";

const staging = process.env.ESTIMATES_DIR;
if (!staging) {
  console.error("Run `npm run build:estimates`; generators never write src/estimated directly.");
  process.exit(1);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
const round1 = value => Math.round(value * 10) / 10;

// SB facing BB's 26BB 4bet: "call all_in: hands", unlisted hands fold.
// Conditional on SB having limped and limp-reraised; hands that never reach
// this node (limp 0% or reraise 0%) are fold=100 placeholders.
//
// 2026-09-29 calibration (12,000-sample call equities, OOP EQR, 15.5BB into
// 52BB → realized break-even 31.6%). SB's limp-reraise range is ~9 combos
// (AA/KK/AKo 0.9 each, AKs/AQo 0.6, 55/A5s/A4s 0.5–0.75, QQ 0.45, AJo 0.42,
// JJ-66 and small suited broadways). BB's 4bet range is ~8.3 combos and 92%
// value (AA/KK/QQ/AK plus A5s/A4s blockers). Shove EVs below are relative to
// folding, versus BB's computed all-in response (AA calls, KK ~95%, QQ/AK and
// the wheel aces fold → BB folds ~50% of its 4bets):
// - AA/KK are +6~+21bb calls and the best shoves; both keep 30-35% calls so
//   the call range is not capped (SPR ≈ 1.4 after the call: a trap still gets
//   stacks in on most flops).
// - AK is near-indifferent between shove and call, so it mixes. The call EV
//   is AKs +3.2bb / AKo +0.4bb; the shove EV depends on BB's reply: about +5bb
//   while BB folds its own AK, about 0 once BB's AKs calls. AK in the shove
//   range is what makes BB's KK (and AKs) call: with only AA/KK shoving, BB
//   would fold everything but AA (75% > the 71.0% all-in break-even) and any
//   two cards could shove at a profit. AKs, the better call, calls half;
//   AKo shoves 55% and folds 10%.
// - A5s/A4s: small blocker shoves (between about +1bb and −8bb depending on
//   whether BB's AK calls; 0bb for folding), the rest fold, as do A3s/A2s.
// - QQ (+0.8bb) mostly calls with a small shove; JJ (+0.1bb) and TT (+0.4bb)
//   are thin OOP calls kept at or below half. 99-55 (−0.2 to −0.5bb) and every
//   other Ax/Kx/Qx/Jx are −EV calls and far below the shove's needed equity.
// SB continues ~44% of its reraise range, above BB's 4bet break-even (fold ≤
// 61.6%). Heuristic authored estimate, not a solved strategy.
const SB_VS_FOUR_BET = parseProfile(`
30 70: AA
35 65: KK
50 50: AKs
35 55: AKo
75 10: QQ
50 0: JJ
40 0: TT
0 15: A5s
0 10: A4s
`);

function parseProfile(text) {
  const result = new Map(HANDS.map(hand => [hand, [0, 0]]));
  const seen = new Set();
  for (const line of text.trim().split("\n")) {
    const [numbers, names] = line.split(":");
    const [call, allIn] = numbers.trim().split(/\s+/).map(Number);
    if (![call, allIn].every(n => Number.isInteger(n) && n >= 0 && n <= 100) || call + allIn > 100) throw new Error(`bad profile line: ${line}`);
    for (const hand of names.trim().split(/\s+/)) {
      if (!result.has(hand) || seen.has(hand)) throw new Error(`bad or duplicate hand: ${hand}`);
      seen.add(hand);
      result.set(hand, [call, allIn]);
    }
  }
  return result;
}

const opening = load("opening-ranges");
const limp = load("limp-responses");
const find = (data, id) => data.spots.find(spot => spot.id === id) ?? (() => { throw new Error(`missing ${id}`); })();
const byHand = spot => new Map(spot.hands.map(row => [row.hand, row]));
const sbOpen = byHand(find(opening, "SB_open"));
const bbIsoSpot = find(limp, "BB_vs_SB_limp");
const sbIsoSpot = find(limp, "SB_vs_BB_iso");
const bbReraiseSpot = find(limp, "BB_vs_SB_limp_reraise");
const bbIso = byHand(bbIsoSpot);
const sbIso = byHand(sbIsoSpot);
const bbReraise = byHand(bbReraiseSpot);

const fourBetTo = fourBetToSize("BB", "SB");
const allInTo = fiveBetToSize();
if (bbReraiseSpot.four_bet_size_bb !== fourBetTo) throw new Error("BB 4bet size differs from the saved limp-reraise response");
const common = {
  source_opening_id: "SB_open", source_limp_response_id: bbIsoSpot.id, source_iso_response_id: sbIsoSpot.id,
  source_limp_reraise_response_id: bbReraiseSpot.id, open_size_bb: sbCompleteToBb, iso_size_bb: isoVsLimpToBb,
  limp_reraise_size_bb: limpReraiseToBb, four_bet_size_bb: fourBetTo, all_in_size_bb: allInTo, effective_stack_bb: effectiveStackBb,
};

// 1. SB facing the 4bet (authored; calls are EV-gated below by apply-call-ev).
const sbReach = hand => sbOpen.get(hand).limp / 100 * sbIso.get(hand).raise / 100;
const sbRows = HANDS.map(hand => {
  const [call, allIn] = sbReach(hand) > 0 ? SB_VS_FOUR_BET.get(hand) : [0, 0];
  return { hand, fold: 100 - call - allIn, call, all_in: allIn, all_in_size_bb: allIn ? allInTo : null };
});
const sbSpot = { id: LIMP_FOUR_BET_RESPONSE_ID, hero: "SB", opponent: "BB", ...common, hands: sbRows };

// 2. BB facing the all-in (computed). BB has 26BB in, calls 74BB for a 200BB pot.
function bbFiveBetSpot(sb) {
  const shoveRange = weightedRange(sb.hands.map(row => ({ hand: row.hand, weight: sbReach(row.hand) * row.all_in / 100 })));
  if (!shoveRange.length) throw new Error("SB's saved shove range is empty");
  const need = (allInTo - fourBetTo) / raked(2 * allInTo) * 100;
  const random = seededRandom(seedFor("SB_limp>BB_iso>SB_reraise>BB_four_bet>SB_all_in"));
  const rows = HANDS.map(hand => {
    const reachable = bbIso.get(hand).raise > 0 && bbReraise.get(hand).four_bet > 0;
    if (!reachable) return { hand, fold: 100, call: 0, equity_vs_shove_pct: null };
    const equity = equityVsRange(hand, shoveRange, ALL_IN_CALL_SAMPLES, random) * 100;
    const call = allInCallFrequency(equity - need);
    return { hand, fold: 100 - call, call, equity_vs_shove_pct: round1(equity) };
  });
  return {
    id: LIMP_FIVE_BET_RESPONSE_ID, hero: "BB", opponent: "SB", ...common, source_four_bet_response_id: sb.id,
    call_break_even_equity_pct: round1(need),
    shove_range_combos: round1(shoveRange.reduce((sum, item) => sum + item.weight, 0)),
    hands: rows,
  };
}

const rake = rakeMetadata;
const data = {
  metadata: {
    schema_version: "1.0", strategy_type: "ai_estimate_not_gto",
    game: "6max Cash / No-Limit Texas Holdem", effective_stack_bb: effectiveStackBb, open_size_bb: openSizeBb, ante_bb: 0,
    rake,
    legal_actions: LIMP_DEEP_LEGAL_ACTIONS,
    scope: `SBが${sbCompleteToBb}BBにリンプ → BBが${isoVsLimpToBb}BBにアイソ → SBが${limpReraiseToBb}BBにリンプ・リレイズ → BBが${fourBetTo}BBに4bet → SBのフォールド／コール／${allInTo}BBオールイン、およびそのオールインへのBBのコール／フォールド。limp-responses.jsonの続き。`,
    method: `SBの4bet応答は独自に設計したハンド群別の概算（AA/KKはオールイン主体でコールも残す、AKはオールインとコールの混合（AKsはコール半分、AKoは一部フォールド）、A5s/A4sは少数のブロッカー・オールイン、QQはコール主体、JJ/TTはOOPの薄いコール、それ以外はフォールド）。コールは共通のEV判定（勝率×OOPのEQR×raked(ポット)−コール額、固定シード12,000回）を通す。BBのオールイン応答は保存済みのSBオールインレンジ（リンプ×リンプ・リレイズ×オールイン頻度）に対する勝率をモンテカルロ法（${ALL_IN_CALL_SAMPLES}回・シード固定）で計算し、raked(${2 * allInTo}BB)のポットオッズの必要勝率と比較。差が±${MIX_BAND_PCT}pt以内はコール頻度を線形に混合し5%刻みに丸める。`,
    frequency_semantics: "SBはリンプ・リレイズ済み条件下でfold+call+all_in=100、BBは4bet済み条件下でfold+call=100。前段の頻度は再乗算しない。",
    sizing_semantics: `全サイズは合計投入額。SB complete=${sbCompleteToBb}BB、BB iso=${isoVsLimpToBb}BB、SB limp-reraise=${limpReraiseToBb}BB、BB 4bet=${fourBetTo}BB、SB all-in=${allInTo}BB（頻度0なら行のall_in_size_bbはnull）。`,
    unreachable_hands: "SBのリンプ×リンプ・リレイズ頻度が0%のハンド（SB_vs_BB_limp_four_bet）と、BBのアイソ×4bet頻度が0%のハンド（BB_vs_SB_limp_five_bet、equity_vs_shove_pct=null）はfold=100の形式的プレースホルダーであり、推奨ではない。",
    warning: "AI推定。5%・上限3BBのレーキとNo flop no dropを仮定した独立推定で、ソルバー・GTO・前段との同時均衡ではない。",
  },
  spot_count: 2, hand_classes_per_spot: HANDS.length, entry_count: 2 * HANDS.length,
  spots: [sbSpot, bbFiveBetSpot(sbSpot)],
};
validateLimpDeepResponses(data, opening, limp);
const file = join(staging, "limp-deep-responses.json");
writeFileSync(file, JSON.stringify(data, null, 2) + "\n");

// EV-gate SB's calls (all-ins are untouched, so BB's computed response stays valid).
execFileSync("node", [join(root, "scripts/apply-call-ev.mjs"), "limp-deep-responses"], { cwd: root, stdio: "inherit", env: process.env });
const final = validateLimpDeepResponses(JSON.parse(readFileSync(file, "utf8")), opening, limp);
const [sb, bb] = final.spots;
const bbReach = hand => bbIso.get(hand).raise / 100 * bbReraise.get(hand).four_bet / 100;
const mixOf = (spot, reach, actions) => {
  const total = spot.hands.reduce((sum, row) => sum + comboCount(row.hand) * reach(row.hand), 0);
  return Object.fromEntries(actions.map(action => [action,
    spot.hands.reduce((sum, row) => sum + comboCount(row.hand) * reach(row.hand) * row[action] / 100, 0) / total]));
};
const sbMix = mixOf(sb, sbReach, ["all_in", "call", "fold"]);
const bbMix = mixOf(bb, bbReach, ["call", "fold"]);
const fmt = mix => Object.entries(mix).map(([action, value]) => `${action} ${(value * 100).toFixed(1)}%`).join(" / ");
console.log(`Generated limp deep responses: SB vs 4bet ${fmt(sbMix)} (fold ≤ ${(limpFourBetFoldThreshold(sb) * 100).toFixed(1)}%); ` +
  `BB vs all-in ${fmt(bbMix)} (fold ≤ ${(limpFiveBetFoldThreshold(bb) * 100).toFixed(1)}%, need ${bb.call_break_even_equity_pct}% vs ${bb.shove_range_combos} combos)`);
