import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import * as authoring from '../scripts/postflop-ai/generate.mjs';

// Supersedes the abandoned v10 prompt-injection assertions. Adopted development
// uses the ordinary v7 policy-label tree for both legacy and selected HU histories.
const selected = loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const legacy = loadInputs('BTN_open_BB_call');

test('adopted-v7 authoring has no history-triggered observable-action/floor contract', () => {
  assert.equal(Object.hasOwn(authoring, 'newHuAuthoringContract'), false);
  for (const inputs of [selected, legacy]) for (const build of [authoring.promptFor, authoring.promptForLater]) {
    const text = build(inputs);
    assert.match(text, /AI-estimated poker policy rules, not GTO/);
    assert.match(text, /Do not call tools or write files/);
    assert.match(text, /never infer the opponent's hidden cards/i);
    assert.match(text, /"bet33"/);
    assert.match(text, /"bet75"/);
    assert.match(text, /"bet125"/);
    assert.match(text, /integer(?:s)? 0\.\.100/);
    assert.doesNotMatch(text, /New-HU execution model|same public chip action|hidden sampled size label|added MDF-floor call|unknown-support|negative-EV/);
  }
});

test('selected HU prompts preserve actual history, dead chips, sizing and private-card tier facts', () => {
  const flop = authoring.promptFor(selected), later = authoring.promptForLater(selected);
  for (const text of [flop, later]) {
    assert.ok(text.includes(`flop pot ${selected.spot.potBb}BB, stacks ${selected.spot.stackBb}BB`));
    assert.match(text, /Folded participants\' contributions remain in the pot as dead chips/);
    assert.match(text, /unknown cards are not removed/);
    assert.match(text, /two thirds/);
    assert.match(text, /made with a private card/);
    assert.match(text, /board pair alone counts for nobody/);
  }
  assert.match(flop, /folded players' dead contributions as part of the pot/);
  assert.match(flop, /Turn\/river use a separate later-street policy/);
  assert.match(later, /you author only the turn and river/);
  assert.match(later, /River tiers exclude draw/);
  assert.doesNotMatch(authoring.promptFor(legacy), /Folded participants|multiway-origin histories/);
});
