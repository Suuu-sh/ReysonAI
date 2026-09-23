// Original opener facing the 3bettor's 100BB 5bet all-in after its own 4bet: call or fold.
// All money is in, so the call is decided by equity vs the shove range against pot odds.
// Writes only into ESTIMATES_DIR (the staging dir of `npm run build:estimates`).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blockedShare, comboCount, equityVsRange, seedFor, seededRandom, weightedRange } from "./lib/equity.mjs";

const staging = process.env.ESTIMATES_DIR;
if (!staging) {
  console.error("Run `npm run build:estimates`; generators never write src/estimated directly.");
  process.exit(1);
}
const SAMPLES = 20000;
const MIX_BAND_PCT = 2; // equity margin (pt) over which call frequency ramps from 0 to 100
const blind = { SB: 0.5, BB: 1 };
const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
const opening = load("opening-ranges");
const responses = load("preflop-ranges");
const threeBets = load("three-bet-responses");
const fourBets = load("four-bet-responses");
const round1 = value => Math.round(value * 10) / 10;

function callFrequency(marginPct) {
  const raw = 50 + marginPct / MIX_BAND_PCT * 50;
  return Math.max(0, Math.min(100, Math.round(raw / 5) * 5));
}

function reasonFor({ hand, equity, need, margin, call, opener, fiveBettor, fourBet, blocked }) {
  const verdict = call === 100 ? "コールします" : call === 0 ? "フォールドします" : `境界のため、コール${call}%・フォールド${100 - call}%に分けます`;
  const lead = margin >= 0
    ? `${fiveBettor}のオールインレンジに対する勝率は${equity.toFixed(1)}%で、必要勝率${need.toFixed(1)}%を${margin.toFixed(1)}pt上回ります。`
    : `${fiveBettor}のオールインレンジに対する勝率は${equity.toFixed(1)}%で、必要勝率${need.toFixed(1)}%に${(-margin).toFixed(1)}pt届きません。`;
  const blocker = blocked >= 15 ? `${hand[0]}を持つことで相手の強いハンドを${blocked.toFixed(1)}%減らせる点も後押しします。` : "";
  return `${opener}が${fourBet}BBに4bet後、100BBのオールインを受けた局面です。残りは全額なので、その後の駆け引きはなく勝率とポットオッズだけで判断できます。${lead}${blocker}${verdict}。`;
}

const spots = threeBets.spots.map(before => {
  const opener = before.opener;
  const fiveBettor = before.three_bettor;
  const response = responses.spots.find(s => s.opener === opener && s.hero === fiveBettor);
  const fourBetSpot = fourBets.spots.find(s => s.opener === opener && s.hero === fiveBettor);
  const openRows = new Map(opening.spots.find(s => s.hero === opener).hands.map(row => [row.hand, row]));
  const threeBetWeight = new Map(response.hands.map(row => [row.hand, row.three_bet / 100]));
  const shoveRange = weightedRange(fourBetSpot.hands.map(row => ({ hand: row.hand, weight: threeBetWeight.get(row.hand) * row.all_in / 100 })));
  const dead = 1.5 - (blind[opener] ?? 0) - (blind[fiveBettor] ?? 0);
  const fourBet = fourBetSpot.four_bet_size_bb;
  const need = (100 - fourBet) / (200 + dead) * 100;
  const random = seededRandom(seedFor(`${opener}>${fiveBettor}>five_bet`));
  const hands = before.hands.map(row => {
    const reachable = openRows.get(row.hand).open > 0 && row.four_bet > 0;
    if (!reachable) {
      return { hand: row.hand, fold: 100, call: 0, equity_vs_shove_pct: null,
        reason: `${opener}の既存4bet頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。` };
    }
    const equity = equityVsRange(row.hand, shoveRange, SAMPLES, random) * 100;
    const margin = equity - need;
    const call = callFrequency(margin);
    const blocked = blockedShare(row.hand, shoveRange) * 100;
    return { hand: row.hand, fold: 100 - call, call, equity_vs_shove_pct: round1(equity),
      reason: reasonFor({ hand: row.hand, equity, need, margin, call, opener, fiveBettor, fourBet, blocked }) };
  });
  return {
    id: `${opener}_vs_${fiveBettor}_five_bet`, opener, hero: opener, five_bettor: fiveBettor,
    source_four_bet_response_id: fourBetSpot.id, open_size_bb: 2.5, effective_stack_bb: 100,
    three_bet_size_bb: fourBetSpot.three_bet_size_bb, four_bet_size_bb: fourBet, all_in_size_bb: 100,
    call_break_even_equity_pct: round1(need),
    shove_range_combos: round1(shoveRange.reduce((acc, item) => acc + item.weight, 0)),
    hands,
  };
});

const data = {
  metadata: {
    schema_version: "1.0", strategy_type: "ai_estimate_not_gto",
    game: "6max Cash / No-Limit Texas Holdem", effective_stack_bb: 100, open_size_bb: 2.5, ante_bb: 0,
    scope: "オープナー2.5BB → 後続が3bet → オープナーが4bet → 3bettorが100BBオールイン → オープナーのコール／フォールド。他の全員はフォールド。",
    legal_actions: ["fold", "call"],
    method: `相手のオールインレンジ（保存済みの3bet頻度×5betオールイン頻度で重み付け）に対する勝率をモンテカルロ法（${SAMPLES}回・シード固定）で計算し、ポットオッズの必要勝率と比較。差が±${MIX_BAND_PCT}pt以内はコール頻度を線形に混合し5%刻みに丸める。`,
    frequency_semantics: "当該ハンドで既に4betした条件下の割合。fold+call=100。",
    unreachable_hands: "既存のオープンまたは4bet頻度が0%のハンドは対象外。形式上fold=100、equity_vs_shove_pct=null。",
    warning: "AI推定。前段の保存レンジを前提にした計算で、前段との同時均衡やレーキは考慮しません。",
  },
  spot_count: spots.length, hand_classes_per_spot: 169, entry_count: spots.length * 169, spots,
};
writeFileSync(join(staging, "five-bet-responses.json"), JSON.stringify(data, null, 2) + "\n");
console.log(`Generated ${spots.length} five-bet response spots`);
