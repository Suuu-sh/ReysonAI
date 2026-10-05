// Separate opt-in numerical consumer. Existing simulation.mjs and acceptance reports are untouched.
import { createModel11Execution, validateOwnCombo } from './execution-model11.mjs';
import { referenceExecutor } from './effective-action-law.mjs';
import { EffectiveReachError, requestBeforeEntry } from './decision-prefix.mjs';
import { createTable, playFlop, playLaterStreetsWithPolicy, settle, rake } from './engine.mjs';
import { playHand, dealRunout, PROFILES } from './simulation.mjs';
import { referencePolicyFor } from './policy.mjs';
import { referenceLaterPolicy } from './later-policy.mjs';
import { makeSampler, seatRange, samplePair } from './inputs.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seedFor, seededRandom } from '../lib/equity.mjs';
import { freezeSnapshot, contentHash } from './effective-law-identity.mjs';
const round = value => Math.round(value * 100) / 100;
const fail = message => { throw new EffectiveReachError('invalid-simulation-contract', message); };

export function playModel11Hand({ execution, hands, flop, runout, hero, profile, randoms, onDecision = () => {} }) {
  const { spot, config } = execution, seats = [spot.ip, spot.oop];
  if (!seats.includes(hero) || !PROFILES.includes(profile) || !Array.isArray(flop) || flop.length !== 3 ||
      !Array.isArray(runout) || runout.length !== 2 || !Array.isArray(randoms) || randoms.length < 12 ||
      randoms.some(value => !Number.isFinite(value) || value < 0 || value >= 1)) fail('Invalid simulated hand');
  const fullBoard = [...flop, ...runout];
  if (fullBoard.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) fail('Invalid board cards');
  for (const seat of seats) validateOwnCombo(hands?.[seat], fullBoard);
  if (new Set([...hands[spot.ip], ...hands[spot.oop], ...fullBoard]).size !== 9) fail('Duplicate deal cards');
  const reference = referenceExecutor(profile), table = createTable(spot);
  let randomIndex = 0;
  const decide = (seat, node, board) => {
    if (randomIndex >= randoms.length) fail('Simulation random stream exhausted');
    const request = requestBeforeEntry(table, board, table.log.at(-1));
    const random = randoms[randomIndex++];
    // Crucially neither the other hand nor runout reaches either action-law adapter.
    let choice;
    try {
      choice = seat === hero ? execution.sample(request, hands[seat], random)
        : execution.sampleReference(request, hands[seat], reference, random);
    } catch (error) {
      if (error instanceof EffectiveReachError) error.decision = { request, seat, node, randomIndex: randomIndex - 1 };
      throw error;
    }
    if (choice.law.provenance.prefix && choice.law.provenance.prefix.pending.seat !== seat) fail('Actor/prefix mismatch');
    onDecision({ request, seat, node, random, label: choice.label, action: choice.action,
      executor: seat === hero ? 'balanced-model11' : 'actual-reference', law: choice.law });
    // Preserve original label sampling. Engine owns the one public physical projection.
    return choice.label;
  };
  playFlop(table, spot.tree, (seat, node) => decide(seat, node, flop), config);
  playLaterStreetsWithPolicy(table, flop, runout, (seat, node, board) => decide(seat, node, board), config, table.lastAggressor);
  const winner = settle(table, hands, fullBoard), { pot, invested } = table;
  const fee = rake(pot), paid = round(pot - fee);
  const returns = Object.fromEntries(seats.map(seat => [seat,
    round((winner === seat ? paid : winner === 'tie' ? paid / 2 : 0) - invested[seat])]));
  if (Math.abs(returns[spot.ip] + returns[spot.oop] - (spot.potBb - fee)) > 0.02) fail('Chip conservation failed');
  return { winner, pot, fee, invested, returns };
}
export function model11SampleStats(values) {
  if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value))) fail('Nonempty finite sample values required');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const half = 1.96 * Math.sqrt(variance / values.length), precise = x => Math.round(x * 10000) / 10000;
  return { mean: precise(mean), sampleCount: values.length,
    status: values.length < 2 ? 'insufficient-samples-for-ci' : 'normal-approximation-not-acceptance',
    ci95: values.length < 2 ? null : [precise(mean - half), precise(mean + half)] };
}

// Pure report boundary so incomplete samples cannot accidentally become survivor-only EVs.
export function summarizeModel11Trials({ attempted, candidate, baseline, unresolved }) {
  if (!Number.isInteger(attempted) || attempted < 1 || !Array.isArray(candidate) || !Array.isArray(baseline) || !Array.isArray(unresolved) ||
      candidate.length !== baseline.length || candidate.length + unresolved.length !== attempted ||
      [...candidate, ...baseline].some(value => !Number.isFinite(value)) || unresolved.some(row => row.status !== 'off-model-observed-action')) fail('Invalid paired trial accounting');
  const complete = unresolved.length === 0;
  return { status: complete ? 'complete' : 'unresolved-off-model', attempted, completed: candidate.length, unresolved,
    candidate_ev_bb: complete ? model11SampleStats(candidate) : null, baseline_ev_bb: complete ? model11SampleStats(baseline) : null,
    delta_bb: complete ? model11SampleStats(candidate.map((value, index) => value - baseline[index])) : null };
}

