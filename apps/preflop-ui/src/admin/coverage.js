// Range coverage catalog for the admin dashboard: which spots are persisted,
// and which spots of the preflop tree still need an authored range.
// Pure data (no React) so tests and scripts can reuse it.
import { positions } from "../estimated/sizing.js";
import { coldThreeBetSpots } from "../estimated/cold-three-bet-responses.js";
import { BUILT, formatOptions } from "../estimated/game-formats.js";
import opening from "../estimated/opening-ranges.json" with { type: "json" };
import responses from "../estimated/preflop-ranges.json" with { type: "json" };
import threeBets from "../estimated/three-bet-responses.json" with { type: "json" };
import fourBets from "../estimated/four-bet-responses.json" with { type: "json" };
import fiveBets from "../estimated/five-bet-responses.json" with { type: "json" };
import limp from "../estimated/limp-responses.json" with { type: "json" };
import coldThreeBets from "../estimated/cold-three-bet-responses.json" with { type: "json" };
import multiway from "../estimated/multiway-responses.json" with { type: "json" };
import squeezes from "../estimated/squeeze-responses.json" with { type: "json" };

const RFI = positions.slice(0, 5); // UTG..SB
const after = seat => positions.slice(positions.indexOf(seat) + 1);
const pairs = list => list.flatMap((a, i) => list.slice(i + 1).map(b => [a, b]));
const triples = list => list.flatMap((a, i) => pairs(list.slice(i + 1)).map(rest => [a, ...rest]));
const headsUp = RFI.flatMap(opener => after(opener).map(hero => ({ opener, hero })));

// Every category lists its full expected spot set; ids match the persisted datasets.
const CATEGORIES = [
  { key: "open", label: "オープン（RFI）", file: "opening-ranges.json", data: opening,
    expected: RFI.map(hero => ({ id: `${hero}_open`, hero, path: `${hero} open` })) },
  { key: "response", label: "オープンへの応答", file: "preflop-ranges.json", data: responses,
    expected: headsUp.map(({ opener, hero }) => ({ id: `${hero}_vs_${opener}`, hero, path: `${opener} open → ${hero}` })) },
  { key: "three_bet", label: "3betへの応答（オープナー）", file: "three-bet-responses.json", data: threeBets,
    expected: headsUp.map(({ opener, hero }) => ({ id: `${opener}_vs_${hero}_three_bet`, hero: opener, path: `${opener} open → ${hero} 3bet → ${opener}` })) },
  { key: "four_bet", label: "4betへの応答（3bettor）", file: "four-bet-responses.json", data: fourBets,
    expected: headsUp.map(({ opener, hero }) => ({ id: `${hero}_vs_${opener}_four_bet`, hero, path: `${opener} open → ${hero} 3bet → ${opener} 4bet → ${hero}` })) },
  { key: "five_bet", label: "5bet オールインへの応答", file: "five-bet-responses.json", data: fiveBets,
    expected: headsUp.map(({ opener, hero }) => ({ id: `${opener}_vs_${hero}_five_bet`, hero: opener, path: `… ${opener} 4bet → ${hero} 5bet AI → ${opener}` })) },
  { key: "limp", label: "SBリンプの木", file: "limp-responses.json", data: limp,
    expected: [
      { id: "BB_vs_SB_limp", hero: "BB", path: "SB limp → BB" },
      { id: "SB_vs_BB_iso", hero: "SB", path: "SB limp → BB iso → SB" },
      { id: "BB_vs_SB_limp_reraise", hero: "BB", path: "SB limp → BB iso → SB reraise → BB" },
    ] },
  { key: "cold_three_bet", label: "コールド3betへの応答", file: "cold-three-bet-responses.json", data: coldThreeBets,
    expected: coldThreeBetSpots.map(spot => ({ id: spot.id, hero: spot.hero, path: `${spot.opener} open → ${spot.three_bettor} 3bet → ${spot.hero}` })) },
  { key: "multiway", label: "コーラー1人のマルチウェイ応答", file: "multiway-responses.json", data: multiway,
    expected: RFI.slice(0, 4).flatMap(opener => pairs(after(opener)).map(([caller, hero]) =>
      ({ id: `${hero}_vs_${opener}_${caller}call`, hero, path: `${opener} open → ${caller} call → ${hero}` }))) },
  { key: "squeeze", label: "スクイーズへの応答", file: "squeeze-responses.json", data: squeezes,
    expected: RFI.slice(0, 4).flatMap(opener => pairs(after(opener)).flatMap(([caller, squeezer]) => [
      { id: `${opener}_vs_${squeezer}_squeeze_${caller}call`, hero: opener, path: `${opener} open → ${caller} call → ${squeezer} squeeze → ${opener}` },
      { id: `${caller}_vs_${squeezer}_squeeze_${opener}fold`, hero: caller, path: `… ${squeezer} squeeze → ${opener} fold → ${caller}` },
      { id: `${caller}_vs_${squeezer}_squeeze_${opener}call`, hero: caller, path: `… ${squeezer} squeeze → ${opener} call → ${caller}` },
    ])) },
  // Not yet modelled by any dataset: listed so the backlog shows the real remaining size.
  { key: "multiway_two_callers", label: "コーラー2人以上のマルチウェイ応答", file: null, data: null,
    expected: RFI.slice(0, 3).flatMap(opener => triples(after(opener)).map(([c1, c2, hero]) =>
      ({ id: `${hero}_vs_${opener}_${c1}call_${c2}call`, hero, path: `${opener} open → ${c1} call → ${c2} call → ${hero}` }))) },
  { key: "cold_four_bet", label: "コールド4betへの応答", file: null, data: null,
    expected: coldThreeBetSpots.flatMap(spot => [
      { id: `${spot.opener}_vs_${spot.hero}_cold4bet_${spot.three_bettor}3bet`, hero: spot.opener, path: `${spot.opener} open → ${spot.three_bettor} 3bet → ${spot.hero} 4bet → ${spot.opener}` },
      { id: `${spot.three_bettor}_vs_${spot.hero}_cold4bet_${spot.opener}open`, hero: spot.three_bettor, path: `… ${spot.hero} 4bet → ${spot.opener} fold → ${spot.three_bettor}` },
    ]) },
  { key: "limp_deep", label: "リンプ木の深い分岐", file: null, data: null,
    expected: [
      { id: "SB_vs_BB_iso_three_bet_response", hero: "SB", path: "SB limp → BB iso → SB call/reraise 後の再レイズ" },
      { id: "BB_vs_SB_limp_reraise_four_bet", hero: "SB", path: "SB limp → BB iso → SB reraise → BB 4bet → SB" },
    ] },
];

