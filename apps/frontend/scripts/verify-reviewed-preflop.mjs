// Verify committed reviewed data and create/verify only its delivery serialization.
// There is intentionally no generate/update-review/fallback mode in CI.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { preparePreflopDelivery, assertDeliveryBundle, assertPublishedMetadata } from "./lib/reviewed-preflop.mjs";
const argv = process.argv.slice(2);
const arg = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const started = performance.now();
const expected = preparePreflopDelivery();
const out = resolve(arg("--out") ?? ".local/reviewed-preflop");
if (argv.includes("--check-bundle")) {
  assertDeliveryBundle(readFileSync(join(out, "preflop.sql"), "utf8"), JSON.parse(readFileSync(join(out, "delivery.json"), "utf8")), expected);
} else {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "preflop.sql"), expected.sql);
  writeFileSync(join(out, "delivery.json"), JSON.stringify(expected.manifest, null, 2) + "\n");
}
if (arg("--database-result")) {
  const result = JSON.parse(readFileSync(arg("--database-result"), "utf8"));
  if (!Array.isArray(result) || result.length !== 1 || !result[0].success || !Array.isArray(result[0].results)) throw new Error("Invalid D1 verification result");
  assertPublishedMetadata(result[0].results, expected.manifest);
}
console.log(JSON.stringify({ status: "reviewed-bytes-verified", datasets: expected.manifest.datasets.length,
  counts: expected.manifest.counts, sql: expected.manifest.sql, elapsed_ms: Math.round(performance.now() - started),
  max_rss_kib: process.resourceUsage().maxRSS, generated_strategies: false }));
