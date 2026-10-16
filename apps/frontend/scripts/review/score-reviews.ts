// Scores reviewer outputs against the persisted ranges and answer keys (see README.md).
// Usage: node scripts/review/score-reviews.ts   → .local/review/report.md
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { comboCount } from "../lib/equity.ts";

const root = new URL("../../", import.meta.url);
const resultsDir = new URL(".local/review/results/", root);
const keyDir = new URL(".local/review/answer-key/", root);
const DIVERGENT = 25; // percentage points of total variation distance that count as a real disagreement

const read: any = (url: any) : any => JSON.parse((readFileSync(url) as any));
const distance = (a?: any, b?: any, actions?: any) : any => actions.reduce((acc?: any, action?: any) : any => acc + Math.abs((a[action] ?? 0) - (b[action] ?? 0)), 0) / 2;
const direction = (from?: any, to?: any, actions?: any) : any => actions.map((action: any) : any => Math.sign((to[action] ?? 0) - (from[action] ?? 0))).join("");

const models = existsSync(resultsDir) ? readdirSync(resultsDir, { withFileTypes: true }).filter((d: any) : any => d.isDirectory()).map((d: any) : any => d.name) : ([] as any[]);
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
      let agreement = "—", divergent: any[] = [];
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
          if (critique.issues.some((issue: any) : any => issue.hand === canary.hand && issue.severity !== "info")) canariesFound += 1;
        }
        for (const issue of critique.issues) {
          if (!issue.hand || !issue.proposed_mix || key.canaries.some((c: any) : any => c.hand === issue.hand)) continue;
          const id = `${spot}:${issue.hand}`;
          const current = key.current[issue.hand];
          proposals.set(id, [...(proposals.get(id) ?? ([] as any[])), { model, direction: direction(current, issue.proposed_mix, key.actions), mix: issue.proposed_mix, severity: issue.severity, rationale: issue.rationale }]);
        }
      }
      if (agreement !== "—" || issues) lines.push(`| ${model} | ${spot} | ${agreement} | ${divergent.join(" ") || "—"} | — | ${issues} |`);
    }
    lines.push(`| ${model} | **合計** | | | ${canariesFound}/${canariesTotal} | |`);
  }
  const consensus = [...proposals].filter(([, list]: any) : any => new Set(list.map((p: any) : any => p.model)).size >= 2 && new Set(list.map((p: any) : any => p.direction)).size === 1);
  const solo = [...proposals].filter(([id]: any) : any => !consensus.some(([cid]: any) : any => cid === id));
  lines.push("", "## 合意した修正候補（2モデル以上・同じ方向）", "修正後に `npm run build:estimates` の検証を通ることを確認してから反映する。", "");
  for (const [id, list] of consensus) lines.push(`- ${id}: ${list.map((p: any) : any => `${p.model} → ${JSON.stringify(p.mix)}`).join(" / ")}`);
  if (!consensus.length) lines.push("- なし");
  lines.push("", "## 保留（1モデルのみ、または方向が割れた指摘）", "");
  for (const [id, list] of solo) lines.push(`- ${id}: ${list.map((p: any) : any => `${p.model}[${p.severity}] ${p.rationale}`).join(" / ")}`);
  if (!solo.length) lines.push("- なし");
}
writeFileSync(new URL(".local/review/report.md", root), lines.join("\n") + "\n");
console.log(lines.slice(0, 12).join("\n"));
