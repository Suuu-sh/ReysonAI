import type { FrequencyRow, PreflopAction } from "./preflop-types.ts";
import type { Multiway2Dataset, Multiway2Spot, MultiwayDataset, OpeningDataset, ResponseDataset } from "./preflop-types.ts";
import type { MatrixModel } from "../data.ts";
import { hands } from "../data.ts";
import { effectiveStackBb, openSizeBb, openSizeFor, positions, twoCallerSqueezeToSize } from "./sizing.ts";
import { hasConfiguredRake } from "./rake.ts";
import { validateOpeningDataset } from "./opening-ranges.ts";
import { validateDataset } from "./ranges.ts";
import { validateMultiwayDataset } from "./multiway-responses.ts";

// Same ordered triples as admin/coverage.ts's multiway_two_callers category.
// Hero acts for the first time after an open and exactly two prior calls.
const triples = (list: string[]) => list.flatMap((a, i) => list.slice(i + 1).flatMap((b, j) =>
  list.slice(i + j + 2).map(c => [a, b, c])));
export const multiway2Spots = positions.slice(0, 3).flatMap(opener =>
  triples(positions.slice(positions.indexOf(opener) + 1)).map(([c1, c2, hero]) => ({
    id: `${hero}_vs_${opener}_${c1}call_${c2}call`, hero, opener, callers: [c1, c2],
    source_opening_id: `${opener}_open`,
    source_caller_ids: [`${c1}_vs_${opener}`, `${c2}_vs_${opener}_${c1}call`],
  })));
const ROW_KEYS = ["hand", "fold", "call", "squeeze", "squeeze_size_bb"];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function validateMultiway2Dataset(data: Multiway2Dataset, multiway: MultiwayDataset, responses: ResponseDataset, openings: OpeningDataset) {
  const fail: (detail: string) => never = detail => { throw new Error(`2コーラーへの応答データが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 ||
      !hasConfiguredRake(data.metadata) ||
      !same(data.metadata.legal_actions, ["fold", "call", "squeeze"]) ||
      data.spot_count !== multiway2Spots.length || data.hand_classes_per_spot !== hands.length ||
      data.entry_count !== multiway2Spots.length * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== multiway2Spots.length) fail("メタデータ・局面数");

  // An absent or malformed predecessor is an error, never evidence that a
  // history cannot happen. In particular c2 must be the saved multiway call.
  try {
    validateOpeningDataset(openings);
    validateDataset(responses);
    validateMultiwayDataset(multiway, responses);
  } catch (error) { fail(`前段のデータ: ${(error as Error).message}`); }
  const frequencies = <D extends OpeningDataset | ResponseDataset | MultiwayDataset>(dataset: D, id: string, action: PreflopAction): D["spots"][number] => {
    const source = dataset.spots.find(item => item.id === id);
    if (!source || !Array.isArray(source.hands) || source.hands.length !== hands.length ||
        source.hands.some((row, j) => row?.hand !== hands[j] ||
          !Number.isInteger((row as FrequencyRow)[action]!) || (row as FrequencyRow)[action]! < 0 || (row as FrequencyRow)[action]! > 100)) fail(`前段の頻度: ${id}`);
    return source as D["spots"][number];
  };
  for (let i = 0; i < multiway2Spots.length; i += 1) {
    const expected = multiway2Spots[i], spot = data.spots[i];
    const [c1, c2] = expected.callers;
    const open = frequencies(openings, expected.source_opening_id, "open");
    const first = frequencies(responses, expected.source_caller_ids[0], "call");
    const second = frequencies(multiway, expected.source_caller_ids[1], "call");
    if (open.hero !== expected.opener || first.hero !== c1 || first.opener !== expected.opener ||
        second.hero !== c2 || second.opener !== expected.opener || !same(second.callers, [c1]) ||
        [open, first, second].some(source => source.open_size_bb !== openSizeFor(expected.opener) ||
          source.effective_stack_bb !== effectiveStackBb)) fail(`前段の文脈: ${expected.id}`);
    const unreachable = !open.hands.some(row => row.open > 0) ||
      !first.hands.some(row => row.call > 0) || !second.hands.some(row => row.call > 0);
    const size = twoCallerSqueezeToSize(expected.opener, expected.hero);
    if (!spot || !Object.entries(expected).every(([key, value]) => same(spot[key as keyof typeof spot], value)) ||
        typeof spot.unreachable !== "boolean" || spot.unreachable !== unreachable ||
        spot.open_size_bb !== openSizeFor(expected.opener) || spot.squeeze_size_bb !== size ||
        spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? expected.id}`);
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== ROW_KEYS.length ||
          !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.squeeze].every(n => Number.isInteger(n) && n >= 0 && n <= 100) ||
          row.fold + row.call + row.squeeze !== 100 ||
          row.squeeze_size_bb !== (row.squeeze > 0 ? size : null) ||
          (unreachable && row.fold !== 100)) fail(`${spot.id} / ${hands[j]}`);
    }
  }
  return data;
}

export function findMultiway2Spot(data: Multiway2Dataset, opener: string, callers: string[], hero = "BB") {
  const spot = data?.spots?.find(item => item.hero === hero && item.opener === opener && same(item.callers, callers));
  if (!spot) throw new Error(`この組み合わせの${hero}の2コーラー応答はありません。`);
  return spot;
}

export function multiway2MatrixModel(spot: Multiway2Spot): MatrixModel {
  return {
    actions: ["squeeze", "call", "fold"],
    actionLabels: { squeeze: `スクイーズ ${spot.squeeze_size_bb}BB` },
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      actions: { squeeze: row.squeeze / 100, call: row.call / 100, fold: row.fold / 100 },
    }])),
  };
}