function spotsOf(data) {
  return data?.spots ?? [];
}

export function coverageCatalog() {
  const categories = CATEGORIES.map(category => {
    const saved = spotsOf(category.data);
    const expectedIds = new Set(category.expected.map(spot => spot.id));
    const rows = category.expected.map(spot => {
      const record = saved.find(item => item.id === spot.id);
      return { ...spot, category: category.key, status: record ? "done" : "todo", hands: record?.hands?.length ?? 0 };
    });
    // Persisted spots outside the enumerated tree are still shown so nothing is hidden.
    for (const spot of saved) {
      if (!expectedIds.has(spot.id)) rows.push({ id: spot.id, hero: spot.hero, path: "（ツリー外の保存スポット）", category: category.key, status: "done", hands: spot.hands?.length ?? 0 });
    }
    const done = rows.filter(row => row.status === "done").length;
    return { key: category.key, label: category.label, file: category.file, modelled: Boolean(category.file), rows, done, total: rows.length, todo: rows.length - done };
  });
  const done = categories.reduce((sum, c) => sum + c.done, 0);
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  return { categories, done, total, todo: total - done };
}

// Every combination of format options; only BUILT ones have ranges. Each unbuilt format
// needs the whole tree above again (same spot count, a rough but honest multiplier).
export function formatBacklog(treeSize) {
  const keys = ["game", "table", "stack", "openSize"];
  const combos = keys.reduce((acc, key) => acc.flatMap(partial => formatOptions[key].map(option => ({ ...partial, [key]: option.value }))), [{}]);
  return combos.map(format => {
    const built = BUILT.some(b => keys.every(key => b[key] === format[key]));
    return { ...format, built, spots: built ? 0 : treeSize };
  });
}

// Postflop (heads-up AI policy) backlog. The generated policies live in the gitignored
// .local/postflop-ai folder, so the caller passes the file names it can see there.
// Each reachable spot needs a flop policy (<slug>-policy.json) and a turn/river policy
// (<slug>-later-policy.json); spots whose preflop range never reaches the flop are skipped.
const POT_KINDS = [["srp", "シングルレイズポット"], ["3bp", "3betポット"], ["4bp", "4betポット"], ["limp", "リンプポット"]];
const STAGES = [
  { street: "flop", label: "フロップ", suffix: "-policy.json" },
  { street: "turn_river", label: "ターン/リバー", suffix: "-later-policy.json" },
];

export function postflopCatalog(spots, artifactNames = []) {
  const files = new Set(artifactNames);
  const reachable = spots.filter(spot => spot.reachable);
  const categories = STAGES.flatMap(stage => POT_KINDS.map(([kind, kindLabel]) => {
    const rows = reachable.filter(spot => spot.kind === kind).map(spot => ({
      id: spot.id, hero: `${spot.ip} vs ${spot.oop}`, path: `${kindLabel} · ${spot.ip} IP / ${spot.oop} OOP`,
      category: `${stage.street}_${kind}`, status: files.has(`${spot.slug}${stage.suffix}`) ? "done" : "todo", street: stage.street,
    }));
    const done = rows.filter(row => row.status === "done").length;
    return { key: `${stage.street}_${kind}`, label: `${stage.label} · ${kindLabel}`, file: `.local/postflop-ai/*${stage.suffix}`, street: stage.street,
      modelled: true, rows, done, total: rows.length, todo: rows.length - done };
  }));
  // Multiway pots have no postflop model yet: one row per saved multiway preflop spot.
  const multiwayRows = spotsOf(multiway).map(spot => ({ id: `${spot.id}_postflop`, hero: spot.hero, path: `${spot.id} のマルチウェイ・フロップ以降`,
    category: "postflop_multiway", status: "todo", street: "flop" }));
  categories.push({ key: "postflop_multiway", label: "マルチウェイ・ポストフロップ", file: null, street: "flop", modelled: false,
    rows: multiwayRows, done: 0, total: multiwayRows.length, todo: multiwayRows.length });
  const done = categories.reduce((sum, c) => sum + c.done, 0);
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  return { categories, done, total, todo: total - done, unreachable: spots.filter(spot => !spot.reachable).map(spot => spot.id) };
}
