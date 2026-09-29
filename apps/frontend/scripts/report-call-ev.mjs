// Review artifact, reproducible from published inputs (no .local facts needed).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { auditEstimates } from "../src/estimated/audit.ts";
import { callContexts, callFacts } from "../src/estimated/call-ev.ts";
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const data = { opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"), multiway: load("multiway-responses"), squeezes: load("squeeze-responses"), limp: load("limp-responses"), coldThreeBets: load("cold-three-bet-responses") };
const report = load("call-ev-report"), table = load("call-equities");
const entries = Object.entries(report.spots);
const audit = auditEstimates(data);
const f = n => n.toFixed(2);
const sign = n => `${n < 0 ? "−" : "+"}${f(Math.abs(n))}`;
const lines = ["# EQR / Call EV review — 2026-09-24", "",
  "## 前提と読み方", "",
  "- EQR はユーザー指定の仮定値。ソルバー実装後に置換する。勝率は相手の保存レンジに対する固定シード12,000回のモンテカルロ。EV も仮定モデルであり、均衡解ではない。",
  "- EV = equity × EQR × raked(total pot after call) − incremental call cost。レーキ5%、上限3BB。",
  "- 削除数は EV < −0.05bb で call を0へ変更したハンドクラス数。コンボ%は削除した到達頻度加重コールコンボ ÷ 当該局面の到達コンボ ×100（割合の減少pt）。3bet応答はRFI頻度、4bet応答は元3bet頻度、SB-vs-isoはlimp頻度、スクイーズへの応答はオープナーならRFI頻度・コーラーならコール頻度で加重する。3betへのコールド応答は全ハンドが到達するため加重なし。",
  "- 境界EVの50%制限、強さ順／ポジション整合の削減、既存の過剰フォールド監査を満たすための最小限のプラスEVコール追加は別項目。既存の3bet・4bet・5bet・squeeze・iso／limp-reraise頻度とRFI配分は変更していない。",
  "- 新しい監査 `ev-capacity-conflict` は、許されるコールを全て使っても旧auto-profit基準に達しないことを証明した場合だけの警告。未使用の合法コールがある場合は従来通りerror。均衡未達の解決ではなく、指定条件の両立不能を可視化したもの。",
  "", "## 局面ごとの負EVコール削除", "", "| 局面 | ハンド数 | 削除コンボ | コンボ% | 境界制限数 |", "|---|---:|---:|---:|---:|",
];
for (const [id, item] of entries) lines.push(`| ${id} | ${item.removed_hand_count} | ${f(item.removed_combos)} | ${f(item.removed_combo_pct)} | ${item.boundary.length} |`);
lines.push("", "## 種類別集計", "", "コンボ%は各種類の到達コンボを合算した分母で加重。実戦での各経路の発生率ではない。", "", "| 種類 | 削除数 | 削除コンボ% |", "|---|---:|---:|");
for (const type of [...new Set(entries.map(([, item]) => item.type))]) {
  const items = entries.filter(([, item]) => item.type === type).map(([, item]) => item);
  lines.push(`| ${type} | ${items.reduce((n, i) => n + i.removed_hand_count, 0)} | ${f(items.reduce((n, i) => n + i.removed_combos, 0) / items.reduce((n, i) => n + i.incoming_combos, 0) * 100)} |`);
}
const bb = data.responses.spots.find(s => s.id === "BB_vs_SB");
const context = callContexts(data).find(c => c.spot === bb);
const baseline = JSON.parse(readFileSync(new URL("./data/response-mixes.json", import.meta.url))).spots.BB_vs_SB;
lines.push("", "## BB_vs_SB：SB 3.5BB openへの応答", "", `継続率：${f(report.spots.BB_vs_SB.before_continuation_pct)}% → ${f(report.spots.BB_vs_SB.after_continuation_pct)}%。コール必要勝率は2.5 / 6.65 = 37.59%。BBはSBに対してIP。`, "",
  "| ハンド | コール前→後 | 3bet（不変） | 素の勝率 | EQR | 実現後勝率 | Call EV |", "|---|---:|---:|---:|---:|---:|---:|");
for (const hand of ["J4o", "72o", "Q6s", "A5s", "KQs", "99"]) {
  const row = bb.hands.find(r => r.hand === hand), before = baseline.find(r => r[0] === hand);
  const eq = table.spots.BB_vs_SB.equities[hand], facts = callFacts(context, hand, eq);
  lines.push(`| ${hand} | ${before[1]} → ${row.call}% | ${row.three_bet}% | ${f(eq * 100)}% | ${facts.eqr} | ${f(facts.realized_equity_pct)}% | ${sign(facts.call_ev_bb)}bb |`);
}
lines.push("", "## EV ≥ +0.3bb なのにコール0：全件", "", "到達不能行は除外。レイズ100%の手も依頼通り含む。コールEVのみではレイズとの優劣は判定できず、全件が修正対象とは限らない。括弧内はCall EV / Fold率。", "");
for (const [id, item] of entries) {
  lines.push(`- **${id}**: ${item.positive_uncalled.map(r => `${r.hand} (${sign(r.call_ev_bb)}bb / F${r.fold}%)`).join(", ") || "なし"}`);
}
lines.push("", "## 整合性の追加調整", "", "同一行の複数ステップは初期→最終にまとめて表示。", "");
for (const [id, item] of entries) {
  const merged = new Map();
  for (const r of item.consistency_adjustments) {
    const prev = merged.get(r.hand);
    merged.set(r.hand, { ...r, before: prev?.before ?? r.before });
  }
  if (merged.size) lines.push(`- **${id}**: ${[...merged.values()].map(r => `${r.hand} call ${r.before}→${r.after}% (${sign(r.call_ev_bb)}bb; ${r.reason})`).join(", ")}`);
}
lines.push("", "## 監査", "");
for (const finding of audit.findings) lines.push(`- [${finding.severity}] ${finding.check} / ${finding.spot}: ${finding.detail}`);
lines.push("", "## 変更ファイル群", "",
  "- モデル／監査: `src/estimated/eqr.ts`, `call-ev.js`, `call-equities.json`, `call-ev-report.json`, `audit.js`。",
  "- 生成: `scripts/eqr.py`, `call_policy.py`, `apply-call-ev.mjs`, `data/response-mixes.json`, `lib/call-consistency.mjs`, 対象5生成スクリプト, `build-estimates.mjs`, `audit-estimates.mjs`。",
  "- 理由: `reason-facts.mjs`, `compose-reasons.mjs`, `lib/reason-context.mjs`, 全58局面の `src/estimated/reasons/*.json`。旧手書きBB_vs_BTNテンプレートと旧render.pyは削除。",
  "- データ: `preflop-ranges.json`, `three-bet-responses.json`, `four-bet-responses.json`, `multiway-responses.json`, `squeeze-responses.json`, `limp-responses.json`, `cold-three-bet-responses.json`。",
  "- テスト／説明: `tests/call-ev.test.mjs`, `tests/detailed-reasons.test.mjs`, `tests/multiway-responses.test.mjs`, `src/estimated/AGENTS.md`, 本レポートと生成スクリプト。",
  "- 指定UIファイルは変更しない。git commitなし。",
);
mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/eqr-call-ev-review.md", import.meta.url), lines.join("\n") + "\n");
console.log("docs/eqr-call-ev-review.md");
