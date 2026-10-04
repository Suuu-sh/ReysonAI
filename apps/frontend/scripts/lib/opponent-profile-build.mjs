import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { OPPONENT_PROFILES, OPPONENT_PROFILE_DATASETS, opponentProfileDatasetName } from "../../src/estimated/opponent-profiles.ts";
export const opponentProfileFiles = OPPONENT_PROFILES.flatMap(p => OPPONENT_PROFILE_DATASETS.map(n => opponentProfileDatasetName(p,n)));
export const opponentProfileMetaFiles = OPPONENT_PROFILES.map(p => opponentProfileDatasetName(p,"meta"));
export function loadOpponentProfileBundles(dir) {
  const read = name => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
  return Object.fromEntries(OPPONENT_PROFILES.map(p => [p, Object.fromEntries([...OPPONENT_PROFILE_DATASETS, "meta"]
    .map(n => [n, read(opponentProfileDatasetName(p,n))]))]));
}
export function profileSourceFindings(profiles, dir) {
  return OPPONENT_PROFILES.flatMap(p => OPPONENT_PROFILE_DATASETS.flatMap(n => {
    const hash = createHash("sha256").update(readFileSync(join(dir, `${n}.json`))).digest("hex");
    return profiles[p]?.meta?.balanced_source_sha256?.[n] === hash ? [] : [{ check: "profile-source", severity: "error", spot: `${p}/${n}`, detail: "Profile schema/geometry source fingerprint is stale." }];
  }));
}
