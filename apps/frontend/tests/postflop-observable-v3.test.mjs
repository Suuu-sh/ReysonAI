// Historical-v3/v10 artifacts remain immutable evidence; they cannot activate the product runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { foundationPair,foundationCandidateFiles,hash } from './helpers/river-floor-regression.mjs';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { loadCandidate,loadLaterCandidate } from '../scripts/postflop-ai/generate.mjs';
import { isFreshSimulationReport } from '../scripts/postflop-ai/publish-d1.mjs';
import { replayDecision,DEFENCE_VERSION } from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
test('historical-v3 foundation archive and manifest retain their independently pinned bytes',()=>{const before=foundationPair();assert.ok(foundationCandidateFiles().length===2);assert.equal(hash(foundationPair()),hash(before));});
test('historical policies and a v10 action marker cannot substitute for the adopted saved-v7 contract',()=>{
  const input=loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call'),candidate=loadCandidate(input),later=loadLaterCandidate(input,candidate),historical=foundationPair();
  assert.equal(candidate.metadata.model,'gpt-6.1-sol');assert.equal(DEFENCE_VERSION,7);
  assert.equal(isFreshSimulationReport(input,candidate,later,historical.report),false);
  const table=replayDecision(input,parseCards('Ac7d2h9hJd',5),{flop:['bet33','call'],turn:['bet75','call'],river:['check','bet125']});
  assert.equal(table.log.at(-1).node,'river_oop_vs_125');assert.deepEqual(table.path.river,['check','bet125']);
});
