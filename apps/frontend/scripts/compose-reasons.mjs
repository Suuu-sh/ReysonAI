// Composes detailed per-hand reasons from computed facts (.local/reason-facts) and saved frequencies.
// Usage: node scripts/compose-reasons.mjs [spot_id ...]   (no ids = every spot with facts)
// All supported spots use the same EV-aware composer, including BB_vs_BTN.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { reasonSourceFingerprint } from "./lib/reason-context.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const dataDir = process.env.ESTIMATES_DIR ? pathToFileURL(resolve(process.env.ESTIMATES_DIR) + "/") : new URL("../src/estimated/", import.meta.url);
const reasonDir = new URL("reasons/", dataDir);
mkdirSync(reasonDir, { recursive: true });
const RANKS = "AKQJT98765432";
const load = name => JSON.parse(readFileSync(new URL(`${name}.json`, dataDir)));
const sourceFingerprint = reasonSourceFingerprint(load);
const datasets = {
  open: load("opening-ranges"),
  response: load("preflop-ranges"),
  three_bet: load("three-bet-responses"),
  four_bet: load("four-bet-responses"),
  multiway: load("multiway-responses"),
  squeeze: load("squeeze-responses"),
  cold_three_bet: load("cold-three-bet-responses"),
  iso_response: { spots: load("limp-responses").spots.filter(s => s.id === "SB_vs_BB_iso") },
  limp_response: { spots: load("limp-responses").spots.filter(s => s.id === "BB_vs_SB_limp") },
  limp_reraise: { spots: load("limp-responses").spots.filter(s => s.id === "BB_vs_SB_limp_reraise") },
};
const f1 = value => Number(value).toFixed(1);

// Unreachable rows are fold=100 placeholders; the wording matches the historical saved text.
function unreachableReason(type, spot) {
  if (type === "three_bet") return `${spot.opener}の既存オープン頻度が0%のため、この経路では対象外。形式上フォールド100%としています。`;
  if (type === "four_bet") return `${spot.hero}の対${spot.opener}の既存3bet頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。`;
  if (type === "iso_response") return "SBの既存リンプ頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。";
  if (type === "limp_reraise") return "BBの既存アイソレイズ頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。";
  if (type === "squeeze") return spot.prior_action === null
    ? `${spot.opener}の既存オープン頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。`
    : `${spot.caller}の対${spot.opener}の既存コール頻度が0%のため、この経路では対象外。形式上フォールド100%であり、実際の推奨ではありません。`;
  throw new Error(`unreachable row in ${type}: ${spot.id}`);
}

const ACTIONS = {
  open: [["open", "オープン"], ["limp", "リンプ"], ["fold", "フォールド"]],
  response: [["three_bet", "3bet"], ["call", "コール"], ["fold", "フォールド"]],
  three_bet: [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]],
  four_bet: [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]],
  multiway: [["squeeze", "スクイーズ"], ["call", "コール"], ["fold", "フォールド"]],
  squeeze: [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]],
  cold_three_bet: [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]],
  iso_response: [["raise", "リレイズ"], ["call", "コール"], ["fold", "フォールド"]],
  limp_response: [["raise", "アイソレイズ"], ["check", "チェック"]],
  limp_reraise: [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]],
};
const RAISE_KEY = { open: "open", response: "three_bet", three_bet: "four_bet", four_bet: "all_in", multiway: "squeeze", squeeze: "four_bet", cold_three_bet: "four_bet", iso_response: "raise", limp_response: "raise", limp_reraise: "four_bet" };

