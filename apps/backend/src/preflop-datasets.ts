// Preflop datasets read from the reysonai D1 database (AI estimates, not GTO). Each dataset is
// the published copy of one JSON file under apps/frontend/src/estimated, e.g. "opening-ranges"
// or "reasons/BB_vs_BTN"; its parts are concatenated as text, never parsed here.
import type { D1Database } from "./postflop.ts";

type Result = { status: number; body?: unknown; text?: string; etag?: string };
// Keep ordinary names unchanged; allow only the Stage A villain namespace.
const NAME = /^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta))$/;

export async function routePreflopDatasets(db: D1Database | undefined, path: string): Promise<Result> {
  if (!db) throw new Error("DB binding is not configured");
  if (path === "/v1/preflop/datasets") {
    const { results } = await db.prepare("SELECT name, content_hash, bytes FROM preflop_datasets ORDER BY name").all<{ name: string; content_hash: string; bytes: number }>();
    return { status: 200, body: { kind: "ai_estimate_not_gto",
      datasets: Object.fromEntries(results.map(row => [row.name, { hash: row.content_hash, bytes: row.bytes }])) } };
  }
  let name;
  try { name = decodeURIComponent(path.slice("/v1/preflop/datasets/".length)); }
  catch { return { status: 400, body: { error: "invalid dataset name" } }; }
  if (!NAME.test(name)) return { status: 400, body: { error: "invalid dataset name" } };
  const [meta, parts] = await Promise.all([
    db.prepare("SELECT content_hash, parts FROM preflop_datasets WHERE name = ?").bind(name).all<{ content_hash: string; parts: number }>(),
    db.prepare("SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part").bind(name).all<{ part: number; body: string }>(),
  ]);
  const row = meta.results[0];
  if (!row) return { status: 404, body: { error: `dataset not found: ${name}` } };
  if (parts.results.length !== row.parts || parts.results.some((part, index) => part.part !== index)) {
    return { status: 503, body: { error: `dataset is incomplete: ${name}` } };
  }
  return { status: 200, text: parts.results.map(part => part.body).join(""), etag: `"${row.content_hash}"` };
}
