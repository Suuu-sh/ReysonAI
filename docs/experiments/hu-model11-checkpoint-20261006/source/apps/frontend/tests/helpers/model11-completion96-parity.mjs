// Fixed original 96-trial selection, fresh execution only. Never a strategy acceptance gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { contentHash } from '../../scripts/postflop-ai/effective-law-identity.mjs';
import { fixture, emitFresh } from './model11-execution-fixtures.mjs';
import { createModel11BehaviorCompletion } from '../../scripts/postflop-ai/offpath-behavior-model11.mjs';
import { playModel11Hand, summarizeModel11Trials } from '../../scripts/postflop-ai/simulation-model11.mjs';
import { simulateModel11Completion } from '../../scripts/postflop-ai/simulation-model11-completion.mjs';
import { playHand, dealRunout } from '../../scripts/postflop-ai/simulation.mjs';
import { referencePolicyFor } from '../../scripts/postflop-ai/policy.mjs';
import { referenceLaterPolicy } from '../../scripts/postflop-ai/later-policy.mjs';
import { makeSampler, seatRange, samplePair } from '../../scripts/postflop-ai/inputs.mjs';
import { seedFor, seededRandom } from '../../scripts/lib/equity.mjs';
const board = { id: 'As7d2c', cards: [51, 21, 0], split: 'design' }, profiles = ['standard', 'passive', 'aggressive'];
const originalResultSha = '106740768ac58f57a07490db3ebae3721ab3899c67db625a3e16bde04317932f';
const evidence = new URL('../../.local/hu-model11-completion/original-strict96.json', import.meta.url);
const originalBytes = readFileSync(evidence);
assert.equal(createHash('sha256').update(originalBytes).digest('hex'), originalResultSha);
const original = JSON.parse(originalBytes);

