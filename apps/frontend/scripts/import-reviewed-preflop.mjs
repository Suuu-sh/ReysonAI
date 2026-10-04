// Production-only Actions entry point. Never run for PRs or local verification.
// Uses already-reviewed bytes; no authoring, postflop publishing or schema sweep.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { preparePreflopDelivery, assertDeliveryBundle, assertPublishedMetadata, REPOSITORY } from "./lib/reviewed-preflop.mjs";
import { METADATA_SQL, verifyPublishedPreflop, missingPreflopSchema } from "./lib/preflop-delivery.mjs";

if (process.argv.length !== 3 || process.argv[2] !== "--remote") throw new Error("Explicit --remote is required; use verify-preflop-local-d1.mjs for local checks");
if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/main" ||
    !["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME)) throw new Error("Remote import is restricted to the main deployment workflow");
const directory = resolve(".local/reviewed-preflop");
const expected = preparePreflopDelivery();
const sql = readFileSync(join(directory, "preflop.sql"), "utf8");
const manifest = JSON.parse(readFileSync(join(directory, "delivery.json"), "utf8"));
assertDeliveryBundle(sql, manifest, expected);
const outcome = state => writeFileSync(join(directory, "import-outcome.json"), JSON.stringify({ state,
  sql_sha256: manifest.sql.sha256, reviewed_content_sha256: manifest.reviewed_content_sha256,
  github_sha: process.env.GITHUB_SHA, at: new Date().toISOString() }, null, 2) + "\n");
outcome("verifying-existing-data");
const base = ["--yes", "wrangler@4.147.0"];
const backend = join(REPOSITORY, "apps/backend");
const run = (args, options = {}) => execFileSync("npx", [...base, ...args], { cwd: backend,
  encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, ...options });
const query = command => {
  let output;
  try { output = run(["d1", "execute", "reysonai", "--remote", "--config", "wrangler.jsonc", "--json", "--command", command]); }
  catch (error) {
    // Wrangler's diagnostic contains no credential value. Preserve it so only
    // a genuine missing preflop table may take the first-publication path.
    throw new Error(`${error.message}\n${error.stderr ?? ""}\n${error.stdout ?? ""}`);
  }
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !result[0].success || !Array.isArray(result[0].results)) throw new Error("Invalid D1 query response");
  return result[0].results;
};
let current, needsImport = true;
try { current = query(METADATA_SQL); }
catch (error) { if (!missingPreflopSchema(error)) throw error; }
if (current) {
  try { assertPublishedMetadata(current, manifest); needsImport = false; }
  catch { /* A different complete snapshot is an ordinary approved update. */ }
}
if (needsImport) {
  // Informational recovery reference only. Never automatically rewind this
  // shared database: that would also rewind account/session writes.
  const bookmark = run(["d1", "time-travel", "info", "reysonai", "--config", "wrangler.jsonc", "--json"]);
  writeFileSync(join(directory, "before-import-bookmark.json"), bookmark);
  console.log("Importing one reviewed preflop snapshot; D1 is briefly unavailable during its atomic import.");
  // Re-read immediately before the mutating command; no generic SQL argument.
  assertDeliveryBundle(readFileSync(join(directory, "preflop.sql"), "utf8"), manifest, expected);
  outcome("import-started-outcome-unconfirmed");
  run(["d1", "execute", "reysonai", "--remote", "--yes", "--config", "wrangler.jsonc", "--file", join(directory, "preflop.sql")], { stdio: "inherit" });
} else console.log("Reviewed dataset metadata is already current; verifying full payloads without reimport.");
const verified = await verifyPublishedPreflop(query, manifest);
outcome(needsImport ? "imported-and-full-payload-verified" : "already-current-full-payload-verified");
console.log(JSON.stringify({ status: "published-reviewed-preflop-verified", imported: needsImport, ...verified, sql_sha256: manifest.sql.sha256 }));
