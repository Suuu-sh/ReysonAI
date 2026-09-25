import { hands } from "../data.js";
import { effectiveStackBb, fourBetToSize, isoVsLimpToBb, limpReraiseToBb, openSizeBb, sbCompleteToBb } from "./sizing.js";

export const LIMP_RERAISE_RESPONSE_ID = "BB_vs_SB_limp_reraise";
const limpReraiseFourBetToBb = () => fourBetToSize("BB", "SB");
import { hasConfiguredRake } from "./rake.js";

function requireSpot(data, id) {
  const spot = data.spots.find(item => item.id === id);
  if (!spot) throw new Error(`リンプ応答局面がありません: ${id}`);
  return spot;
}

export function validateLimpResponses(data, opening) {
  const fail = detail => { throw new Error(`リンプ応答データが不正です: ${detail}`); };
  const expectedRake = hasConfiguredRake(data?.metadata);
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 || !expectedRake ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify({ BB_vs_SB_limp: ["check", "raise"], SB_vs_BB_iso: ["fold", "call", "raise"], [LIMP_RERAISE_RESPONSE_ID]: ["fold", "call", "four_bet"] }) ||
      data.spot_count !== 3 || data.hand_classes_per_spot !== hands.length || data.entry_count !== 3 * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== 3) fail("メタデータ・局面数");

  const sbOpen = opening.spots.find(spot => spot.id === "SB_open" && spot.hero === "SB");
  if (!sbOpen || sbOpen.hands.length !== hands.length) fail("SBオープン参照");
  const limpByHand = new Map(sbOpen.hands.map(row => [row.hand, row.limp]));
  const bb = requireSpot(data, "BB_vs_SB_limp");
  const sb = requireSpot(data, "SB_vs_BB_iso");
  const reraise = requireSpot(data, LIMP_RERAISE_RESPONSE_ID);
  const fourBetTo = limpReraiseFourBetToBb();
  if (data.spots[0] !== bb || data.spots[1] !== sb || data.spots[2] !== reraise ||
      reraise.hero !== "BB" || reraise.opponent !== "SB" || reraise.source_opening_id !== "SB_open" ||
      reraise.source_limp_response_id !== bb.id || reraise.source_iso_response_id !== sb.id ||
      reraise.open_size_bb !== sbCompleteToBb || reraise.iso_size_bb !== isoVsLimpToBb ||
      reraise.limp_reraise_size_bb !== limpReraiseToBb || reraise.four_bet_size_bb !== fourBetTo ||
      reraise.effective_stack_bb !== effectiveStackBb ||
      bb.hero !== "BB" || bb.opponent !== "SB" || bb.source_opening_id !== "SB_open" ||
      bb.open_size_bb !== sbCompleteToBb || bb.raise_size_bb !== isoVsLimpToBb ||
      bb.effective_stack_bb !== effectiveStackBb ||
      sb.hero !== "SB" || sb.opponent !== "BB" || sb.source_opening_id !== "SB_open" ||
      sb.source_limp_response_id !== bb.id || sb.open_size_bb !== sbCompleteToBb ||
      sb.iso_size_bb !== isoVsLimpToBb || sb.raise_to_bb !== limpReraiseToBb ||
      sb.effective_stack_bb !== effectiveStackBb) fail("局面・サイズ");

  for (const spot of [bb, sb, reraise]) {
    if (!Array.isArray(spot.hands) || spot.hands.length !== hands.length ||
        spot.hands.some((row, index) => row?.hand !== hands[index])) fail(`ハンド順: ${spot.id}`);
  }
  for (const row of bb.hands) {
    if (Object.keys(row).length !== 4 ||
        !["hand", "check", "raise", "raise_size_bb"].every(key => Object.hasOwn(row, key)) ||
        ![row.check, row.raise].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
        row.check + row.raise !== 100 ||
        row.raise_size_bb !== (row.raise > 0 ? isoVsLimpToBb : null)) fail(`${bb.id} / ${row.hand}`);
  }
  for (const row of sb.hands) {
    const limp = limpByHand.get(row.hand);
    const unreachable = limp === 0;
    if (Object.keys(row).length !== 5 ||
        !["hand", "fold", "call", "raise", "raise_size_bb"].every(key => Object.hasOwn(row, key)) ||
        ![row.fold, row.call, row.raise].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
        row.fold + row.call + row.raise !== 100 ||
        row.raise_size_bb !== (row.raise > 0 ? limpReraiseToBb : null) ||
        (unreachable && (row.fold !== 100 || row.call !== 0 || row.raise !== 0))) fail(`${sb.id} / ${row.hand}`);
  }
  const isoByHand = new Map(bb.hands.map(row => [row.hand, row.raise]));
  for (const row of reraise.hands) {
    const unreachable = isoByHand.get(row.hand) === 0;
    if (Object.keys(row).length !== 5 ||
        !["hand", "fold", "call", "four_bet", "four_bet_size_bb"].every(key => Object.hasOwn(row, key)) ||
        ![row.fold, row.call, row.four_bet].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
        row.fold + row.call + row.four_bet !== 100 ||
        row.four_bet_size_bb !== (row.four_bet > 0 ? fourBetTo : null) ||
        (unreachable && (row.fold !== 100 || row.call !== 0 || row.four_bet !== 0))) fail(`${reraise.id} / ${row.hand}`);
  }
  return data;
}