test('completion96 preserves all95 strict trajectories returns and failing trial common prefix', () => {
  const { inputs, flop, later, execution: strict } = fixture(), composite = createModel11BehaviorCompletion(inputs, flop, later);
  const heroes = [inputs.spot.ip, inputs.spot.oop], plan = { boardList: [board], samples: 16, profiles, heroes, cacheBatchSize: 512 };
  assert.deepEqual(strict.identity, original.execution);
  const ip = makeSampler(seatRange(inputs, inputs.spot.ip, board.cards)), oop = makeSampler(seatRange(inputs, inputs.spot.oop, board.cards));
  const reference = referencePolicyFor(inputs.spot.tree), referenceLater = referenceLaterPolicy();
  let identical = 0, rescued = 0; const paired = [], witness = [];
  for (const profile of profiles) for (const hero of heroes) {
    const random = seededRandom(seedFor(`${inputs.config.seed}|${board.id}|${profile}|${hero}`)), candidate = [], baseline = [], unresolved = [];
    for (let index = 0; index < 16; index++) {
      if (index === 0) { strict.releaseBoardCaches(); composite.releaseBoardCaches(); }
      const hands = samplePair(ip, oop, random, inputs.spot), runout = dealRunout(hands, board.cards, random), randoms = Array.from({ length: 24 }, () => random());
      const strictDecisions = [], compositeDecisions = []; let strictResult, failure;
      const argumentsFor = execution => ({ execution, hands, flop: board.cards, runout, hero, profile, randoms });
      try { strictResult = playModel11Hand({ ...argumentsFor(strict), onDecision: row => strictDecisions.push(row) }); }
      catch (error) { assert.equal(error.status, 'off-model-observed-action'); failure = error; }
      const compositeResult = playModel11Hand({ ...argumentsFor(composite), onDecision: row => compositeDecisions.push(row) });
      if (!failure) {
        assert.deepEqual(compositeDecisions, strictDecisions); assert.deepEqual(compositeResult, strictResult); identical++;
      } else {
        assert.equal(profile, 'passive'); assert.equal(hero, 'SB'); assert.equal(index, 10);
        assert.equal(failure.zeroLikelihoodProof.proofHash, '0c25e3d57109f25d5ab930c6e8806e073c87f0a5138e16ef176cad4b35b38950');
        assert.equal(failure.zeroLikelihoodProof.rows.length, 84);
        assert.deepEqual(compositeDecisions.slice(0, strictDecisions.length), strictDecisions);
        const next = compositeDecisions[strictDecisions.length];
        assert.deepEqual(next.request, failure.decision.request); assert.equal(next.seat, hero);
        assert.equal(next.law.provenance.kind, 'off-model-saved-policy-behavior-completion');
        assert.equal(next.law.provenance.zeroLikelihoodProof.proofHash, failure.zeroLikelihoodProof.proofHash);
        assert.ok(next.law.classes.some(group => group.action === next.action));
        assert.ok(['fold', 'call'].includes(next.action)); assert.equal(compositeDecisions.length, strictDecisions.length + 1);
        assert.throws(() => composite.rangeState(next.request, hero), error => error.status === 'off-model-observed-action');
        witness.push({ profile, hero, index, hands, runout, randoms, strictDecisions, strictFailure: { status: failure.status, decision: failure.decision, zeroLikelihoodProof: failure.zeroLikelihoodProof }, compositeDecisions, compositeResult });
        rescued++;
      }
      const base = playHand({ hands, flop: board.cards, runout, hero, policy: reference, laterPolicy: referenceLater, profile, randoms, spot: inputs.spot });
      if (!failure) { candidate.push(strictResult.returns[hero]); baseline.push(base.returns[hero]); }
      else unresolved.push({ index, status: failure.status, message: failure.message, decision: failure.decision, zeroLikelihoodProof: failure.zeroLikelihoodProof });
      paired.push({ profile, hero, index, candidate: compositeResult.returns[hero], baseline: base.returns[hero], byPolicy: Boolean(failure),
        strictTraceHash: contentHash(strictDecisions), compositeTraceHash: contentHash(compositeDecisions) });
    }
    const oldCell = original.results.find(row => row.opponent === profile && row.hero === hero);
    assert.deepEqual(summarizeModel11Trials({ attempted: 16, candidate, baseline, unresolved }),
      Object.fromEntries(Object.keys(summarizeModel11Trials({ attempted: 16, candidate, baseline, unresolved })).map(key => [key, oldCell[key]])));
  }
  assert.equal(identical, 95); assert.equal(rescued, 1);
  strict.releaseBoardCaches(); composite.releaseBoardCaches();
  // A fresh factory/report replay must agree with every paired return, including the rescued trial.
  const report = simulateModel11Completion(inputs, flop, later, plan), replay = simulateModel11Completion(inputs, flop, later, plan);
  const numerical = value => { const { diagnostics, ...body } = value; return body; };
  assert.deepEqual(numerical(report), numerical(replay));
  assert.deepEqual(report.counts, { attempted: 96, completed: 96, completedByPolicy: 1, offModelTrials: 1,
    offModelOccurrences: 1, completionDecisions: 1, validatedProofs: 1, unresolvedCount: 0, uniqueProofs: 1 });
  for (const cell of report.results) {
    const expected = paired.filter(row => row.hero === cell.hero && row.profile === cell.opponent);
    assert.deepEqual(cell.trials.map(trial => trial.candidateReturn), expected.map(row => row.candidate));
    assert.deepEqual(cell.trials.map(trial => trial.baselineReturn), expected.map(row => row.baseline));
    assert.equal(cell.candidate_ev_bb.sampleCount, 16); assert.equal(cell.delta_bb.sampleCount, 16);
  }
  emitFresh('completion96-parity-and-replay', { originalResultSha, strictExecution: strict.identity, compositeExecution: composite.identity,
    counts: report.counts, paired, witness, report,
    checks: { all95TrajectoriesAndReturnsEqual: true, exactFailingTrialCommonPrefix: true, legalNewTerminal: true,
      all96ReturnsIncluded: true, freshReplayEqual: true, strictStillOffModel: true } });
});
