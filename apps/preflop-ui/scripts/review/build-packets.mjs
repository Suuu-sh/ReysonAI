// Builds review packets for a different LLM to audit persisted ranges (see README.md).
// Usage: node scripts/review/build-packets.mjs [spot_id ...]   (no ids = every spot)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { comboCount, seedFor, seededRandom } from "../lib/equity.mjs";

const root = new URL("../../", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`src/estimated/${name}.json`, root)));
const out = sub => { const dir = new URL(`.local/review/${sub}/`, root); mkdirSync(dir, { recursive: true }); return dir; };
const packetDir = out("packets");
const keyDir = out("answer-key");

const TYPES = {
  open: { file: "opening-ranges", actions: ["open", "fold"] },
  response: { file: "preflop-ranges", actions: ["three_bet", "call", "fold"] },
  three_bet: { file: "three-bet-responses", actions: ["four_bet", "call", "fold"] },
  four_bet: { file: "four-bet-responses", actions: ["all_in", "call", "fold"] },
  five_bet: { file: "five-bet-responses", actions: ["call", "fold"] },
};
const RUBRIC = [
  "合法性：頻度の合計100、合法なアクションのみ、到達不能ハンドの扱い",
  "数値との整合：必要勝率・勝率・相手の降りる率と、選んだアクションが矛盾しないか",
  "ポジション：OOP/IPや後ろに残る人数を反映しているか",
  "レンジ構成：バリューとブラフの比率、ブロッカーの使い方、強いハンドが降りすぎていないか",
  "前後の局面との整合：前の局面で選ばれたハンドだけが到達しているか",
  "理由文の正確さ：理由が頻度と数値に一致しているか",
];

function history(type, spot) {
  switch (type) {
    case "open": return `${spot.hero}まで全員フォールド。${spot.hero}がオープン（2.5BB）するかを判断。`;
    case "response": return `${spot.opener}が2.5BBでオープン、間の全員フォールド。${spot.hero}が判断（3betは${spot.three_bet_size_bb}BB）。`;
    case "three_bet": return `${spot.opener}が2.5BBでオープン、${spot.three_bettor}が${spot.three_bet_size_bb}BBに3bet、他は全員フォールド。${spot.opener}が判断（4betは${spot.four_bet_size_bb}BB）。`;
    case "four_bet": return `${spot.opener}が2.5BBでオープン、${spot.hero}が${spot.three_bet_size_bb}BBに3bet、${spot.opener}が${spot.four_bet_size_bb}BBに4bet。${spot.hero}が判断（5betは100BBオールインのみ）。`;
    case "five_bet": return `${spot.opener}が2.5BBでオープン、${spot.five_bettor}が${spot.three_bet_size_bb}BBに3bet、${spot.opener}が${spot.four_bet_size_bb}BBに4bet、${spot.five_bettor}が100BBオールイン。${spot.opener}がコールかフォールドを判断。`;
    default: throw new Error(type);
  }
}

const mixOf = (row, actions) => Object.fromEntries(actions.map(action => [action, row[action]]));
const isUnreachable = row => typeof row.reason === "string" && row.reason.includes("対象外");

// Strong hands, action boundaries, bluff candidates and clear folds, so disagreement shows where it matters.
function stratifiedSample(spot, actions, random, size = 30) {
  const live = spot.hands.filter(row => !isUnreachable(row));
  const top = row => Math.max(...actions.map(action => row[action]));
  const raise = actions[0];
  const pick = (rows, count) => rows.sort(() => random() - 0.5).slice(0, count);
  const boundary = live.filter(row => top(row) < 80);
  const pure = live.filter(row => top(row) >= 80 && row.fold < 80);
  const bluffs = live.filter(row => row[raise] > 0 && !/^(AA|KK|QQ|JJ|AK)/.test(row.hand));
  const folds = live.filter(row => row.fold >= 80);
  const chosen = new Map();
  for (const [rows, count] of [[boundary, 12], [pure, 8], [bluffs, 5], [folds, 5]]) for (const row of pick([...rows], count)) chosen.set(row.hand, row);
  for (const row of pick(live.filter(row => !chosen.has(row.hand)), size - chosen.size)) chosen.set(row.hand, row);
  return [...chosen.keys()];
}