export function findLimpResponseSpot(data, id) {
  return requireSpot(data, id);
}

// `limpData` (the whole dataset) is needed only for the limp-reraise response,
// whose reachability comes from BB's saved iso-raise frequency.
export function limpResponsesMatrixModel(spot, opening, limpData = null) {
  const sbOpen = opening.spots.find(item => item.id === "SB_open");
  if (spot.id === "BB_vs_SB_limp") {
    return {
      actions: [`raise_${isoVsLimpToBb}`, "check"],
      actionLabels: { [`raise_${isoVsLimpToBb}`]: `アイソレイズ ${isoVsLimpToBb}BB` },
      aggregates: new Map(spot.hands.map(row => [row.hand, {
        hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
        actions: { [`raise_${isoVsLimpToBb}`]: row.raise / 100, check: row.check / 100 },
      }])),
    };
  }
  if (spot.id === "SB_vs_BB_iso") {
    const limp = new Map(sbOpen.hands.map(row => [row.hand, row.limp]));
    return {
      actions: [`raise_${limpReraiseToBb}`, "call", "fold"],
      actionLabels: { [`raise_${limpReraiseToBb}`]: `リンプレイズ ${limpReraiseToBb}BB` },
      aggregates: new Map(spot.hands.map(row => {
        const unreachable = limp.get(row.hand) === 0;
        return [row.hand, {
          hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
          unreachable,
          actions: unreachable ? {} : {
            [`raise_${limpReraiseToBb}`]: row.raise / 100,
            call: row.call / 100,
            fold: row.fold / 100,
          },
        }];
      })),
    };
  }
  if (spot.id === LIMP_RERAISE_RESPONSE_ID) {
    const iso = limpData ? requireSpot(limpData, spot.source_limp_response_id) : null;
    if (!iso) throw new Error("リンプ・リレイズ応答にはBBのアイソ頻度が必要です。");
    const isoRaise = new Map(iso.hands.map(row => [row.hand, row.raise]));
    const fourBet = `four_bet_${spot.four_bet_size_bb}`;
    return {
      actions: [fourBet, "call", "fold"],
      actionLabels: { [fourBet]: `4bet ${spot.four_bet_size_bb}BB` },
      aggregates: new Map(spot.hands.map(row => {
        const unreachable = isoRaise.get(row.hand) === 0;
        return [row.hand, {
          hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
          unreachable,
          actions: unreachable ? {} : { [fourBet]: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 },
        }];
      })),
    };
  }
  throw new Error(`未対応のリンプ応答局面です: ${spot.id}`);
}
