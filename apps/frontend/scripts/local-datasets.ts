// Dev/preview stand-in for the worker's preflop dataset routes: serves src/estimated/**/*.json
// at /v1/preflop/datasets[/<name>] with the same bodies, read fresh on every request.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../src/estimated", import.meta.url));
// Keep ordinary names unchanged; allow only the Stage A villain namespace.
const NAME = /^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta)|aiv2\/(?:[A-Za-z0-9_-]+|reasons\/[A-Za-z0-9_-]+|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta)))$/;

function names(current: any = dir) : any {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry: any) : any => entry.isDirectory()
    ? names(join(current, entry.name))
    : entry.name.endsWith(".json") ? [relative(dir, join(current, entry.name)).slice(0, -5)] : ([] as any[]));
}

export function localDatasetsMiddleware(req?: any, res?: any, next?: any) : any {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/v1/preflop/datasets" && !url.pathname.startsWith("/v1/preflop/datasets/")) { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/v1/preflop/datasets") {
    res.end(JSON.stringify({ kind: "ai_estimate_not_gto", datasets: Object.fromEntries(names().map((name: any) : any => [name, {}])) })); return;
  }
  let name: any;
  try { name = decodeURIComponent(url.pathname.slice("/v1/preflop/datasets/".length)); }
  catch { res.writeHead(400).end(JSON.stringify({ error: "invalid dataset name" })); return; }
  if (!NAME.test(name)) { res.writeHead(400).end(JSON.stringify({ error: "invalid dataset name" })); return; }
  try { res.end(JSON.stringify(JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")))); }
  catch { res.writeHead(404).end(JSON.stringify({ error: `dataset not found: ${name}` })); }
}
