import type { MatrixModel } from "../data.ts";
import type { LimpDataset, LimpDeepDataset, LimpDeepSpot, LimpFourBetSpot, LimpIsoSpot, OpeningDataset, SpotDataset } from "./preflop-types.ts";
// Deep SB-limp branch: SB limps → BB isos 3.5BB → SB limp-reraises 10.5BB →
// BB 4bets 26BB → SB fold / call / all-in 100BB → BB fold / call the all-in.
// Kept apart from limp-responses.json (and its validator) on purpose.
import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { effectiveStackBb, fiveBetToSize, fourBetToSize, isoVsLimpToBb, limpReraiseToBb, openSizeBb, sbCompleteToBb } from "./sizing.ts";

export const LIMP_FOUR_BET_RESPONSE_ID = "SB_vs_BB_limp_four_bet";
export const LIMP_FIVE_BET_RESPONSE_ID = "BB_vs_SB_limp_five_bet";
export const LIMP_DEEP_LEGAL_ACTIONS = Object.freeze({
  [LIMP_FOUR_BET_RESPONSE_ID]: ["fold", "call", "all_in"],
  [LIMP_FIVE_BET_RESPONSE_ID]: ["fold", "call"],
});

const percent = (value: number) => Number.isInteger(value) && value >= 0 && value <= 100;
const hasExactKeys = (row: object, keys: readonly string[]) => Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key));
const bySpot = <S extends { id: string }>(data: SpotDataset<S> | null | undefined, id: string) => data?.spots?.find(spot => spot.id === id);