// Required explicit board list and sample count: no default 72-cell or full-catalog run.
export function simulateModel11(inputs, flopArtifact, laterArtifact, { boardList, samples, cacheBatchSize = 1, profiles = PROFILES, heroes, executionOptions = {} } = {}) {
  if (!Array.isArray(boardList) || !boardList.length || !Number.isInteger(samples) || samples < 1 ||
      !Number.isInteger(cacheBatchSize) || cacheBatchSize < 1) fail('Explicit nonempty boards, positive samples and cache batch size required');
  const execution = createModel11Execution(inputs, flopArtifact, laterArtifact, executionOptions);
  // Snapshot source values so caller mutation cannot change sampling independently of the frozen law.
  const frozen = freezeSnapshot(inputs), plan = freezeSnapshot(boardList), { spot, config } = execution;
  if (new Set(plan.map(board => board.id)).size !== plan.length) fail('Duplicate board IDs');
  const selectedProfiles = freezeSnapshot(profiles), selectedHeroes = freezeSnapshot(heroes ?? [spot.ip, spot.oop]);
  if (!Array.isArray(selectedProfiles) || !selectedProfiles.length || new Set(selectedProfiles).size !== selectedProfiles.length || selectedProfiles.some(profile => !PROFILES.includes(profile)) ||
      !Array.isArray(selectedHeroes) || !selectedHeroes.length || new Set(selectedHeroes).size !== selectedHeroes.length || selectedHeroes.some(hero => ![spot.ip, spot.oop].includes(hero))) fail('Invalid explicit profiles or heroes');
  const started = performance.now(), results = [], referencePolicy = referencePolicyFor(spot.tree), laterPolicy = referenceLaterPolicy();
  try {
    for (const board of plan) {
      execution.prefix({ board: board.cards, path: { flop: [] } });
      if (board.cards.length !== 3 || typeof board.id !== 'string' || !board.id) fail('Invalid simulation flop');
      execution.releaseBoardCaches();
      if (!hasPostflopDeal(frozen, board.cards)) { results.push({ board: board.id, status: 'unreachable-base-deal' }); continue; }
      const ip = makeSampler(seatRange(frozen, spot.ip, board.cards)), oop = makeSampler(seatRange(frozen, spot.oop, board.cards));
      for (const profile of selectedProfiles) for (const hero of selectedHeroes) {
        const random = seededRandom(seedFor(`${config.seed}|${board.id}|${profile}|${hero}`));
        const candidate = [], baseline = [], unresolved = [];
        for (let index = 0; index < samples; index++) {
          if (index % cacheBatchSize === 0) execution.releaseBoardCaches();
          const hands = samplePair(ip, oop, random, spot), runout = dealRunout(hands, board.cards, random);
          const randoms = Array.from({ length: 24 }, () => random());
          const base = playHand({ hands, flop: board.cards, runout, hero, policy: referencePolicy, laterPolicy, profile, randoms, spot });
          let trial;
          try { trial = playModel11Hand({ execution, hands, flop: board.cards, runout, hero, profile, randoms }); }
          catch (error) {
            if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
            unresolved.push({ index, status: error.status, message: error.message, decision: error.decision, zeroLikelihoodProof: error.zeroLikelihoodProof ?? null }); continue;
          }
          candidate.push(trial.returns[hero]); baseline.push(base.returns[hero]);
        }
        results.push({ board: board.id, split: board.split ?? null, hero, opponent: profile,
          ...summarizeModel11Trials({ attempted: samples, candidate, baseline, unresolved }) });
      }
    }
    return { kind: 'model11-offline-simulation-not-acceptance', version: 2, execution: execution.identity,
      artifactProvenance: execution.artifactProvenance, belief: execution.belief,
      planIdentity: contentHash({ boards: plan, samples, seed: config.seed, cacheBatchSize, profiles: selectedProfiles, heroes: selectedHeroes }),
      samples_per_board_profile_seat: samples, seed: config.seed, profiles: selectedProfiles, heroes: selectedHeroes,
      counts: { attempted: results.reduce((n, row) => n + (row.attempted ?? 0), 0), completed: results.reduce((n, row) => n + (row.completed ?? 0), 0),
        offModel: results.reduce((n, row) => n + (row.unresolved?.length ?? 0), 0) },
      diagnostics: { elapsedMs: performance.now() - started, cache: execution.cacheStats(), memoryAtReturn: process.memoryUsage(),
        processLifetimeMaxRssKiB: process.resourceUsage().maxRSS, memoryScope: 'process lifetime high-water; V8 heap limit is not an RSS limit' }, results };
  } finally { execution.releaseBoardCaches(); }
}
