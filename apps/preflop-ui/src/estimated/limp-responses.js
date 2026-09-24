import { hands } from "../data.js";
import { effectiveStackBb, isoVsLimpToBb, limpReraiseToBb, openSizeBb, sbCompleteToBb } from "./sizing.js";
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
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify({ BB_vs_SB_limp: ["check", "raise"], SB_vs_BB_iso: ["fold", "call", "raise"] }) ||
      data.spot_count !== 2 || data.hand_classes_per_spot !== hands.length || data.entry_count !== 2 * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== 2) fail("メタデータ・局面数");

  const sbOpen = opening.spots.find(spot => spot.id === "SB_open" && spot.hero === "SB");
  if (!sbOpen || sbOpen.hands.length !== hands.length) fail("SBオープン参照");
  const limpByHand = new Map(sbOpen.hands.map(row => [row.hand, row.limp]));
  const bb = requireSpot(data, "BB_vs_SB_limp");
  const sb = requireSpot(data, "SB_vs_BB_iso");
  if (data.spots[0] !== bb || data.spots[1] !== sb ||
      bb.hero !== "BB" || bb.opponent !== "SB" || bb.source_opening_id !== "SB_open" ||
      bb.open_size_bb !== sbCompleteToBb || bb.raise_size_bb !== isoVsLimpToBb ||
      bb.effective_stack_bb !== effectiveStackBb ||
      sb.hero !== "SB" || sb.opponent !== "BB" || sb.source_opening_id !== "SB_open" ||
      sb.source_limp_response_id !== bb.id || sb.open_size_bb !== sbCompleteToBb ||
      sb.iso_size_bb !== isoVsLimpToBb || sb.raise_to_bb !== limpReraiseToBb ||
      sb.effective_stack_bb !== effectiveStackBb) fail("局面・サイズ");

  for (const spot of [bb, sb]) {
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
  return data;
}

export function findLimpResponseSpot(data, id) {
  return requireSpot(data, id);
}

export function limpResponsesMatrixModel(spot, opening) {
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
  throw new Error(`未対応のリンプ応答局面です: ${spot.id}`);
}
