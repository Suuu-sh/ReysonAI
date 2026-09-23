// Composes detailed per-hand reasons from computed facts (.local/reason-facts) and saved frequencies.
// Usage: node scripts/compose-reasons.mjs [spot_id ...]   (no ids = every spot with facts)
// Spots listed in HANDWRITTEN keep their hand-authored reasons (scripts/reasons/*.py).
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const HANDWRITTEN = new Set(["BB_vs_BTN"]);
const RANKS = "AKQJT98765432";
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = {
  open: load("opening-ranges"),
  response: load("preflop-ranges"),
  three_bet: load("three-bet-responses"),
  four_bet: load("four-bet-responses"),
};
const f1 = value => Number(value).toFixed(1);

const ACTIONS = {
  open: [["open", "オープン"], ["fold", "フォールド"]],
  response: [["three_bet", "3bet"], ["call", "コール"], ["fold", "フォールド"]],
  three_bet: [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]],
  four_bet: [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]],
};
const RAISE_KEY = { open: "open", response: "three_bet", three_bet: "four_bet", four_bet: "all_in" };

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

function positionNote(position, behind, hero) {
  if (hero === "BB") return "BBはフロップ以降ずっと先に行動する（OOP）ため、勝率を回収しにくくなります";
  if (behind > 0) return `後ろにまだ${behind}人残っており、コールするとスクイーズされる危険もあります`;
  return position === "OOP" ? "フロップ以降は先に行動する（OOP）ため、勝率を回収しにくくなります" : "フロップ以降は後から行動できる（IP）ので、勝率を回収しやすい立場です";
}

function compose(type, row, facts, spot) {
  const lead = `${feature(row.hand)}です。`;
  const main = primary(type, row);
  const raiseKey = RAISE_KEY[type];
  const raised = row[raiseKey] > 0 && main !== raiseKey && type !== "open";
  if (type === "open") {
    const eq = f1(facts.equity_vs_defend_pct);
    const behind = spot.players_behind === 1 ? "残りはBBだけで" : `後ろに${spot.players_behind}人いますが`;
    if (row.open >= 90 && facts.equity_vs_defend_pct >= 50) return `${lead}${behind}、全員が降りる確率は${f1(spot.all_fold_pct)}%あり、BBに守られても守りレンジに対して勝率${eq}%と優位です。オープンして利益が出るハンドです。${mixText(type, row)}。`;
    const behindEven = spot.players_behind === 1 ? "残りはBBだけで" : `後ろに${spot.players_behind}人いても`;
    if (row.open >= 90) return `${lead}BBの守りレンジへの勝率は${eq}%と高くはありませんが、${behindEven}、全員が降りる確率は${f1(spot.all_fold_pct)}%あります。降ろせる分とハンドの伸びしろを合わせて、オープンで利益が見込めます。${mixText(type, row)}。`;
    if (row.open > 0) return `${lead}BBの守りレンジへの勝率は${eq}%で、オープンの境界にあたります。${behind}、参加されると不利になりやすいため、オープンとフォールドを混ぜます。${mixText(type, row)}。`;
    return `${lead}BBの守りレンジへの勝率は${eq}%にとどまります。${behind}、誰かが参加してくると不利な戦いになりやすいため、フォールドします。${mixText(type, row)}。`;
  }
  const eqKey = { response: "equity_vs_open_pct", three_bet: "equity_vs_three_bet_pct", four_bet: "equity_vs_four_bet_pct" }[type];
  const rangeName = { response: `${spot.opener}のオープンレンジ`, three_bet: `${spot.three_bettor}の3betレンジ`, four_bet: `${spot.opener}の4betレンジ` }[type];
  const eq = facts[eqKey];
  const need = spot.call_break_even_equity_pct;
  const note = positionNote(spot.position, spot.players_behind ?? 0, spot.hero ?? null);
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
    const easy = spot.position === "IP" && !(spot.players_behind > 0);
    body = easy
      ? `コールに必要な勝率${f1(need)}%に対し、${rangeName}への勝率は${f1(eq)}%です。${note}ので、コールが中心になります。`.replace("立場ですので", "立場なので")
      : `コールに必要な勝率${f1(need)}%に対し、${rangeName}への勝率は${f1(eq)}%です。${note}が、それを差し引いてもコールが中心になります。`;
    if (raised) body += `一部は${{ response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type]}に回し、${{ response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type]}するレンジが強いハンドだけに偏らないようにします。`;
    if (row.fold > 0) body += "境界に近いため、一部はフォールドします。";
  } else {
    const verdict = row.fold >= 90 ? "フォールドします" : "フォールドが中心です";
    body = eq >= need
      ? `${rangeName}への勝率は${f1(eq)}%で、数字上は必要勝率${f1(need)}%を上回ります。しかし${note}。実際に回収できる勝率はそれより低いと見て、${verdict}。`
      : `${rangeName}への勝率は${f1(eq)}%で、必要勝率${f1(need)}%に届きません。${verdict}。`;
    if (row[raiseKey] > 0) {
      const raiseName = { response: "3bet", three_bet: "4bet", four_bet: "オールイン" }[type];
      const foldRate = { response: spot.opener_fold_to_3bet_pct, three_bet: spot.three_bettor_fold_to_4bet_pct, four_bet: spot.opener_fold_to_shove_pct }[type];
      body += `ただし相手は${raiseName}に${f1(foldRate)}%降りるので、一部はブラフの${raiseName}に回します。`;
    }
    if (row.call > 0) body += "一部はコールで継続します。";
  }
  return `${lead}${body}${mixText(type, row)}。`;
}

const factDir = new URL("../.local/reason-facts/", import.meta.url);
const wanted = new Set(process.argv.slice(2));
let written = 0;
for (const [type, dataset] of Object.entries(datasets)) {
  for (const spot of dataset.spots) {
    if (HANDWRITTEN.has(spot.id) || (wanted.size && !wanted.has(spot.id))) continue;
    const factPath = new URL(`${spot.id}.json`, factDir);
    if (!existsSync(factPath)) continue;
    const facts = JSON.parse(readFileSync(factPath));
    const byHand = new Map(facts.hands.map(item => [item.hand, item]));
    const hands = {};
    for (const row of spot.hands) {
      const handFacts = byHand.get(row.hand);
      const unreachable = Object.entries(handFacts).every(([key, value]) => key === "hand" || value === null);
      const { hand, ...values } = handFacts;
      hands[row.hand] = unreachable
        ? { reason: row.reason, facts: values }
        : { reason: compose(type, row, handFacts, facts.spot), facts: values };
    }
    writeFileSync(new URL(`../src/estimated/reasons/${spot.id}.json`, import.meta.url), JSON.stringify({
      spot_id: spot.id, type,
      method: "ハンドごとの勝率（モンテカルロ・シード固定）・ブロッカー・価格・相手の降りる率を計算し、その数値とハンドの特徴からAIが設計した文型で理由を記述。数値は計算結果から自動で差し込み。",
      equity_note: "勝率はショウダウンまでの値で、オールイン以外では実際に回収できる勝率はこれより低くなります。",
      fact_labels: FACT_LABELS[type], spot_facts: facts.spot, hands,
    }, null, 2) + "\n");
    written += 1;
  }
}
console.log(`${written} spot reason files written`);
