// Read-only comparison; usage: node scripts/check-five-bet-copy-only.mjs <base SHA>
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = process.argv[2];
assert.ok(base && /^[a-f0-9]{40}$/.test(base), "Pass the full baseline commit SHA");
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 512 * 1024 * 1024 });
const target = "apps/frontend/src/estimated/five-bet-responses.json";
const before = JSON.parse(git("show", `${base}:${target}`));
const after = JSON.parse(readFileSync(new URL(`../../../${target}`, import.meta.url)));
const stripped = data => {
  const copy = structuredClone(data);
  for (const spot of copy.spots) for (const row of spot.hands) delete row.reason;
  return copy;
};
assert.deepEqual(stripped(after), stripped(before), "Every non-reason field must remain identical");
let changed = 0, marginChanges = 0, equityCopyChanges = 0;
const spots = new Set();
for (let s = 0; s < before.spots.length; s++) for (let h = 0; h < before.spots[s].hands.length; h++) {
  const oldRow = before.spots[s].hands[h], newRow = after.spots[s].hands[h];
  if (oldRow.reason === newRow.reason) continue;
  const gap = /([\d.]+)(pt(?:上回ります|届きません))/;
  if (oldRow.reason.match(gap)?.[0] !== newRow.reason.match(gap)?.[0]) marginChanges++;
  const equityCopy = /勝率は([\d.]+)%で/;
  if (oldRow.reason.match(equityCopy)?.[0] !== newRow.reason.match(equityCopy)?.[0]) {
    assert.ok(["CO_vs_BB_five_bet/ATs", "BTN_vs_SB_five_bet/A4s"].includes(`${before.spots[s].id}/${oldRow.hand}`));
    assert.equal(Number(newRow.reason.match(equityCopy)[1]), newRow.equity_vs_shove_pct);
    equityCopyChanges++;
  }
  const normalize = text => text.replace(gap, "<gap>$2").replace(equityCopy, "勝率は<equity>%で");
  assert.equal(normalize(oldRow.reason), normalize(newRow.reason));
  changed++; spots.add(before.spots[s].id);
}
assert.equal(changed, 83);
assert.equal(marginChanges, 81);
assert.equal(equityCopyChanges, 2);
assert.equal(spots.size, 11);
const files = git("ls-tree", "-r", "--name-only", base).toString().trim().split("\n");
let unchanged = 0;
for (const file of files.filter(file => file.startsWith("apps/frontend/src/estimated/") && file !== target)) {
  assert.ok(git("show", `${base}:${file}`).equals(readFileSync(new URL(`../../../${file}`, import.meta.url))), `${file} changed`);
  unchanged++;
}
console.log(JSON.stringify({ base, rows: after.entry_count, changedReasons: changed, changedSpots: spots.size, marginChanges, equityCopyChanges,
  unchangedEstimatedFiles: unchanged, nonReasonSha256: createHash("sha256").update(JSON.stringify(stripped(after))).digest("hex") }, null, 2));
