import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMw3MaterializeArgs, materializeMw3Pilot } from '../scripts/postflop-ai/materialize-mw3-pilot.mjs';
import { MW3_PILOT_AUTHORSHIP } from '../scripts/data/mw3-co-btn-bb-authored.mjs';

// Parser/early identity rejection only. CI must never compile or save a candidate.
test('materializer requires explicit exact pilot, Astra model and source identity without generating', () => {
  const valid = ['--spot', MW3_PILOT_AUTHORSHIP.spotId, '--model', 'gpt-6-astra', '--source-hash', MW3_PILOT_AUTHORSHIP.sourceFingerprint];
  assert.equal(parseMw3MaterializeArgs(valid).sourceHash, MW3_PILOT_AUTHORSHIP.sourceFingerprint);
  for (const args of [[], valid.slice(0, 4), [...valid, '--model', 'gpt-6-astra'], [...valid, '--publish', 'yes'],
    valid.map(value => value === 'gpt-6-astra' ? 'other' : value), valid.map(value => value === MW3_PILOT_AUTHORSHIP.spotId ? 'UTG_open_HJ_call_BB_call' : value)]) {
    assert.throws(() => parseMw3MaterializeArgs(args));
  }
  assert.throws(() => materializeMw3Pilot({ ...parseMw3MaterializeArgs(valid), sourceHash: '0'.repeat(64) }), /mismatched/);
});
