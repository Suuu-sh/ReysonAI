// Preflop datasets read from the reysonai D1 database (AI estimates, not GTO). Each dataset is
// the published copy of one JSON file under apps/frontend/src/estimated, e.g. "opening-ranges"
// or "reasons/BB_vs_BTN"; its parts are concatenated as text, never parsed here.
import { listPublishedDatasets, readPublishedDataset } from './application/published-datasets.ts';
import { D1PublishedDatasetReader, type PublishedDatasetD1Database } from './infrastructure/d1-published-dataset-repository.ts';
import type { D1Database } from "./postflop.ts";

type Result = { status: number; body?: unknown; text?: string; etag?: string };

export async function routePreflopDatasets(db: D1Database | undefined, path: string): Promise<Result> {
  if (!db) throw new Error("DB binding is not configured");
  const reader = new D1PublishedDatasetReader(db as PublishedDatasetD1Database);
  if (path === "/v1/preflop/datasets") {
    return { status: 200, body: await listPublishedDatasets(reader) };
  }
  let name;
  try { name = decodeURIComponent(path.slice("/v1/preflop/datasets/".length)); }
  catch { return { status: 400, body: { error: "invalid dataset name" } }; }
  const result = await readPublishedDataset(reader, name);
  if (result.kind === 'not_found') return { status: 404, body: { error: `dataset not found: ${result.name}` } };
  if (result.kind === 'incomplete') return { status: 503, body: { error: `dataset is incomplete: ${result.name}` } };
  if (result.kind === 'invalid_name') return { status: 400, body: { error: "invalid dataset name" } };
  return { status: 200, text: result.text, etag: result.etag };
}
