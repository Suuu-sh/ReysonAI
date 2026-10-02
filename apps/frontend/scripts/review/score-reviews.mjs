// Scores reviewer outputs against the persisted ranges and answer keys (see README.md).
// Usage: node scripts/review/score-reviews.mjs   → .local/review/report.md
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { comboCount } from "../lib/equity.mjs";

const root = new URL("../../", import.meta.url);
const resultsDir = new URL(".local/review/results/", root);
const keyDir = new URL(".local/review/answer-key/", root);
const DIVERGENT = 25; // percentage points of total variation distance that count as a real disagreement

const read = url => JSON.parse(readFileSync(url));
const distance = (a, b, actions) => actions.reduce((acc, action) => acc + Math.abs((a[action] ?? 0) - (b[action] ?? 0)), 0) / 2;
const direction = (from, to, actions) => actions.map(action => Math.sign((to[action] ?? 0) - (from[action] ?? 0))).join("");

const models = existsSync(resultsDir) ? readdirSync(resultsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
const lines = ["# 別モデルレビューの集計", ""];
if (!models.length) {
  lines.push("レビュー結果がまだありません。`.local/review/results/<model>/<spot>.{blind,critique}.json` に保存してください。");
} else {
  const proposals = new Map(); // `${spot}:${hand}` → [{model, direction, mix, severity}]
  lines.push("| モデル | 局面 | blind 一致度 | 大きな食い違い | カナリア検出 | 指摘数 |", "|---|---|---|---|---|---|");
  for (const model of models) {
    let canariesFound = 0, canariesTotal = 0;
    for (const file of readdirSync(keyDir)) {
      const key = read(new URL(file, keyDir));
      const spot = key.spot_id;
      const blindUrl = new URL(`${model}/${spot}.blind.json`, resultsDir);
      const critiqueUrl = new URL(`${model}/${spot}.critique.json`, resultsDir);
      let agreement = "—", divergent = [];
      if (existsSync(blindUrl)) {
        const blind = read(blindUrl);
        let weighted = 0, weights = 0;
        for (const { hand, mix } of blind.hands) {
          const d = distance(mix, key.current[hand], key.actions);
          weighted += d * comboCount(hand); weights += comboCount(hand);
          if (d >= DIVERGENT) divergent.push(`${hand}(${d.toFixed(0)}pt)`);
        }
        agreement = `${(100 - weighted / weights).toFixed(1)}%`;
      }
      let issues = 0;
      if (existsSync(critiqueUrl)) {
        const critique = read(critiqueUrl);
        issues = critique.issues.length;
        for (const canary of key.canaries) {
          canariesTotal += 1;
          if (critique.issues.some(issue => issue.hand === canary.hand && issue.severity !== "info")) canariesFound += 1;
        }
        for (const issue of critique.issues) {
          if (!issue.hand || !issue.proposed_mix || key.canaries.some(c => c.hand === issue.hand)) continue;
          const id = `${spot}:${issue.hand}`;
          const current = key.current[issue.hand];
          proposals.set(id, [...(proposals.get(id) ?? []), { model, direction: direction(current, issue.proposed_mix, key.actions), mix: issue.proposed_mix, severity: issue.severity, rationale: issue.rationale }]);
        }
      }
      if (agreement !== "—" || issues) lines.push(`| ${model} | ${spot} | ${agreement} | ${divergent.join(" ") || "—"} | — | ${issues} |`);
    }
    lines.push(`| ${model} | **合計** | | | ${canariesFound}/${canariesTotal} | |`);
  }
  const consensus = [...proposals].filter(([, list]) => new Set(list.map(p => p.model)).size >= 2 && new Set(list.map(p => p.direction)).size === 1);
  const solo = [...proposals].filter(([id]) => !consensus.some(([cid]) => cid === id));
  lines.push("", "## 合意した修正候補（2モデル以上・同じ方向）", "修正後に `npm run build:estimates` の検証を通ることを確認してから反映する。", "");
  for (const [id, list] of consensus) lines.push(`- ${id}: ${list.map(p => `${p.model} → ${JSON.stringify(p.mix)}`).join(" / ")}`);
  if (!consensus.length) lines.push("- なし");
  lines.push("", "## 保留（1モデルのみ、または方向が割れた指摘）", "");
  for (const [id, list] of solo) lines.push(`- ${id}: ${list.map(p => `${p.model}[${p.severity}] ${p.rationale}`).join(" / ")}`);
  if (!solo.length) lines.push("- なし");
}
writeFileSync(new URL(".local/review/report.md", root), lines.join("\n") + "\n");
console.log(lines.slice(0, 12).join("\n"));
