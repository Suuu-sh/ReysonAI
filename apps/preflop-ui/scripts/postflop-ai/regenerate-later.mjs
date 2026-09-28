// node scripts/postflop-ai/regenerate-later.mjs <spotId>... — replaces a spot's shared
// (copied) turn/river rules with a spot-specific local Codex candidate, keeping whichever
// simulates better. The copied rules and their report are kept as *.generic.json; nothing
// is deleted. AI estimate, not GTO.
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { artifactPaths, config, loadInputs } from "./inputs.mjs";
import { generateLater, loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { simulate } from "./simulation.mjs";

const score = report => {
  const values = report.results.map(row => row.delta_bb.mean);
  return values.reduce((a, b) => a + b, 0) / values.length;
};
for (const spotId of process.argv.slice(2)) {
  const inputs = loadInputs(spotId), paths = artifactPaths(inputs.spot), flop = loadCandidate(inputs);
  const generic = { policy: paths.laterCandidate.replace(/\.json$/, ".generic.json"), report: paths.report.replace(/\.json$/, ".generic.json") };
  if (!existsSync(generic.policy)) {
    renameSync(paths.laterCandidate, generic.policy);
    copyFileSync(paths.report, generic.report);
  }
  const genericScore = score(JSON.parse(readFileSync(generic.report, "utf8")));
  const { candidate } = await generateLater(inputs, flop);
  const report = simulate(inputs, flop.policy, config.samples_per_board_profile_seat, candidate);
  const ownScore = score(report);
  if (ownScore >= genericScore) {
    writeFileSync(paths.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${spotId}: adopted spot-specific rules (${ownScore.toFixed(3)} vs copied ${genericScore.toFixed(3)} bb)`);
  } else {
    renameSync(paths.laterCandidate, paths.laterCandidate.replace(/\.json$/, `.${candidate.metadata.model}.json`));
    copyFileSync(generic.policy, paths.laterCandidate);
    copyFileSync(generic.report, paths.report);
    console.log(`${spotId}: kept copied rules (${genericScore.toFixed(3)} vs spot-specific ${ownScore.toFixed(3)} bb)`);
  }
}
