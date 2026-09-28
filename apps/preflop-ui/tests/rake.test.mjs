import assert from "node:assert/strict";
import test from "node:test";
import { hasConfiguredRake, rake, rakeMetadata, raked } from "../src/estimated/rake.ts";

test("5% rake is capped at 3BB and raked pots are net of the fee", () => {
  assert.equal(rakeMetadata.rate, 0.05);
  assert.equal(rakeMetadata.cap_bb, 3);
  assert.equal(rake(20), 1);
  assert.equal(raked(20), 19);
  assert.equal(rake(200), 3);
  assert.equal(raked(200), 197);
  assert.equal(rake(0), 0);
});

test("dataset metadata must match the configured rake environment", () => {
  assert.equal(hasConfiguredRake({ rake: { ...rakeMetadata } }), true);
  assert.equal(hasConfiguredRake({ rake: { ...rakeMetadata, rate: null } }), false);
  assert.throws(() => rake(-1));
});
