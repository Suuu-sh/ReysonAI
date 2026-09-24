// AI推定レンジ（GTOではない）の配信。
// 正本は apps/preflop-ui/src/estimated/*.json で、Workerのビルド時に同梱するためR2を使わない。
import opening from "../../preflop-ui/src/estimated/opening-ranges.json" with { type: "json" };
import openResponses from "../../preflop-ui/src/estimated/preflop-ranges.json" with { type: "json" };
import threeBetResponses from "../../preflop-ui/src/estimated/three-bet-responses.json" with { type: "json" };
import fourBetResponses from "../../preflop-ui/src/estimated/four-bet-responses.json" with { type: "json" };
import fiveBetResponses from "../../preflop-ui/src/estimated/five-bet-responses.json" with { type: "json" };
import limpResponses from "../../preflop-ui/src/estimated/limp-responses.json" with { type: "json" };

const raise = (position, sizeBb) => ({ position, action: "raise", sizeBb });

// 各データセットの形式を、履歴・選択肢・頻度の共通形式へ変換する定義。
// options の key は頻度の列名、action/sizeBb は正規化後のアクション。
const DATASETS = [
  {
    id: "opening",
    stage: "open",
    source: opening,
    history: () => [],
    options: (spot) => [
      { key: "fold", action: "fold" },
      ...(spot.hero === "SB" ? [{ key: "limp", action: "call", sizeBb: 1 }] : []),
      { key: "open", action: "raise", sizeBb: spot.open_size_bb },
    ],
  },
  {
    id: "open-responses",
    stage: "vs_open",
    source: openResponses,
    history: (spot) => [raise(spot.opener, spot.open_size_bb)],
    options: (spot) => [
      { key: "fold", action: "fold" },
      { key: "call", action: "call" },
      { key: "three_bet", action: "raise", sizeBb: spot.three_bet_size_bb },
    ],
  },
  {
    id: "three-bet-responses",
    stage: "vs_3bet",
    source: threeBetResponses,
    history: (spot) => [raise(spot.opener, spot.open_size_bb), raise(spot.three_bettor, spot.three_bet_size_bb)],
    options: (spot) => [
      { key: "fold", action: "fold" },
      { key: "call", action: "call" },
      { key: "four_bet", action: "raise", sizeBb: spot.four_bet_size_bb },
    ],
    reachable: (spot) => rowsOf(opening, `${spot.opener}_open`, "open"),
  },
  {
    id: "four-bet-responses",
    stage: "vs_4bet",
    source: fourBetResponses,
    history: (spot) => [
      raise(spot.opener, spot.open_size_bb),
      raise(spot.hero, spot.three_bet_size_bb),
      raise(spot.opener, spot.four_bet_size_bb),
    ],
    options: () => [
      { key: "fold", action: "fold" },
      { key: "call", action: "call" },
      { key: "all_in", action: "all_in" },
    ],
    reachable: (spot) => rowsOf(openResponses, spot.source_response_id, "three_bet"),
  },
  {
    id: "five-bet-responses",
    stage: "vs_5bet",
    source: fiveBetResponses,
    history: (spot) => [
      raise(spot.opener, spot.open_size_bb),
      raise(spot.five_bettor, spot.three_bet_size_bb),
      raise(spot.opener, spot.four_bet_size_bb),
      { position: spot.five_bettor, action: "all_in" },
    ],
    options: () => [
      { key: "fold", action: "fold" },
      { key: "call", action: "call" },
    ],
    reachable: (spot) => {
      const fourBet = fourBetResponses.spots.find((item) => item.id === spot.source_four_bet_response_id);
      return rowsOf(threeBetResponses, fourBet?.source_three_bet_response_id, "four_bet");
    },
  },
  {
    id: "limp-responses",
    stage: "vs_limp",
    source: limpResponses,
    history: (spot) => spot.hero === "BB"
      ? [{ position: "SB", action: "call", sizeBb: spot.open_size_bb }]
      : [{ position: "SB", action: "call", sizeBb: spot.open_size_bb }, raise("BB", spot.iso_size_bb)],
    options: (spot) => spot.hero === "BB"
      ? [{ key: "check", action: "check" }, { key: "raise", action: "raise", sizeBb: spot.raise_size_bb }]
      : [{ key: "fold", action: "fold" }, { key: "call", action: "call" }, { key: "raise", action: "raise", sizeBb: spot.raise_to_bb }],
    reachable: (spot) => (spot.hero === "SB" ? rowsOf(opening, spot.source_opening_id, "limp") : null),
  },
];

// 前段で自分が選んだアクションの頻度が0%のハンドは、このスポットに到達しない。
function rowsOf(dataset, spotId, key) {
  const spot = dataset.spots.find((item) => item.id === spotId);
  if (!spot) return null;
  return new Set(spot.hands.filter((row) => Number(row[key]) > 0).map((row) => row.hand));
}

export function actionKey({ action, sizeBb }) {
  return action === "raise" ? `raise_${sizeBb}` : action;
}

function spotSummary(dataset, spot) {
  return {
    dataset: dataset.id,
    spotId: spot.id,
    stage: dataset.stage,
    hero: spot.hero,
    effectiveStackBb: spot.effective_stack_bb,
    history: dataset.history(spot),
    options: dataset.options(spot).map(({ action, sizeBb }) => (sizeBb == null ? { action } : { action, sizeBb })),
  };
}

function spotDetail(dataset, spot) {
  const options = dataset.options(spot);
  const reachable = dataset.reachable?.(spot) ?? null;
  return {
    ...spotSummary(dataset, spot),
    strategyType: dataset.source.metadata?.strategy_type ?? "ai_estimate_not_gto",
    hands: spot.hands.map((row) => ({
      hand: row.hand,
      reachable: reachable ? reachable.has(row.hand) : true,
      frequencies: Object.fromEntries(options.map((option) => [actionKey(option), (Number(row[option.key]) || 0) / 100])),
    })),
  };
}

export function listEstimatedDatasets() {
  return DATASETS.map((dataset) => ({
    id: dataset.id,
    stage: dataset.stage,
    spotCount: dataset.source.spots.length,
    strategyType: dataset.source.metadata?.strategy_type ?? "ai_estimate_not_gto",
  }));
}

export function listEstimatedSpots() {
  return DATASETS.flatMap((dataset) => dataset.source.spots.map((spot) => spotSummary(dataset, spot)));
}

export function findEstimatedSpot(datasetId, spotId) {
  const dataset = DATASETS.find((item) => item.id === datasetId);
  const spot = dataset?.source.spots.find((item) => item.id === spotId);
  return spot ? spotDetail(dataset, spot) : null;
}