// `limp` is the saved limp-responses.json: reachability comes from SB's limp ×
// limp-reraise (4bet response) and BB's iso × 4bet (all-in response).
export function validateLimpDeepResponses(data: LimpDeepDataset, opening: OpeningDataset, limp: LimpDataset) {
  const fail: (detail: string) => never = detail => { throw new Error(`リンプ深部応答データが不正です: ${detail}`); };
  const fourBetTo = fourBetToSize("BB", "SB");
  const allInTo = fiveBetToSize();
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 || !hasConfiguredRake(data.metadata) ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(LIMP_DEEP_LEGAL_ACTIONS) ||
      data.spot_count !== 2 || data.hand_classes_per_spot !== hands.length || data.entry_count !== 2 * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== 2) fail("メタデータ・局面数");

  const sbOpen = opening?.spots?.find(spot => spot.id === "SB_open" && spot.hero === "SB");
  const bbIso = (bySpot(limp, "BB_vs_SB_limp") as import("./preflop-types.ts").LimpCheckSpot | undefined);
  const sbIso = (bySpot(limp, "SB_vs_BB_iso") as LimpIsoSpot | undefined);
  const bbReraise = (bySpot(limp, "BB_vs_SB_limp_reraise") as import("./preflop-types.ts").LimpReraiseSpot | undefined);
  if (!sbOpen || !bbIso || !sbIso || !bbReraise || bbReraise.four_bet_size_bb !== fourBetTo) fail("前段（SBオープン・リンプ応答）の参照");

  const [sb, bb] = data.spots;
  const common = (spot: LimpDeepSpot) => spot.source_opening_id === "SB_open" && spot.source_limp_response_id === bbIso.id &&
    spot.source_iso_response_id === sbIso.id && spot.source_limp_reraise_response_id === bbReraise.id &&
    spot.open_size_bb === sbCompleteToBb && spot.iso_size_bb === isoVsLimpToBb &&
    spot.limp_reraise_size_bb === limpReraiseToBb && spot.four_bet_size_bb === fourBetTo &&
    spot.all_in_size_bb === allInTo && spot.effective_stack_bb === effectiveStackBb;
  if (sb?.id !== LIMP_FOUR_BET_RESPONSE_ID || sb.hero !== "SB" || sb.opponent !== "BB" || !common(sb) ||
      bb?.id !== LIMP_FIVE_BET_RESPONSE_ID || bb.hero !== "BB" || bb.opponent !== "SB" || !common(bb) ||
      bb.source_four_bet_response_id !== sb.id) fail("局面・参照ID・サイズ");
  for (const spot of [sb, bb]) {
    if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length ||
        spot.hands.some((row, index) => row?.hand !== hands[index])) fail(`ハンド順: ${spot.id}`);
  }

  const limpBy = new Map(sbOpen.hands.map(row => [row.hand, row.limp]));
  const sbReraiseBy = new Map(sbIso.hands.map(row => [row.hand, row.raise]));
  const isoBy = new Map(bbIso.hands.map(row => [row.hand, row.raise]));
  const bbFourBetBy = new Map(bbReraise.hands.map(row => [row.hand, row.four_bet]));
  for (const row of sb.hands) {
    const unreachable = !(limpBy.get(row.hand)! > 0 && sbReraiseBy.get(row.hand)! > 0);
    if (!hasExactKeys(row, ["hand", "fold", "call", "all_in", "all_in_size_bb"]) ||
        ![row.fold, row.call, row.all_in].every(percent) || row.fold + row.call + row.all_in !== 100 ||
        row.all_in_size_bb !== (row.all_in > 0 ? allInTo : null) ||
        (unreachable && row.fold !== 100)) fail(`${sb.id} / ${row.hand}`);
  }
  const shoveBy = new Map(sb.hands.map(row => [row.hand, row.all_in]));
  if (![...shoveBy].some(([hand, allIn]) => allIn > 0 && limpBy.get(hand)! > 0 && sbReraiseBy.get(hand)! > 0)) fail(`${sb.id}: オールインレンジが空`);
  for (const row of bb.hands) {
    const unreachable = !(isoBy.get(row.hand)! > 0 && bbFourBetBy.get(row.hand)! > 0);
    const equity = row.equity_vs_shove_pct;
    if (!hasExactKeys(row, ["hand", "fold", "call", "equity_vs_shove_pct"]) ||
        ![row.fold, row.call].every(percent) || row.fold + row.call !== 100 ||
        (unreachable ? row.fold !== 100 || equity !== null
          : !(Number.isFinite(equity) && equity! >= 0 && equity! <= 100))) fail(`${bb.id} / ${row.hand}`);
  }
  if (!(bb.call_break_even_equity_pct > 0 && bb.call_break_even_equity_pct < 100) || !(bb.shove_range_combos > 0)) fail(`${bb.id}: 必要勝率・オールインレンジ`);
  return data;
}

// SB facing BB's 4bet: hands that never limp-reraise (SB_vs_BB_iso raise 0%) are unreachable.
export function limpFourBetMatrixModel(spot: LimpFourBetSpot, limp: LimpDataset): MatrixModel {
  const iso = (limp?.spots?.find(item => item.id === spot.source_iso_response_id) as LimpIsoSpot | undefined);
  if (!iso) throw new Error("BBの4betへの応答にはSBのリンプレイズ頻度が必要です。");
  const reraise = new Map(iso.hands.map(row => [row.hand, row.raise]));
  return {
    actions: ["all_in", "call", "fold"],
    actionLabels: { all_in: `オールイン ${spot.all_in_size_bb}BB` },
    aggregates: new Map(spot.hands.map(row => {
      const unreachable = !(reraise.get(row.hand)! > 0);
      return [row.hand, {
        hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
        unreachable,
        actions: unreachable ? {} : { all_in: row.all_in / 100, call: row.call / 100, fold: row.fold / 100 },
      }];
    })),
  };
}

export function findLimpDeepResponseSpot<I extends LimpDeepSpot["id"]>(data: LimpDeepDataset, id: I): Extract<LimpDeepSpot, { id: I }> {
  const spot = bySpot(data, id);
  if (!spot) throw new Error(`リンプ深部応答局面がありません: ${id}`);
  return spot as Extract<LimpDeepSpot, { id: I }>;
}
