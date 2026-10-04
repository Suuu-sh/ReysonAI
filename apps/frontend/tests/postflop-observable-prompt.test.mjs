import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { newHuAuthoringContract, promptFor, promptForLater } from '../scripts/postflop-ai/generate.mjs';
import { NEW_HU_ACTION_MODEL_VERSION } from '../scripts/postflop-ai/observable-actions.mjs';

const inputs = loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
test('new-HU author sees the exact scoped action/floor model in both prompts without changing strategy keys', () => {
  const notes = newHuAuthoringContract(inputs);
  assert.ok(notes[0].includes(`model ${NEW_HU_ACTION_MODEL_VERSION}`));
  assert.match(notes[0], /67%/);
  for (const build of [promptFor, promptForLater]) {
    const text = build(inputs);
    for (const note of notes) assert.ok(text.includes(note));
    assert.match(text, /same public chip action/);
    assert.match(text, /negative/);
    assert.match(text, /unknown-support/);
    assert.match(text, /earlier call\/fold histories by their saved policy probabilities/);
    assert.match(text, /saved zero call can remove a hand/);
    assert.doesNotMatch(text, /two thirds|are structural placeholders/);
    assert.match(text, /not a guarantee of value/);
    assert.match(text, /"bet33"/); assert.match(text, /"bet75"/); assert.match(text, /"bet125"/);
  }
});

test('legacy prompt builder receives no new-family execution notes', () => {
  const legacy = loadInputs('BTN_open_BB_call');
  assert.deepEqual(newHuAuthoringContract(legacy), []);
  for (const build of [promptFor, promptForLater]) {
    const text = build(legacy);
    assert.doesNotMatch(text, /New-HU execution model|hidden sampled size label|added MDF-floor call/);
  }
});
