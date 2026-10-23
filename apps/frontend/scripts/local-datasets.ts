// Dev/preview stand-in for the worker's preflop dataset routes: serves src/estimated/**/*.json
// at /v1/preflop/datasets[/<name>] with the same bodies, read fresh on every request.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isCompleteAiv2Manifest } from "../src/estimated/aiv2-contract.ts";

const dir = fileURLToPath(new URL("../src/estimated", import.meta.url));
const localAiv2Sample = join(fileURLToPath(new URL("..", import.meta.url)), "data/aiv2-preflop/samples/opening-ranges/UTG_open.json");
// Keep ordinary names unchanged; allow only the Stage A villain namespace.
const NAME = /^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta)|aiv2\/(?:[A-Za-z0-9_-]+|reasons\/[A-Za-z0-9_-]+|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta)))$/;

function names(current: any = dir) : any {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry: any) : any => entry.isDirectory()
    ? names(join(current, entry.name))
    : entry.name.endsWith(".json") ? [relative(dir, join(current, entry.name)).slice(0, -5)] : ([] as any[]));
}

function aiv2Ready() {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "aiv2/manifest.json"), "utf8"));
    return isCompleteAiv2Manifest(manifest);
  } catch { return false; }
}

export function localDatasetsMiddleware(req?: any, res?: any, next?: any) : any {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/v1/preflop/datasets" && !url.pathname.startsWith("/v1/preflop/datasets/")) { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/v1/preflop/datasets") {
    const available = names().filter((name: string) => !name.startsWith("aiv2/") || aiv2Ready());
    res.end(JSON.stringify({ kind: "ai_estimate_not_gto", datasets: Object.fromEntries(available.map((name: any) : any => [name, {}])) })); return;
  }
  let name: any;
  try { name = decodeURIComponent(url.pathname.slice("/v1/preflop/datasets/".length)); }
  catch { res.writeHead(400).end(JSON.stringify({ error: "invalid dataset name" })); return; }
  if (!NAME.test(name)) { res.writeHead(400).end(JSON.stringify({ error: "invalid dataset name" })); return; }
  if (name.startsWith("aiv2/") && !aiv2Ready()) { res.writeHead(404).end(JSON.stringify({ error: "AIv2 dataset is not complete" })); return; }
  try { res.end(JSON.stringify(JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")))); }
  catch { res.writeHead(404).end(JSON.stringify({ error: `dataset not found: ${name}` })); }
}

// Deliberately registered only on Vite's development server (never preview or
// the worker). Read only the fixed, Git-managed UTG sample so the preview is
// reproducible on a fresh checkout and cannot silently consume ignored state.
export function localAiv2SampleMiddleware(req?: any, res?: any, next?: any) : any {
  const url = new URL(req.url, "http://localhost");
  const prefix = "/v1/preflop/local/aiv2-sample";
  if (url.pathname !== `${prefix}/status` && url.pathname !== `${prefix}/opening-ranges` && url.pathname !== `${prefix}/reasons/UTG_open`) {
    next(); return;
  }
  if (req.method !== "GET") { res.writeHead(405).end(JSON.stringify({ error: "method not allowed" })); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const sample = JSON.parse(readFileSync(localAiv2Sample, "utf8"));
    const rawHands = sample?.spot?.hands;
    // The LLM contract stores frequencies only; adapt the canonical RFI total
    // size to the app's existing opening-row schema without changing mixes.
    const hands = Array.isArray(rawHands) ? rawHands.map((row: any) => ({ ...row, open_size_bb: row.open > 0 ? 2.5 : null })) : rawHands;
    const comboWeights = sample?.spot?.combo_mixes;
    const reasons = sample?.reasons?.reasons;
    const valid = sample?.metadata?.method === "llm-range-wide-combo-v3" && sample?.metadata?.scenario_id === "UTG_open" &&
      sample?.spot?.id === "UTG_open" && sample?.spot?.open_size_bb === 2.5 && sample?.spot?.effective_stack_bb === 100 && Array.isArray(hands) && hands.length === 169 &&
      Array.isArray(comboWeights) && comboWeights.length === 1326 && sample?.metadata?.concrete_combo_count === 1326 &&
      sample?.metadata?.reason_generated_after_finalization === true && typeof sample?.metadata?.final_hash === "string" &&
      sample?.combo_reach_weights?.compression === "exact-suit-symmetry-verified-per-player" &&
      sample?.combo_reach_weights?.players && typeof sample.combo_reach_weights.players === "object" && Array.isArray(reasons) && reasons.length === 169 &&
      hands.every((row: any) => typeof row.hand === "string" && Number.isFinite(row.open) && Number.isFinite(row.fold) && row.open + row.fold === 100) &&
      new Set(hands.map((row: any) => row.hand)).size === 169 && new Set(comboWeights.map((row: any) => row.combo)).size === 1326 &&
      comboWeights.every((row: any) => typeof row.combo === "string" && typeof row.hand === "string" && Number.isFinite(row.reach_weight) && row.reach_weight >= 0 &&
        Object.values(row.mix ?? {}).every((frequency: any) => Number.isFinite(frequency) && frequency >= 0 && frequency <= 100) &&
        Object.values(row.mix ?? {}).reduce((total: number, frequency: any) => total + frequency, 0) === 100);
    if (!valid) { res.writeHead(404).end(JSON.stringify({ available: false })); return; }
    if (url.pathname === `${prefix}/status`) {
      res.end(JSON.stringify({ available: true, scenario: "UTG_open", method: sample.metadata.method })); return;
    }
    if (url.pathname === `${prefix}/opening-ranges`) {
      const opening = JSON.parse(readFileSync(join(dir, "opening-ranges.json"), "utf8"));
      const spots = opening.spots.map((spot: any) => spot.id === "UTG_open" ? { ...spot, hands, combo_mixes: sample.spot.combo_mixes } : spot);
      res.end(JSON.stringify({ ...opening, metadata: { ...opening.metadata, aiv2_local_sample: { scenario: "UTG_open", method: sample.metadata.method, model: sample.metadata.model, concrete_combo_count: comboWeights.length, combo_reach_weights: sample.combo_reach_weights, analysis_hash: sample.metadata.analysis_hash } }, spots })); return;
    }
    res.end(JSON.stringify({ spot_id: "UTG_open", type: "open", method: `${sample.metadata.method} · ${sample.metadata.model}`, hands: Object.fromEntries(reasons.map((row: any) => [row.hand, { reason: row.text, reason_ja: row.text_ja }])) }));
  } catch {
    res.writeHead(404).end(JSON.stringify({ available: false }));
  }
}
