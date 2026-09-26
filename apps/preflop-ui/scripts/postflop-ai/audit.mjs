import { boards, config, seatRange } from "./inputs.mjs";
import { NODES, policyMix, referencePolicy, validatePolicy } from "./policy.mjs";
import { PROFILES, SIMULATION_VERSION, simulate } from "./simulation.mjs";
import { sha } from "./generate.mjs";

export function auditExperiment(inputs, candidate, report) {
  const { spot } = inputs;
  const policy = validatePolicy(candidate?.policy);
  if (candidate.metadata?.kind !== "ai_estimate_not_gto" ||
      candidate.metadata.source_hash !== inputs.fingerprint || candidate.metadata.config_version !== config.version ||
      candidate.metadata.policy_hash !== sha(policy) ||
      report.source_hash !== inputs.fingerprint || report.policy_hash !== sha(policy) ||
      report.kind !== "ai_estimate_not_gto" || report.version !== 1 ||
      report.simulation_version !== SIMULATION_VERSION || report.spot !== spot.id ||
      (candidate.metadata.spot ?? spot.id) !== spot.id ||
      report.samples_per_board_profile_seat !== config.samples_per_board_profile_seat || report.seed !== config.seed) {
    throw new Error("Candidate or simulation report is stale/incomplete");
  }
  let checked = 0;
  for (const board of boards()) {
    const seats = { [spot.ip]: seatRange(inputs, spot.ip, board.cards), [spot.oop]: seatRange(inputs, spot.oop, board.cards) };
    for (const [node, actions] of Object.entries(NODES)) {
      const seat = node.startsWith("btn") ? spot.ip : spot.oop; // btn_* = IP, bb_* = OOP
      for (const { combo } of seats[seat]) {
        const mix = policyMix(policy, node, combo, board.cards);
        if (actions.reduce((sum, action) => sum + mix[action], 0) !== 100 ||
            actions.some(action => !Number.isInteger(mix[action]) || mix[action] < 0)) throw new Error("Expanded policy is illegal");
        checked++;
      }
    }
  }
  const splitByBoard = new Map(boards().map(board => [board.id, board.split]));
  const expected = new Set(boards().flatMap(board => PROFILES.flatMap(profile => [spot.ip, spot.oop].map(hero =>
    `${board.id}|${profile}|${hero}`))));
  if (!Array.isArray(report.results) || report.results.length !== expected.size) throw new Error("Simulation results are incomplete");
  const warnings = [];
  for (const row of report.results) {
    const key = `${row.board}|${row.opponent}|${row.hero}`;
    if (!expected.delete(key) || row.split !== splitByBoard.get(row.board)) throw new Error(`Unexpected/duplicate simulation result: ${key}`);
    for (const metric of [row.candidate_ev_bb, row.baseline_ev_bb, row.delta_bb]) {
      if (!Number.isFinite(metric?.mean) || !Array.isArray(metric.ci95) || metric.ci95.length !== 2 ||
          metric.ci95.some(value => !Number.isFinite(value)) || metric.ci95[0] > metric.mean || metric.ci95[1] < metric.mean) {
        throw new Error(`Invalid simulation metric: ${key}`);
      }
    }
    if (row.delta_bb.ci95[1] < 0) warnings.push(`${key}: candidate below reference (${row.delta_bb.mean}bb)`);
  }
  const replay = simulate(inputs, policy);
  if (JSON.stringify(replay) !== JSON.stringify(report)) throw new Error("Saved simulation report differs from fixed-seed replay");
  const sanity = simulate(inputs, referencePolicy, 12);
  if (sanity.results.some(row => row.delta_bb.mean !== 0)) throw new Error("Reference-vs-reference simulation drifted");
  return { checkedCombos: checked, resultCount: report.results.length, warnings };
}
