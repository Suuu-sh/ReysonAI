// Range coverage catalog for the admin dashboard: which spots are persisted,
// and which spots of the preflop tree still need an authored range.
// Pure data (no React) so tests and scripts can reuse it.
import { dataset } from "../estimated/datasets.ts";
import { positions } from "../estimated/sizing.ts";
import { coldThreeBetSpots } from "../estimated/cold-three-bet-responses.ts";
import { BUILT, formatOptions } from "../estimated/game-formats.ts";

// Published preflop datasets (src/estimated/datasets.ts); preloaded before this module runs in the browser.
const opening = dataset("opening-ranges");
const responses = dataset("preflop-ranges");
const threeBets = dataset("three-bet-responses");
const fourBets = dataset("four-bet-responses");
const fiveBets = dataset("five-bet-responses");
const limp = dataset("limp-responses");
const coldThreeBets = dataset("cold-three-bet-responses");
const multiway = dataset("multiway-responses");
const multiway2 = dataset("multiway2-responses");
const coldFourBets = dataset("cold-four-bet-responses");
const squeezes = dataset("squeeze-responses");
const limpDeep = dataset("limp-deep-responses");

const RFI = positions.slice(0, 5); // UTG..SB
const after = seat => positions.slice(positions.indexOf(seat) + 1);
const pairs = list => list.flatMap((a, i) => list.slice(i + 1).map(b => [a, b]));
const triples = list => list.flatMap((a, i) => pairs(list.slice(i + 1)).map(rest => [a, ...rest]));
const headsUp = RFI.flatMap(opener => after(opener).map(hero => ({ opener, hero })));

export const PRIORITIES = Object.freeze([
  { value: 1, label: "P1", title: "BTN vs BB", scope: "BTNオープン対BBのプリフロップ全分岐（5bet終端を含む）を起点に、SRP・3bet・4betを全ボード・全アクション分岐でリバーまで対応する。" },
  { value: 2, label: "P2", title: "その他のヘッズアップ", scope: "残りの全ヘッズアップを、SRP・3bet・4bet・リンプと全ボード・全アクション分岐を含めてプリフロップからリバーまで対応する。" },
  { value: 3, label: "R", title: "リリース準備", scope: "ヘッズアップのポストフロップをD1から本番配信し、ターン・リバーの精密な理由文を入れる。手ごとのEVは出さない（2026-10-01 決定）。「GTOではない」表示は利用規約のみ（2026-09-29 決定）。" },
  { value: 4, label: "P3", title: "マルチウェイ", scope: "リリース後に、複数コーラー・スクイーズ・コールド4betとマルチウェイのポストフロップに対応する。" },
]);

const BTN_BB_PREFLOP = new Set(["BTN_open", "BB_vs_BTN", "BTN_vs_BB_three_bet", "BB_vs_BTN_four_bet", "BTN_vs_BB_five_bet"]);
const HEADS_UP_PREFLOP = new Set(["open", "response", "three_bet", "four_bet", "five_bet", "limp", "limp_deep"]);
export function preflopPriority(category, id) {
  if (BTN_BB_PREFLOP.has(id)) return 1;
  return HEADS_UP_PREFLOP.has(category) ? 2 : 4;
}

