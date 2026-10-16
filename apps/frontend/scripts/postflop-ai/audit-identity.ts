// Exact local execution identity. No policy generation or approval lives here.
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, lstatSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AUDIT_REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));
const FRONTEND = "apps/frontend/";
const ROOTS = ["scripts/postflop-ai/cli.ts", "scripts/postflop-ai/board-worker.ts"].map((path: any) : any => FRONTEND + path);
const INPUTS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "limp-responses", "limp-deep-responses",
  "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses", "continuation-responses"]
  .map((name: any) : any => `${FRONTEND}src/estimated/${name}.json`).sort();
export const identityHash = (value: any) : any => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const safePath = (path: any) : any => /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith("/") && path.split("/").every((p: any) : any => p && p !== "." && p !== "..");

export function auditFileRecord(root?: any, path?: any) : any {
  if (!safePath(path)) throw new Error(`Invalid audit source path: ${path}`);
  let current = resolve(root);
  if (lstatSync(current).isSymbolicLink()) throw new Error("Audit root must be a real directory");
  for (const part of path.split("/")) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Audit source is a symlink: ${path}`);
  }
  const before = lstatSync(current);
  if (!before.isFile() || before.size > 256 * 1024 * 1024) throw new Error(`Invalid audit source file: ${path}`);
  const hash = createHash("sha256"), fd = openSync(current, "r"), buffer = Buffer.alloc(64 * 1024);
  let bytes = 0;
  try {
    for (let count: any; (count = readSync(fd, buffer, 0, buffer.length, null)) > 0;) { hash.update(buffer.subarray(0, count)); bytes += count; }
  } finally { closeSync(fd); }
  const after = lstatSync(current);
  if (bytes !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error(`Audit source changed while hashing: ${path}`);
  return { path, bytes, sha256: hash.digest("hex") };
}

export function captureSourceGraph({ root = AUDIT_REPOSITORY, roots }: any = {}) : any {
  root = resolve(root);
  if (!Array.isArray(roots) || !roots.length || roots.some((path: any) : any => !safePath(path)) || new Set(roots).size !== roots.length) throw new Error('Explicit unique safe source graph roots are required');
  const found = new Map();
  function visit(path?: any) : any {
    if (found.has(path)) return;
    found.set(path, auditFileRecord(root, path));
    if (!/\.(?:mjs|cjs|js|ts|tsx)$/.test(path)) return;
    const body = readFileSync(resolve(root, path), "utf8");
    // Static imports/re-exports and literal dynamic imports. The non-literal
    // worker entry point is an explicit root above, not silently skipped.
    const imports = /(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of body.matchAll(imports)) {
      const name = match[1] ?? match[2];
      if (name.startsWith(".")) visit(relative(root, resolve(root, dirname(path), name)).replaceAll("\\", "/"));
    }
  }
  [...roots].sort().forEach(visit);
  return [...found.values()].sort((a?: any,b?: any) : any => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function captureAuditIdentity({ root = AUDIT_REPOSITORY }: any = {}) : any {
  root = resolve(root);
  const records = captureSourceGraph({ root, roots: ROOTS });
  return { schema_version: 1, roots: [...ROOTS].sort(),
    sources: records.filter((item: any) : any => !INPUTS.includes(item.path)),
    inputs: INPUTS.map((path: any) : any => auditFileRecord(root, path)) };
}
