import { boards, config, laterSizingHash, seatRange } from "./inputs.ts";
import { DEFENCE_VERSION } from "./defence.ts";
import { NODES, nodeRole, policyMix, referencePolicyFor, treeNodes, validatePolicy } from "./policy.ts";
import { PROFILES, SIMULATION_VERSION, simulate } from "./simulation.ts";
import { sha } from "./generate.ts";
import { validateLaterPolicy } from "./later-policy.ts";
import { checkFlopBalance, checkLaterBalance } from "./balance.ts";

export function auditExperiment(inputs?: any, candidate?: any, report?: any, laterCandidate: any = null, { replay: providedReplay }: any = {}) : any {
  // Validation-only v7 boundary: reject the separate v10 experiment before
  // policy expansion, balance checks or simulation. Numerical audit is unchanged.
  if (DEFENCE_VERSION !== 7 || report?.defence_version !== DEFENCE_VERSION ||
      (report != null && Object.hasOwn(report, "action_model_version"))) {
    throw new Error("Candidate or simulation report has an incompatible execution contract");
  }
  const { spot } = inputs;
  const policy = validatePolicy(candidate?.policy, spot.tree);
  const laterPolicy = laterCandidate ? validateLaterPolicy(laterCandidate.policy ?? laterCandidate) : null;
  if (candidate.metadata?.kind !== "ai_estimate_not_gto" ||
      candidate.metadata.source_hash !== inputs.fingerprint || candidate.metadata.config_version !== config.version ||
      candidate.metadata.policy_hash !== sha(policy) ||
      report.source_hash !== inputs.fingerprint || report.policy_hash !== sha(policy) ||
      (report.later_policy_hash ?? null) !== (laterPolicy ? sha(laterPolicy) : null) || report.later_sizing_hash !== laterSizingHash() ||
      report.kind !== "ai_estimate_not_gto" || report.version !== 1 ||
      report.simulation_version !== SIMULATION_VERSION || report.spot !== spot.id ||
      (candidate.metadata.spot ?? spot.id) !== spot.id || (candidate.metadata.tree ?? "oop_checks") !== spot.tree ||
      report.samples_per_board_profile_seat !== config.samples_per_board_profile_seat || report.seed !== config.seed) {
    throw new Error("Candidate or simulation report is stale/incomplete");
  }
  let checked = 0;
  for (const board of boards()) {
    const seats = { [spot.ip]: seatRange(inputs, spot.ip, board.cards), [spot.oop]: seatRange(inputs, spot.oop, board.cards) };
    for (const node of treeNodes(spot.tree)) {
      const actions = NODES[node];
      const seat = spot[nodeRole(node)]; // btn_* / ip_* = IP, bb_* / oop_* = OOP
      for (const { combo } of seats[seat]) {
        const mix = policyMix(policy, node, combo, board.cards);
        if (actions.reduce((sum?: any, action?: any) : any => sum + mix[action], 0) !== 100 ||
            actions.some((action: any) : any => !Number.isInteger(mix[action]) || mix[action] < 0)) throw new Error("Expanded policy is illegal");
        checked++;
      }
    }
  }
  const splitByBoard = new Map(boards().map((board: any) : any => [board.id, board.split]));
  const expected = new Set(boards().flatMap((board: any) : any => PROFILES.flatMap((profile: any) : any => [spot.ip, spot.oop].map((hero: any) : any =>
    `${board.id}|${profile}|${hero}`))));
  if (!Array.isArray(report.results) || report.results.length !== expected.size) throw new Error("Simulation results are incomplete");
  const warnings: any[] = [];
  const balanceFindings = [
    ...checkFlopBalance(inputs, policy).findings,
    ...(laterPolicy ? checkLaterBalance(inputs, policy, laterPolicy).findings : ([] as any[])),
  ];
  for (const finding of balanceFindings) {
    if (finding.severity === "error") throw new Error(`Balance audit failed [${finding.check}] ${finding.node}: ${finding.detail}`);
    warnings.push(`balance [${finding.check}] ${finding.node}: ${finding.detail}`);
  }
  for (const row of report.results) {
    const key = `${row.board}|${row.opponent}|${row.hero}`;
    if (!expected.delete(key) || row.split !== splitByBoard.get(row.board)) throw new Error(`Unexpected/duplicate simulation result: ${key}`);
    for (const metric of [row.candidate_ev_bb, row.baseline_ev_bb, row.delta_bb]) {
      if (!Number.isFinite(metric?.mean) || !Array.isArray(metric.ci95) || metric.ci95.length !== 2 ||
          metric.ci95.some((value: any) : any => !Number.isFinite(value)) || metric.ci95[0] > metric.mean || metric.ci95[1] < metric.mean) {
        throw new Error(`Invalid simulation metric: ${key}`);
      }
    }
    if (row.delta_bb.ci95[1] < 0) warnings.push(`${key}: candidate below reference (${row.delta_bb.mean}bb)`);
  }
  const replay = providedReplay ?? simulate(inputs, policy, config.samples_per_board_profile_seat, laterPolicy);
  if (JSON.stringify(replay) !== JSON.stringify(report)) throw new Error("Saved simulation report differs from fixed-seed replay");
  const sanity = simulate(inputs, referencePolicyFor(spot.tree), 12, null, { computedDefence: false });
  if (sanity.results.some((row: any) : any => row.delta_bb.mean !== 0)) throw new Error("Reference-vs-reference simulation drifted");
  return { checkedCombos: checked, resultCount: report.results.length, warnings };
}
