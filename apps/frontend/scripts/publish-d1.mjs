// Publish the delivery copy of ReysonAI data to the evionai D1 database (schema:
// apps/backend/migrations): every preflop dataset under src/estimated (the JSON files stay
// the source of truth) and the canonical local postflop artifacts. Generates SQL; runs
// wrangler only with --execute local|remote.
//   node scripts/publish-d1.mjs [--only preflop|postflop|flop-base] [--out file] [--execute local|remote]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSql as buildPostflopSql, publishableSpots, quote } from "./postflop-ai/publish-d1.mjs";
import { publishableFlopBases, flopBaseSqlLines } from "./postflop-ai/flop-base-d1.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const ESTIMATED_DIR = join(root, "src/estimated");
// Characters per stored part: at most 3 UTF-8 bytes each keeps a statement under D1's 100 KB.
export const PART_CHARS = 30_000;

// Dataset name → compact JSON text, for every *.json under src/estimated (e.g. "reasons/BB_vs_BTN").
export function preflopDatasets(dir = ESTIMATED_DIR) {
  const found = {};
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".json")) found[relative(dir, path).replace(/\.json$/, "")] = JSON.stringify(JSON.parse(readFileSync(path, "utf8")));
    }
  };
  walk(dir);
  return found;
}

export function buildPreflopSql(datasets) {
  const lines = ["-- Preflop datasets: delivery copy of apps/frontend/src/estimated/**/*.json.",
    "DELETE FROM preflop_dataset_parts;", "DELETE FROM preflop_datasets;"];
  for (const [name, text] of Object.entries(datasets)) {
    const parts = [];
    for (let index = 0; index < text.length; index += PART_CHARS) parts.push(text.slice(index, index + PART_CHARS));
    const hash = createHash("sha256").update(text).digest("hex");
    lines.push(`INSERT INTO preflop_datasets (name, content_hash, bytes, parts) VALUES (${quote(name)}, ${quote(hash)}, ${Buffer.byteLength(text)}, ${parts.length});`);
    parts.forEach((body, part) => lines.push(`INSERT INTO preflop_dataset_parts (name, part, body) VALUES (${quote(name)}, ${part}, ${quote(body)});`));
  }
  return `${lines.join("\n")}\n`;
}

function main(argv) {
  const arg = name => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const only = arg("--only");
  if (only && !["preflop", "postflop", "flop-base"].includes(only)) throw new Error("--only must be preflop, postflop or flop-base");
  const execute = arg("--execute");
  if (execute && !["local", "remote"].includes(execute)) throw new Error("--execute must be local or remote");
  const out = resolve(arg("--out") ?? join(root, ".local/reysonai-d1.sql"));
  let sql = "";
  if (!only || only === "preflop") {
    const datasets = preflopDatasets();
    sql += buildPreflopSql(datasets);
    console.log(`${Object.keys(datasets).length} preflop datasets`);
  }
  if (!only || only === "postflop") {
    const spots = publishableSpots();
    sql += buildPostflopSql(spots);
    console.log(`${spots.length} postflop spots`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  if (!only || only === "flop-base") {
    // Stream, avoiding V8's maximum string size and a large in-memory SQL copy.
    const descriptor = openSync(out, "a");
    try { for (const line of flopBaseSqlLines(publishableFlopBases())) writeFileSync(descriptor, line); }
    finally { closeSync(descriptor); }
  }
  console.log(`→ ${out}`);
  if (execute) {
    execFileSync("npx", ["wrangler", "d1", "execute", "evionai", `--${execute}`, "--yes", "--file", out],
      { cwd: join(root, "../backend"), stdio: "inherit" });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
