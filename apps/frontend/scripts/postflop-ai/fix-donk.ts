// node scripts/postflop-ai/fix-donk.ts <spotId>... | --all — limit turn/river donk bets.
// When the out-of-position player called the opponent's bet on the previous street (line "defender"),
// betting first is a donk bet: it should be rare, with the caller mostly checking to the aggressor.
// Generated later policies often authored "defender" overrides only for weak tiers, so strong hands
// fell back to the line-free rule and led 50-65% of the time. For every tier of turn/river
// *_oop_first, this writes a line="defender" rule (and scales existing defender/texture rules) whose
// bets are DONK_SCALE of the fallback, the rest moving to check. The original is kept as
// *.pre-donk.json. Re-run simulate and audit afterwards. AI estimate, not GTO.
import { constants, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { artifactPaths, loadInputs } from "./inputs.ts";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.ts";
import { validateLaterPolicy } from "./later-policy.ts";
import { POSTFLOP_SPOTS } from "./spots.ts";

export const DONK_SCALE = 0.3;
const json = (value: any) : any => `${JSON.stringify(value, null, 2)}\n`;
const MAX_OVERRIDES = 20;

// Bets scaled by `scale` (whole percentages, largest remainder), the removed share added to check.
function scaledMix(mix?: any, scale?: any) : any {
  const bets = Object.keys(mix).filter((action: any) : any => action !== "check");
  const raw = Object.fromEntries(bets.map((action: any) : any => [action, mix[action] * scale]));
  const out = Object.fromEntries(bets.map((action: any) : any => [action, Math.floor(raw[action])]));
  const target = Math.round(bets.reduce((sum?: any, action?: any) : any => sum + raw[action], 0));
  const order = [...bets].sort((a?: any, b?: any) : any => raw[b] % 1 - raw[a] % 1);
  for (let i = 0; bets.reduce((sum?: any, action?: any) : any => sum + out[action], 0) < target; i++) out[order[i % order.length]]++;
  return { check: 100 - bets.reduce((sum?: any, action?: any) : any => sum + out[action], 0), ...out };
}

export function limitDonks(policy?: any, scale: any = DONK_SCALE) : any {
  const result = structuredClone(policy);
  for (const street of ["turn", "river"]) {
    const node = `${street}_oop_first`, rules = result.streets[street].rules;
    const tiers = [...new Set(rules.filter((rule: any) : any => rule.node === node).map((rule: any) : any => rule.tier))];
    for (const rule of rules) if (rule.node === node && rule.line === "defender") rule.mix = scaledMix(rule.mix, scale);
    for (const tier of tiers) {
      if (rules.some((rule: any) : any => rule.node === node && rule.tier === tier && rule.line === "defender" && rule.texture === "any")) continue;
      const fallback = rules.find((rule: any) : any => rule.node === node && rule.tier === tier && rule.line === "any" && rule.texture === "any");
      rules.push({ node, line: "defender", texture: "any", tier, mix: scaledMix(fallback.mix, scale) });
    }
    // Keep within the per-node override limit: drop the least specific texture-only overrides first.
    let overrides = rules.filter((rule: any) : any => rule.node === node && (rule.line !== "any" || rule.texture !== "any"));
    while (overrides.length > MAX_OVERRIDES) {
      const drop = overrides.find((rule: any) : any => rule.line === "any") ?? overrides.find((rule: any) : any => rule.line !== "defender");
      rules.splice(rules.indexOf(drop), 1);
      overrides = rules.filter((rule: any) : any => rule.node === node && (rule.line !== "any" || rule.texture !== "any"));
    }
  }
  return validateLaterPolicy(result);
}

export function fixSpot(spotId?: any) : any {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot);
  const flop = loadCandidate(inputs), later = loadLaterCandidate(inputs, flop);
  if (later.metadata.donk_fix) return `${spotId}: already limited`;
  const policy = limitDonks(later.policy);
  const backup = paths.laterCandidate.replace(/\.json$/, ".pre-donk.json");
  if (!existsSync(backup)) copyFileSync(paths.laterCandidate, backup, constants.COPYFILE_EXCL);
  writeFileSync(paths.laterCandidate, json({ ...later, metadata: { ...later.metadata, policy_hash: sha(policy), donk_fix: { scale: DONK_SCALE } }, policy }));
  return `${spotId}: donk bets limited (scale ${DONK_SCALE})`;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const args = process.argv.slice(2);
  const spotIds = args[0] === "--all" ? POSTFLOP_SPOTS.filter((spot: any) : any => spot.reachable).map((spot: any) : any => spot.id) : args;
  if (!spotIds.length) { console.error("Usage: node scripts/postflop-ai/fix-donk.ts <spotId>... | --all"); process.exitCode = 1; }
  else for (const spotId of spotIds) console.log(fixSpot(spotId));
}