const FACT_LABELS = {
  open: [
    { key: "equity_vs_defend_pct", label: "勝率（対BBの守りレンジ）", scope: "hand" },
    { key: "all_fold_pct", label: "後ろ全員が降りる確率", scope: "spot" },
    { key: "blocked_three_bet_pct", label: "後ろの3betレンジのブロック", scope: "hand" },
  ],
  response: [
    { key: "equity_vs_open_pct", label: "勝率（対オープン）", scope: "hand" },
    { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
    { key: "equity_vs_continue_pct", label: "3bet後に続く相手への勝率", scope: "hand" },
    { key: "blocked_open_pct", label: "相手レンジのブロック", scope: "hand" },
  ],
  three_bet: [
    { key: "equity_vs_three_bet_pct", label: "勝率（対3betレンジ）", scope: "hand" },
    { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
    { key: "equity_vs_continue_pct", label: "4bet後に続く相手への勝率", scope: "hand" },
    { key: "three_bettor_fold_to_4bet_pct", label: "4betに相手が降りる率", scope: "spot" },
  ],
  four_bet: [
    { key: "equity_vs_four_bet_pct", label: "勝率（対4betレンジ）", scope: "hand" },
    { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
    { key: "equity_vs_shove_call_pct", label: "オールインにコールする相手への勝率", scope: "hand" },
    { key: "opener_fold_to_shove_pct", label: "オールインに相手が降りる率", scope: "spot" },
  ],
};

const CALL_FACT_LABELS = [
  { key: "realized_equity_pct", label: "実現後の勝率", scope: "hand" },
  { key: "call_ev_bb", label: "コールのEV", scope: "hand", unit: "bb" },
];
FACT_LABELS.multiway = [
  { key: "equity_3way_pct", label: "勝率（3人ポット）", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
];
FACT_LABELS.iso_response = [
  { key: "equity_vs_bb_iso_pct", label: "勝率（対BBアイソ）", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
];
// Facing a squeeze: the primary equity is heads-up versus the squeeze range, or
// three-way when the opener called. Labels are chosen per spot (factLabels).
const SQUEEZE_SPOT_LABELS = [
  { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
  { key: "fold_to_squeeze_pct", label: "スクイーズに2人とも降りる率", scope: "spot" },
  { key: "blocked_squeeze_pct", label: "スクイーズレンジのブロック", scope: "hand" },
];
FACT_LABELS.limp_reraise = [
  { key: "equity_vs_limp_reraise_pct", label: "勝率（対SBのリンプ・リレイズ）", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
  { key: "bb_fold_pct", label: "BBが降りる率（アイソで加重）", scope: "spot" },
  { key: "limp_reraise_break_even_pct", label: "SBのリンプ・リレイズの損益分岐", scope: "spot" },
  { key: "blocked_limp_reraise_pct", label: "リンプ・リレイズレンジのブロック", scope: "hand" },
];
// Cold response to a 3bet: the opener (and any later seats) are still to act.
FACT_LABELS.cold_three_bet = [
  { key: "equity_vs_three_bet_pct", label: "勝率（対3betレンジ）", scope: "hand" },
  { key: "call_break_even_equity_pct", label: "コールに必要な勝率", scope: "spot" },
  { key: "hero_and_opener_fold_pct", label: "3betに自分とオープナーの両方が降りる率", scope: "spot" },
  { key: "blocked_three_bet_pct", label: "3betレンジのブロック", scope: "hand" },
];
FACT_LABELS.limp_response = [{ key: "equity_vs_sb_limp_pct", label: "勝率（対SBリンプ）", scope: "hand" }];
for (const type of ["response", "three_bet", "four_bet", "multiway", "iso_response", "limp_reraise", "cold_three_bet"]) FACT_LABELS[type].splice(1, 0, ...CALL_FACT_LABELS);
function factLabels(type, spot) {
  if (type !== "squeeze") return FACT_LABELS[type];
  const equity = spot.prior_action === "call"
    ? { key: "equity_3way_pct", label: "勝率（3人ポット）", scope: "hand" }
    : { key: "equity_vs_squeeze_pct", label: `勝率（対${spot.squeezer}のスクイーズ）`, scope: "hand" };
  return [equity, ...CALL_FACT_LABELS, ...SQUEEZE_SPOT_LABELS];
}
const evText = value => `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}bb`;
function callDecision(row, facts) {
  const numbers = `仮定のEQRを加味した実現後の勝率${f1(facts.realized_equity_pct)}%で、コールのEVは${evText(facts.call_ev_bb)}。`;
  if (row.call >= row.fold && row.call > 0) {
    return numbers + (facts.call_ev_bb < 0.05 ? "損益分岐付近のため、コールは50%以下に抑えます。" : "このモデルではコールでプラスのEVが見込めるため、コールを中心に継続します。");
  }
  const verdict = row.fold >= 90 ? "フォールドします。" : "フォールドが中心です。";
  if (facts.call_ev_bb < -0.05) return numbers + "コールでは投資を回収できない見積もりのため、" + verdict;
  if (facts.call_ev_bb < 0.05) return numbers + "損益分岐付近のため、" + verdict;
  return numbers + "コール自体はプラスの見積もりですが、既存配分の拡張は行わず、" + verdict;
}

function feature(hand) {
  const [a, b] = [RANKS.indexOf(hand[0]), RANKS.indexOf(hand[1])];
  const suited = hand.endsWith("s");
  const gap = b - a - 1;
  if (hand.length === 2) {
    if (a <= 2) return "最上位クラスのポケットペア";
    if (a <= 4) return "強いポケットペア";
    if (a <= 8) return "オーバーカードが出やすいのが弱点のミドルペア";
    return "主な勝ち筋がフロップのセット（約12%）になるスモールペア";
  }
  if (hand[0] === "A") {
    if (suited && b >= 9) return "Aのブロッカーとホイール（A〜5のストレート）の可能性を持つスーテッドA";
    if (suited && b <= 4) return "Aのブロッカーとナッツフラッシュの可能性を持つ強いスーテッドA";
    if (suited) return "キッカーは中程度だが、ナッツフラッシュを狙えるスーテッドA";
    if (b <= 2) return "Aのブロッカーも持つ上位のオフスートA";
    if (b <= 4) return "Aのブロッカーを持つが、AQ・AKには支配されやすいオフスートA";
    return "キッカーが弱く、Aがヒットしても強いAに負けやすいオフスートA";
  }
  const broadway = a <= 4 && b <= 4;
  if (suited && broadway) return "ストレートとフラッシュの両方を狙えるスーテッドブロードウェイ";
  if (!suited && broadway) return "トップペアは作りやすいがドローは弱い、高いカード同士のオフスート";
  if (suited && gap === 0) return "ストレートとフラッシュを作りやすいスーテッドコネクター";
  if (suited && gap === 1) return "ストレートとフラッシュの可能性がある1つ飛びのスーテッド";
  if (suited && a <= 3) return `キッカーは弱いが、${hand[0]}ハイのフラッシュが狙えるスーテッド`;
  if (suited) return "つながりが弱く伸びしろが限られるスーテッド";
  if (gap <= 1) return "ストレートの可能性はあるがフラッシュは作れない、つながったオフスート";
  return "ストレートもフラッシュも作りにくいオフスート";
}

function mixText(type, row) {
  const parts = ACTIONS[type].filter(([key]) => row[key] > 0).sort((x, y) => row[y[0]] - row[x[0]]);
  return "配分は" + parts.map(([key, name]) => `${name} ${row[key]}%`).join("・");
}

function primary(type, row) {
  return ACTIONS[type].map(([key]) => key).reduce((best, key) => row[key] > row[best] ? key : best);
}


function compose(type, row, facts, spot) {
  const lead = `${feature(row.hand)}です。`;
  const main = primary(type, row);
  const raiseKey = RAISE_KEY[type];
  const raised = row[raiseKey] > 0 && main !== raiseKey && type !== "open";
  if (type === "open") {
    const eq = f1(facts.equity_vs_defend_pct);
    const behind = spot.players_behind === 1 ? "残りはBBだけで" : `後ろに${spot.players_behind}人いますが`;
    if (row.limp > 0) {
      const role = facts.equity_vs_defend_pct >= 60
        ? "強いハンドも1BBのリンプへ一部残し、BBのアイソレイズに対してリンプレンジが弱い手だけにならないようにします。"
        : row.open > 0
          ? "リンプとレイズの両方へ配分し、行動だけでハンドの強さが読まれにくい構成にします。"
          : "参加するときは主に1BBのリンプでポットを抑えます。リンプレンジ全体にはAA・KKなどの強いハンドも含めています。";
      return `${lead}SBはBBより先に行動し、ポストフロップもOOPです。${role}${mixText(type, row)}。`;
    }
    if (row.open >= 90 && facts.equity_vs_defend_pct >= 50) return `${lead}${behind}、全員が降りる確率は${f1(spot.all_fold_pct)}%あり、BBに守られても守りレンジに対して勝率${eq}%と優位です。オープンして利益が出るハンドです。${mixText(type, row)}。`;
    const behindEven = spot.players_behind === 1 ? "残りはBBだけで" : `後ろに${spot.players_behind}人いても`;
    if (row.open >= 90) return `${lead}BBの守りレンジへの勝率は${eq}%と高くはありませんが、${behindEven}、全員が降りる確率は${f1(spot.all_fold_pct)}%あります。降ろせる分とハンドの伸びしろを合わせて、オープンで利益が見込めます。${mixText(type, row)}。`;
    if (row.open > 0) return `${lead}BBの守りレンジへの勝率は${eq}%で、オープンの境界にあたります。${behind}、参加されると不利になりやすいため、オープンとフォールドを混ぜます。${mixText(type, row)}。`;
    return `${lead}BBの守りレンジへの勝率は${eq}%にとどまります。${behind}、誰かが参加してくると不利な戦いになりやすいため、フォールドします。${mixText(type, row)}。`;
  }
  if (type === "limp_response") {
    return `${lead}SBの保護されたリンプレンジへの勝率は${f1(facts.equity_vs_sb_limp_pct)}%です。${row.raise > 0 ? "バリューや限定的なブロッカーのアイソレイズを混ぜます。" : "追加投資なしでフロップへ進めるため、チェックします。"}${mixText(type, row)}。`;
  }
  if (type === "multiway" || type === "iso_response") {
    const raiseName = type === "multiway" ? "スクイーズ" : "リレイズ";
    // SB acts with BB still behind: its realization carries the extra BB-behind discount.
    const behind = spot.bb_behind ? "後ろにBBが残り、スクイーズや4人のポットでコールの価値が下がるため、実現率を追加で割り引いています。" : "";
    const body = main === raiseKey
      ? `実現後の勝率${f1(facts.realized_equity_pct)}%、コールのEVは${evText(facts.call_ev_bb)}です。既存の${raiseName}配分を維持し、強いハンドと一部のブロッカーをレイズへ配分します。`
      : callDecision(row, facts);
    return `${lead}${behind}${body}${row[raiseKey] > 0 && main !== raiseKey ? `一部は${raiseName}へ配分します。` : ""}${mixText(type, row)}。`;
  }
  if (type === "limp_reraise") {
    const size = `4bet（${spot.four_bet_size_bb}BB）`;
    const eq = facts.equity_vs_limp_reraise_pct;
    const rangeName = "SBのリンプ・リレイズレンジ";
    const situation = `SBはリンプしてからアイソレイズにリレイズしているため、強いハンドと一部のブロッカー付きブラフに絞られています。BBはIPで、コールは${spot.cost_to_call_bb}BBを払って${spot.total_pot_after_call_bb}BBのポットに参加します。`;
    let body;
    if (main === "four_bet") {
      body = eq >= 50
        ? `${rangeName}に対して勝率${f1(eq)}%と優位なので、${size}でバリューを取ります。`
        : `${rangeName}に対して勝率${f1(eq)}%と不利ですが、Aのブロッカーで相手の強いハンドを${f1(facts.blocked_limp_reraise_pct)}%減らせるため、少量のブラフの${size}に使います。`;
      if (row.call > 0) body += "一部はコールに回し、コールするレンジにも強いハンドを残します。";
    } else if (main === "call") {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += eq >= 50
        ? `一部は${size}に回し、4betするレンジにも強いハンドを入れます。`
        : `一部は相手の強いハンドを${f1(facts.blocked_limp_reraise_pct)}%ブロックできることを使って、ブラフの${size}に回します。`;
      if (row.fold > 0) body += facts.call_ev_bb >= 0.05 ? "プラスが小さく仮定のEQRに左右されやすいため、一部はフォールドします。" : "一部はフォールドします。";
    } else {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += `ただし一部は${size}に回します。`;
      if (row.call > 0) body += "一部はコールで継続します。";
    }
    return `${lead}${situation}${body}${mixText(type, row)}。`;
  }
  if (type === "squeeze") {
    const size = `4bet（${spot.four_bet_size_bb}BB）`;
    const threeWay = spot.prior_action === "call";
    const eq = threeWay ? facts.equity_3way_pct : facts.equity_vs_squeeze_pct;
    const rangeName = threeWay ? `${spot.squeezer}のスクイーズと${spot.opener}のコールの両方` : `${spot.squeezer}のスクイーズレンジ`;
    const situation = spot.prior_action === null
      ? `後ろに${spot.caller}が残り、コールすると3人のポットになることもあるため、コールの実現率を追加で割り引いています。`
      : threeWay
        ? `${spot.opener}もコールした3人のポットで、${spot.squeezer}と${spot.opener}に挟まれています。`
        : `${spot.opener}が降りたため、その${spot.open_size_bb ?? 2.5}BBがデッドマネーとしてポットに残っています。`;
    let body;
    if (main === "four_bet") {
      body = eq >= (threeWay ? 40 : 50)
        ? `${rangeName}に対して勝率${f1(eq)}%と優位なので、${size}でバリューを取ります。`
        : eq >= (threeWay ? 30 : 40)
          ? `${rangeName}に対して勝率${f1(eq)}%とほぼ互角です。相手の強いハンドを${f1(facts.blocked_squeeze_pct)}%ブロックできるため、${size}を中心にします。`
          : `${rangeName}に対して勝率${f1(eq)}%と不利ですが、ブロッカーで相手の強いハンドを${f1(facts.blocked_squeeze_pct)}%減らせるため、ブラフの${size}に使います。`;
      if (row.call > 0) body += "一部はコールに回し、コールするレンジにも強いハンドを残します。";
    } else if (main === "call") {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += `一部は${size}に回し、4betするレンジが強いハンドだけに偏らないようにします。`;
      if (row.fold > 0) body += "一部はフォールドします。";
    } else {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += facts.blocked_squeeze_pct >= 15
        ? `ただし相手の強いハンドを${f1(facts.blocked_squeeze_pct)}%ブロックできるため、一部はブラフの${size}に回します。`
        : `ただし一部は${size}に回し、4betするレンジが最上位のハンドだけにならないようにします。`;
      if (row.call > 0) body += "一部はコールで継続します。";
    }
    return `${lead}${situation}${body}${mixText(type, row)}。`;
  }
  if (type === "cold_three_bet") {
    const size = `4bet（${spot.four_bet_size_bb}BB）`;
    const eq = facts.equity_vs_three_bet_pct;
    const rangeName = `${spot.three_bettor}の3betレンジ`;
    const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
    const later = seats.slice(seats.indexOf(spot.hero) + 1);
    const behind = `後ろにはオープナーの${spot.opener}${later.length ? `と${later.join("・")}` : ""}が残り、4betや3人のポットになることもあるため、コールの実現率を追加で割り引いています。`;
    const situation = `${spot.opener}のオープンに${spot.three_bettor}が${spot.three_bet_size_bb}BBへ3betしており、まだ参加していない状態で判断します（${spot.three_bettor}に対して${spot.position}）。${behind}`;
    let body;
    if (main === "four_bet") {
      body = eq >= 50
        ? `${rangeName}に対して勝率${f1(eq)}%と優位なので、${size}でバリューを取ります。`
        : eq >= 40
          ? `${rangeName}に対して勝率${f1(eq)}%とほぼ互角です。相手の強いハンドを${f1(facts.blocked_three_bet_pct)}%ブロックできるため、${size}を中心にします。`
          : `${rangeName}に対して勝率${f1(eq)}%と不利ですが、ブロッカーで相手の強いハンドを${f1(facts.blocked_three_bet_pct)}%減らせるため、ブラフの${size}に使います。`;
      if (row.call > 0) body += "一部はコールに回し、コールするレンジにも強いハンドを残します。";
    } else if (main === "call") {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += `一部は${size}に回し、4betするレンジが強いハンドだけに偏らないようにします。`;
      if (row.fold > 0) body += "一部はフォールドします。";
    } else {
      body = callDecision(row, facts);
      if (row.four_bet > 0) body += facts.blocked_three_bet_pct >= 15
        ? `ただし相手の強いハンドを${f1(facts.blocked_three_bet_pct)}%ブロックできるため、一部はブラフの${size}に回します。`
        : `ただし一部は${size}に回し、4betするレンジが最上位のハンドだけにならないようにします。`;
      if (row.call > 0) body += "一部はコールで継続します。";
    }
    return `${lead}${situation}${body}${mixText(type, row)}。`;
  }
  const eqKey = { response: "equity_vs_open_pct", three_bet: "equity_vs_three_bet_pct", four_bet: "equity_vs_four_bet_pct" }[type];
  const rangeName = { response: `${spot.opener}のオープンレンジ`, three_bet: `${spot.three_bettor}の3betレンジ`, four_bet: `${spot.opener}の4betレンジ` }[type];
  const eq = facts[eqKey];
  let body;
  if (main === raiseKey) {
    if (type === "four_bet") {
      const called = facts.equity_vs_shove_call_pct;
      body = called !== null && called >= spot.shove_called_break_even_pct
        ? `${rangeName}への勝率は${f1(eq)}%。オールインしてコールされたときに必要な勝率${f1(spot.shove_called_break_even_pct)}%に対し、コールしてくる相手にも勝率${f1(called)}%を保てるので、オールインでバリューを取ります。`
        : eq >= 50
          ? `${rangeName}には勝率${f1(eq)}%と優位ですが、コールしてくる相手には${f1(called)}%と不利です。それでも相手はオールインに${f1(spot.opener_fold_to_shove_pct)}%降りるので、降ろせる分を合わせてオールインが得になります。`
          : `${rangeName}への勝率は${f1(eq)}%。コールされると不利ですが、相手はオールインに${f1(spot.opener_fold_to_shove_pct)}%降りるうえ、ブロッカーで相手の強いハンドを${f1(facts.blocked_four_bet_pct)}%減らせるため、ブラフのオールインに使います。`;
    } else {
      const cont = facts.equity_vs_continue_pct;
      const raiseName = type === "response" ? `3bet（${spot.three_bet_size_bb}BB）` : `4bet（${spot.four_bet_size_bb}BB）`;
      const foldRate = type === "response" ? spot.opener_fold_to_3bet_pct : spot.three_bettor_fold_to_4bet_pct;
      const blocked = type === "response" ? facts.blocked_open_pct : facts.blocked_three_bet_pct;
      body = cont !== null && cont >= 50
        ? `${rangeName}への勝率は${f1(eq)}%。${raiseName}に続けてくる相手にも勝率${f1(cont)}%を保てるので、${raiseName}でバリューを取ります。`
        : eq >= 50
          ? `${rangeName}には勝率${f1(eq)}%と優位で、続けてくる相手にも${f1(cont)}%とほぼ互角です。相手が${raiseName}に${f1(foldRate)}%降りる分を合わせると、コールより${raiseName}のほうが得になります。`
          : `${rangeName}への勝率は${f1(eq)}%で、続けてくる相手には${f1(cont)}%と不利です。それでも相手は${raiseName}に${f1(foldRate)}%降り、ブロッカーで相手レンジを${f1(blocked)}%減らせるため、ブラフの${raiseName}に使います。`;
    }
    if (row.call > 0) body += "一部はコールに回し、コールするレンジにも強いハンドを残します。";
  } else if (main === "call") {
    body = callDecision(row, facts);
    if (raised) body += `一部は${{ response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type]}に回し、${{ response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type]}するレンジが強いハンドだけに偏らないようにします。`;
    if (row.fold > 0) body += "既存の混合配分を維持し、一部はフォールドします。";
  } else {
    body = callDecision(row, facts);
    if (row[raiseKey] > 0) {
      const raiseName = { response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type];
      const foldRate = { response: spot.opener_fold_to_3bet_pct, three_bet: spot.three_bettor_fold_to_4bet_pct, four_bet: spot.opener_fold_to_shove_pct }[type];
      body += `ただし相手は${raiseName}に${f1(foldRate)}%降りるので、一部はブラフの${raiseName}に回します。`;
    }
    if (row.call > 0) body += "一部はコールで継続します。";
  }
  return `${lead}${body}${mixText(type, row)}。`;
}

const factDir = process.env.REASON_FACTS_DIR ? pathToFileURL(resolve(process.env.REASON_FACTS_DIR) + "/") : new URL("../.local/reason-facts/", import.meta.url);
const wanted = new Set(process.argv.slice(2));
let written = 0;
for (const [type, dataset] of Object.entries(datasets)) {
  for (const spot of dataset.spots) {
    if (wanted.size && !wanted.has(spot.id)) continue;
    const factPath = new URL(`${spot.id}.json`, factDir);
    if (!existsSync(factPath)) throw new Error(`Missing facts: ${spot.id}`);
    const facts = JSON.parse(readFileSync(factPath));
    if (facts.source_fingerprint !== sourceFingerprint || facts.spot_id !== spot.id) throw new Error(`Stale facts: ${spot.id}; rerun reason-facts.mjs`);
    const byHand = new Map(facts.hands.map(item => [item.hand, item]));
    const hands = {};
    for (const row of spot.hands) {
      const handFacts = byHand.get(row.hand);
      const unreachable = Object.entries(handFacts).every(([key, value]) => key === "hand" || value === null);
      const { hand, ...values } = handFacts;
      hands[row.hand] = unreachable
        ? { reason: unreachableReason(type, spot), facts: values }
        : { reason: compose(type, row, handFacts, facts.spot), facts: values };
    }
    writeFileSync(new URL(`${spot.id}.json`, reasonDir), JSON.stringify({
      spot_id: spot.id, type, source_fingerprint: sourceFingerprint,
      method: "ハンドごとの勝率（モンテカルロ・シード固定）・ブロッカー・価格・相手の降りる率を計算し、その数値とハンドの特徴からAIが設計した文型で理由を記述。数値は計算結果から自動で差し込み。",
      equity_note: "素の勝率はショウダウンまでの推定。実現後の勝率=勝率×仮定EQR（1を超える場合もあります）。EQRはソルバー実装後に置換予定。コールEVは将来の追加投資や相手の戦略変化を厳密にはモデル化していません。",
      fact_labels: factLabels(type, spot), spot_facts: facts.spot, hands,
    }, null, 2) + "\n");
    written += 1;
  }
}
console.log(`${written} spot reason files written`);
