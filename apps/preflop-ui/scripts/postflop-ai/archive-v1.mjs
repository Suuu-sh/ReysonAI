// One-off, idempotent: archives the config-v1 (33/75 flop) local artifacts before the
// 33/75/125 flop tree (config v2). Renames `{slug}-{policy|report|hand-ev}.json` to
// `….v1-33-75.json`; never deletes and never overwrites an existing archive.
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { root } from "./inputs.mjs";

const dir = join(root, ".local/postflop-ai");
let moved = 0, kept = 0;
for (const name of existsSync(dir) ? readdirSync(dir) : []) {
  if (!/^[a-z0-9-]+-(policy|report|hand-ev)\.json$/.test(name)) continue;
  const target = join(dir, name.replace(/\.json$/, ".v1-33-75.json"));
  if (existsSync(target)) { kept++; continue; }
  renameSync(join(dir, name), target);
  moved++;
}
console.log(`Archived ${moved} v1 artifacts (${kept} already archived) in ${dir}`);