export function postflopPriority(spot) {
  return spot.opener === "BTN" && spot.ip === "BTN" && spot.oop === "BB" ? 1 : 2;
}

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
  // Stage 1b persisted branches; UI action-path integration is a separate task.
  { key: "multiway_two_callers", label: "コーラー2人のマルチウェイ応答", file: "multiway2-responses.json", data: multiway2,
    expected: RFI.slice(0, 3).flatMap(opener => triples(after(opener)).map(([c1, c2, hero]) =>
      ({ id: `${hero}_vs_${opener}_${c1}call_${c2}call`, hero, path: `${opener} open → ${c1} call → ${c2} call → ${hero}` }))) },
  { key: "cold_four_bet", label: "コールド4betへの応答", file: "cold-four-bet-responses.json", data: coldFourBets,
    expected: coldThreeBetSpots.flatMap(spot => [
      { id: `${spot.opener}_vs_${spot.hero}_cold4bet_${spot.three_bettor}3bet`, hero: spot.opener, path: `${spot.opener} open → ${spot.three_bettor} 3bet → ${spot.hero} 4bet → ${spot.opener}` },
      { id: `${spot.three_bettor}_vs_${spot.hero}_cold4bet_${spot.opener}open`, hero: spot.three_bettor, path: `… ${spot.hero} 4bet → ${spot.opener} fold → ${spot.three_bettor}` },
    ]) },
  { key: "limp_deep", label: "リンプ木の深い分岐", file: "limp-deep-responses.json", data: limpDeep,
    expected: [
      { id: "SB_vs_BB_limp_four_bet", hero: "SB", path: "SB limp → BB iso → SB reraise → BB 4bet → SB" },
      { id: "BB_vs_SB_limp_five_bet", hero: "BB", path: "… BB 4bet → SB all-in → BB" },
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
      return { ...spot, category: category.key, priority: preflopPriority(category.key, spot.id), status: record ? "done" : "todo", hands: record?.hands?.length ?? 0 };
    });
    // Persisted spots outside the enumerated tree are still shown so nothing is hidden.
    for (const spot of saved) {
      if (!expectedIds.has(spot.id)) rows.push({ id: spot.id, hero: spot.hero, path: "（ツリー外の保存スポット）", category: category.key, priority: preflopPriority(category.key, spot.id), status: "done", hands: spot.hands?.length ?? 0 });
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
// .local/postflop-ai folder, so the caller passes { file name: policy hash } for what it sees there.
// A policy whose hash is shared with other spots is a copied placeholder, not that spot's own
// policy, so it stays TODO ("copy") unless the spot is in `authoredIds` (the original).
// Each reachable spot needs a flop policy (<slug>-policy.json) and a turn/river policy
// (<slug>-later-policy.json); spots whose preflop range never reaches the flop are skipped.
const POT_KINDS = [["srp", "シングルレイズポット"], ["3bp", "3betポット"], ["4bp", "4betポット"], ["limp", "リンプポット"]];
const STAGES = [
  { street: "flop", label: "フロップ", suffix: "-policy.json" },
  { street: "turn_river", label: "ターン/リバー", suffix: "-later-policy.json" },
  // Per-hand EV was dropped from the product (2026-10-01): there is no EV stage to track.
];

// One-off release tasks without per-spot files. Update `done` when the task lands.
export const RELEASE_TASKS = Object.freeze([
  { id: "release_d1", hero: "—", path: "Cloudflare D1 に方針・理由文を入れ、reysonai-api から本番配信（ローカル専用 middleware を置き換え）", done: true },
  { id: "release_no_gto_ui", hero: "—", path: "「GTOではない / AI推定」表示をUIから外し、利用規約だけに残す", done: true },
  { id: "release_terms", hero: "—", path: "利用規約ページを用意し、「AIの推定であり GTO・数学的最適性を保証しない」旨をそこに書く（今はサイトのフッターに「準備中」のリンクと注意書きがあるだけ）", done: false },
  { id: "release_turn_river_reasons", hero: "—", path: "ターン・リバーの精密な理由文（ノード×アクション×手の強さ×落ちたカード×前のストリートの文面を日英で用意し、相手レンジへの勝率・降ろせる割合・必要勝率の数字を根拠に添える）", done: true },
  { id: "release_turn_river_ev", hero: "—", path: "【見送り・2026-10-01 決定】ターン・リバーの手ごとのEV。EVは両者の想定戦略に依存し、相手のコールレンジがGTOと違うと正確でないため、ポストフロップのEVは出さない", done: true },
]);

export function postflopCatalog(spots, artifactHashes = {}, authoredIds = []) {
  const counts = {};
  for (const hash of Object.values(artifactHashes)) if (hash && hash !== "fresh") counts[hash] = (counts[hash] ?? 0) + 1;
  const statusOf = (spot, name, stage) => {
    if (!(name in artifactHashes)) return "todo";
    if (stage.freshness) return artifactHashes[name] === "fresh" ? "done" : "todo";
    const hash = artifactHashes[name];
    return authoredIds.includes(spot.id) || (hash && counts[hash] === 1) ? "done" : "copy";
  };
  const reachable = spots.filter(spot => spot.reachable);
  const categories = STAGES.flatMap(stage => POT_KINDS.map(([kind, kindLabel]) => {
    const rows = reachable.filter(spot => spot.kind === kind).map(spot => ({
      id: spot.id, hero: `${spot.ip} vs ${spot.oop}`, path: `${kindLabel} · ${spot.ip} IP / ${spot.oop} OOP`,
      category: `${stage.street}_${kind}`, priority: stage.priority ?? postflopPriority(spot), status: statusOf(spot, `${spot.slug}${stage.suffix}`, stage), street: stage.street,
    }));
    const done = rows.filter(row => row.status === "done").length;
    return { key: `${stage.street}_${kind}`, label: `${stage.label} · ${kindLabel}`, file: `.local/postflop-ai/*${stage.suffix}`, street: stage.street,
      modelled: true, rows, done, total: rows.length, todo: rows.length - done };
  }));
  // Multiway pots have no postflop model yet: one row per saved multiway preflop spot.
  const multiwayRows = spotsOf(multiway).map(spot => ({ id: `${spot.id}_postflop`, hero: spot.hero, path: `${spot.id} のマルチウェイ・フロップ以降`,
    category: "postflop_multiway", priority: 4, status: "todo", street: "flop" }));
  const releaseRows = RELEASE_TASKS.map(task => ({ id: task.id, hero: task.hero, path: task.path, category: "release_tasks",
    priority: 3, status: task.done ? "done" : "todo", street: "release" }));
  categories.push({ key: "release_tasks", label: "リリース作業", file: null, street: "release", modelled: true,
    rows: releaseRows, done: releaseRows.filter(row => row.status === "done").length, total: releaseRows.length,
    todo: releaseRows.filter(row => row.status !== "done").length });
  categories.push({ key: "postflop_multiway", label: "マルチウェイ・ポストフロップ", file: null, street: "flop", modelled: false,
    rows: multiwayRows, done: 0, total: multiwayRows.length, todo: multiwayRows.length });
  const done = categories.reduce((sum, c) => sum + c.done, 0);
  const total = categories.reduce((sum, c) => sum + c.total, 0);
  return { categories, done, total, todo: total - done, unreachable: spots.filter(spot => !spot.reachable).map(spot => spot.id) };
}

export function priorityBacklog(preflopCatalog, postflopCatalog) {
  const rows = [...preflopCatalog.categories, ...postflopCatalog.categories].flatMap(category => category.rows);
  return PRIORITIES.map(priority => {
    const assigned = rows.filter(row => row.priority === priority.value);
    return { ...priority, total: assigned.length, todo: assigned.filter(row => row.status !== "done").length };
  });
}