// Obvious errors a competent reviewer must flag; stored only in the answer key.
function canaries(spot, actions, random) {
  const live = spot.hands.filter(row => !isUnreachable(row));
  const strong = live.filter(row => /^(AA|KK|QQ|AKs)$/.test(row.hand) && row.fold === 0);
  const weak = live.filter(row => row.fold >= 90 && /o$/.test(row.hand));
  const result = [];
  if (strong.length) result.push({ hand: strong[Math.floor(random() * strong.length)].hand, injected: { ...Object.fromEntries(actions.map(a => [a, 0])), fold: 100 }, kind: "strong_hand_folds" });
  if (weak.length) result.push({ hand: weak[Math.floor(random() * weak.length)].hand, injected: { ...Object.fromEntries(actions.map(a => [a, 0])), [actions[0]]: 100 }, kind: "trash_hand_raises" });
  return result;
}

const wanted = new Set(process.argv.slice(2));
let count = 0;
for (const [type, { file, actions }] of Object.entries(TYPES)) {
  if (!existsSync(new URL(`src/estimated/${file}.json`, root))) continue;
  for (const saved of load(file).spots) {
    if (wanted.size && !wanted.has(saved.id)) continue;
    const random = seededRandom(seedFor(`review:${saved.id}`));
    const reasonsPath = new URL(`src/estimated/reasons/${saved.id}.json`, root);
    const detailed = existsSync(reasonsPath) ? JSON.parse(readFileSync(reasonsPath)) : null;
    // Reasons live in reasons/<spot>.json; only the 5bet dataset still carries them inline.
    const spot = { ...saved, hands: saved.hands.map(row => ({ ...row, reason: detailed?.hands[row.hand]?.reason ?? row.reason })) };
    const { hands, ...spotMeta } = spot;
    const context = { spot_id: spot.id, type, history: history(type, spot), legal_actions: actions, sizes: spotMeta,
      spot_facts: detailed?.spot_facts ?? null, rubric: RUBRIC,
      conventions: "頻度は整数%で合計100。サイズは合計投入額(raise-to)。6max Cash 100BB、アンティなし。GTOソルバーの出力ではなくAI推定の審査である。" };
    const sample = stratifiedSample(spot, actions, random);
    writeFileSync(new URL(`${spot.id}.blind.json`, packetDir), JSON.stringify({
      ...context, mode: "blind",
      instructions: "現在の頻度は伏せてある。各ハンドについて、この局面で妥当と考える頻度を独立に推定し、確信度(0-1)と短い根拠を返すこと。",
      hands: sample.map(hand => ({ hand, combos: comboCount(hand), facts: detailed?.hands[hand]?.facts ?? null })),
      output_schema: { spot_id: "string", reviewer_model: "string", hands: [{ hand: "string", mix: Object.fromEntries(actions.map(a => [a, "integer"])), confidence: "number", rationale: "string" }] },
    }, null, 2) + "\n");
    const injected = canaries(spot, actions, random);
    const rows = hands.map(row => {
      const canary = injected.find(item => item.hand === row.hand);
      return { hand: row.hand, mix: canary ? canary.injected : mixOf(row, actions), unreachable: isUnreachable(row),
        reason: row.reason, facts: detailed?.hands[row.hand]?.facts ?? null };
    });
    writeFileSync(new URL(`${spot.id}.critique.json`, packetDir), JSON.stringify({
      ...context, mode: "critique",
      instructions: "審査の観点ごとに問題のある行を指摘し、重大度(error/warn/info)・修正後の頻度・根拠（参照した数値のキー）を返すこと。問題がなければ issues は空でよい。",
      hands: rows,
      output_schema: { spot_id: "string", reviewer_model: "string", overall: { score: "1-5", summary: "string" },
        issues: [{ hand: "string|null", severity: "error|warn|info", category: "string", proposed_mix: Object.fromEntries(actions.map(a => [a, "integer"])), rationale: "string", cited_facts: ["string"] }] },
    }, null, 2) + "\n");
    writeFileSync(new URL(`${spot.id}.json`, keyDir), JSON.stringify({ spot_id: spot.id, type, actions, canaries: injected,
      current: Object.fromEntries(hands.map(row => [row.hand, mixOf(row, actions)])) }, null, 2) + "\n");
    count += 1;
  }
}
console.log(`${count} spots → .local/review/packets (blind + critique), answer keys in .local/review/answer-key`);
