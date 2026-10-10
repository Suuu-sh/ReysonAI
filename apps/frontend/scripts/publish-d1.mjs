// Publish the delivery copy of ReysonAI data to the reysonai D1 database (schema:
// apps/backend/migrations): every preflop dataset under src/estimated (the JSON files stay
// the source of truth) and the canonical local postflop artifacts. Generates SQL; runs
// wrangler only with --execute local|remote.
//   node scripts/publish-d1.mjs [--only preflop|postflop|flop-base] [--require-all] [--out file] [--execute local|remote]
// CI publishes postflop on main with --only postflop --require-all --execute remote.
import { assertContinuationPublication } from "./lib/continuation-publication.mjs";
import { execFileSync } from "node:child_process";
import { closeSync, openSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSql as buildPostflopSql, publishableProfiles, publishableSpots } from "./postflop-ai/publish-d1.mjs";
import { publishableFlopBases, flopBaseSqlLines } from "./postflop-ai/flop-base-d1.mjs";
import { ESTIMATED_DIR, preflopDatasetEntries, preflopSqlChunks } from "./lib/preflop-sql.mjs";
export { ESTIMATED_DIR, PART_CHARS, preflopDatasets, buildPreflopSql, preflopDatasetEntries, preflopSqlChunks } from "./lib/preflop-sql.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

async function main(argv) {
  const arg = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const only = arg("--only");
  if (only && !["preflop", "postflop", "flop-base"].includes(only)) throw new Error("--only must be preflop, postflop or flop-base");
  const execute = arg("--execute");
  if (execute && !["local", "remote"].includes(execute)) throw new Error("--execute must be local or remote");
  const out = resolve(arg("--out") ?? join(root, ".local/reysonai-d1.sql"));
  let preflop = false;
  if (!only || only === "preflop") {
    const stage2 = assertContinuationPublication(ESTIMATED_DIR, { allowLegacyOnly: argv.includes("--allow-legacy-only") });
    const { assertStage3Publication } = await import("./lib/stage3-publication.mjs");
    const stage3 = assertStage3Publication(ESTIMATED_DIR, { allowLegacyOnly: argv.includes("--allow-legacy-only") });
    if (stage2.status === "legacy-only") console.warn("Explicit legacy-only snapshot: executing this SQL removes any previously published Stage 2 datasets.");
    if (stage3.status === "legacy-only") console.warn("Explicit legacy-only snapshot: executing this SQL removes any previously published Stage 3 datasets.");
    preflop = true;
  }
  mkdirSync(dirname(out), { recursive: true });
  const descriptor = openSync(out, "w");
  try {
    if (preflop) {
      let count = 0;
      for (const chunk of preflopSqlChunks(preflopDatasetEntries(), () => count++)) writeFileSync(descriptor, chunk);
      console.log(`${count} preflop datasets`);
    }
    if (!only || only === "postflop") {
      const spots = publishableSpots(console.log, { requireAll: argv.includes("--require-all") });
      const profiles = publishableProfiles(console.log, { requireAll: argv.includes("--require-all") });
      writeFileSync(descriptor, buildPostflopSql(spots, undefined, undefined, profiles));
      console.log(`${spots.length} postflop spots; ${profiles.length * 4} profile policy rows`);
    }
  } finally { closeSync(descriptor); }
  if (!only || only === "flop-base") {
    // Stream, avoiding V8's maximum string size and a large in-memory SQL copy.
    const descriptor = openSync(out, "a");
    try { for (const line of flopBaseSqlLines(publishableFlopBases())) writeFileSync(descriptor, line); }
    finally { closeSync(descriptor); }
  }
  console.log(`→ ${out}`);
  if (execute) {
    execFileSync("npx", ["--yes", "wrangler@4.147.0", "d1", "execute", "reysonai", `--${execute}`, "--yes", "--file", out],
      { cwd: join(root, "../backend"), stdio: "inherit" });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
