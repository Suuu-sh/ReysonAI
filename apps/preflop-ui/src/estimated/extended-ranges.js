import { useEffect, useState } from "react";
import { positions } from "./sizing.js";
import { multiwayMatchups, multiwayMatrixModel, validateMultiwayDataset } from "./multiway-responses.js";
import { squeezeMatrixModel, validateSqueezeDataset } from "./squeeze-responses.js";
import { coldThreeBetMatrixModel, validateColdThreeBetDataset } from "./cold-three-bet-responses.js";

// Multiway, squeeze-response and cold-3bet ranges are loaded together, only once a
// path with callers or a 3bet needs them (about 1.7MB of JSON).
const files = ["./multiway-responses.json", "./squeeze-responses.json", "./cold-three-bet-responses.json"];
const loaders = import.meta.glob(["./multiway-responses.json", "./squeeze-responses.json", "./cold-three-bet-responses.json"], { import: "default" });
let pending;

export function loadExtendedDatasets(responses, openings) {
  pending ??= Promise.all(files.map(file => loaders[file] ? loaders[file]() : Promise.reject(new Error(`${file.slice(2)} がありません。`))))
    .then(([multiwaySource, squeezeSource, coldSource]) => {
      if (!responses || !openings) throw new Error("前段のオープン・応答データを読み込めません。");
      const multiway = validateMultiwayDataset(multiwaySource);
      return {
        multiway,
        squeeze: validateSqueezeDataset(squeezeSource, multiway, responses, openings),
        cold: validateColdThreeBetDataset(coldSource, responses),
      };
    })
    .catch(error => { pending = undefined; throw error; });
  return pending;
}

export function useExtendedDatasets(enabled, responses, openings) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    if (!enabled || state.data) return undefined;
    let cancelled = false;
    loadExtendedDatasets(responses, openings)
      .then(data => { if (!cancelled) setState({ data, error: null }); })
      .catch(error => { if (!cancelled) setState({ data: null, error }); });
    return () => { cancelled = true; };
  }, [enabled]);
  return { ...state, loading: enabled && !state.data && !state.error };
}

// SB or BB facing an open plus exactly one earlier cold call (BB: SB folded),
// for the (opener, caller) pairs stored in multiway-responses.json.
export function multiwayContext(opener, callers, position) {
  if (!["SB", "BB"].includes(position)) return null;
  const earlier = callers.filter(caller => positions.indexOf(caller) < positions.indexOf(position));
  if (earlier.length !== 1) return null;
  const [caller] = earlier;
  return multiwayMatchups.some(([o, c]) => o === opener && c === caller) ? { opener, caller } : null;
}

const markUnreachable = (model, isUnreachable) => ({
  ...model,
  aggregates: new Map([...model.aggregates].map(([hand, aggregate]) => [hand, isUnreachable(hand) ? { ...aggregate, unreachable: true, actions: {} } : aggregate])),
});

// Opener rows are unreachable when its saved open is 0%; caller rows when its
// saved call of the open is 0%. fold=100 in those rows is a placeholder.
export function squeezeResponseModel(spot, responses, openings) {
  const reach = spot.prior_action === null
    ? new Map(openings.spots.find(item => item.hero === spot.opener).hands.map(row => [row.hand, row.open]))
    : new Map(responses.spots.find(item => item.opener === spot.opener && item.hero === spot.caller).hands.map(row => [row.hand, row.call]));
  return markUnreachable(squeezeMatrixModel(spot), hand => reach.get(hand) === 0);
}

export function findExtendedSpot(data, ref, opener) {
  if (ref.kind === "multiway") return data.multiway.spots.find(spot => spot.hero === ref.position && spot.opener === opener && spot.callers[0] === ref.caller) ?? null;
  if (ref.kind === "squeeze") return data.squeeze.spots.find(spot => spot.hero === ref.position && spot.opener === opener && spot.caller === ref.caller && spot.squeezer === ref.squeezer && spot.prior_action === ref.priorAction) ?? null;
  if (ref.kind === "cold") return data.cold.spots.find(spot => spot.hero === ref.position && spot.opener === opener && spot.three_bettor === ref.threeBettor) ?? null;
  return null;
}

export function extendedModel(kind, spot, responses, openings) {
  if (kind === "multiway") return multiwayMatrixModel(spot);
  if (kind === "squeeze") return squeezeResponseModel(spot, responses, openings);
  return coldThreeBetMatrixModel(spot);
}

export function extendedUnreachableReason(kind, spot) {
  if (kind !== "squeeze") return null;
  return spot.prior_action === null ? "オープン頻度0%、推奨なし" : "オープンへのコール頻度0%、推奨なし";
}

// Hand-detail sizes and the unreachable explanation for the added spot kinds.
export function extendedBreakdown(kind, spot, hand) {
  const fourBet = { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` };
  if (kind === "multiway") return {
    sizeItem: { label: "スクイーズサイズ（合計）", value: hand.squeeze_size_bb === null ? "—（スクイーズなし）" : `${hand.squeeze_size_bb} BB` },
    received: [{ label: "受けるオープン（合計）", value: `${spot.open_size_bb} BB` }],
  };
  if (kind === "squeeze") return {
    sizeItem: fourBet,
    received: [{ label: "受けるスクイーズ（合計）", value: `${spot.squeeze_size_bb} BB` }],
    unreachableText: spot.prior_action === null
      ? "オープン頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。"
      : "オープンへのコール頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。",
  };
  if (kind === "cold") return { sizeItem: fourBet, received: [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] };
  if (kind === "limp_reraise") return {
    sizeItem: fourBet,
    received: [{ label: "受けるリンプ・リレイズ（合計）", value: `${spot.limp_reraise_size_bb} BB` }],
    unreachableText: "BBのアイソレイズ頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。",
  };
  return null;
}
