import test from "node:test";
import assert from "node:assert/strict";
import { coverageCatalog, formatBacklog } from "../src/admin/coverage.js";

test("every persisted spot maps onto the enumerated preflop tree", () => {
  const catalog = coverageCatalog();
  const offTree = catalog.categories.flatMap(c => c.rows).filter(row => row.path.startsWith("（"));
  assert.deepEqual(offTree.map(row => row.id), []);
  const byKey = Object.fromEntries(catalog.categories.map(c => [c.key, c]));
  assert.equal(byKey.open.todo, 0);
  assert.equal(byKey.response.total, 15);
  assert.equal(byKey.squeeze.total, 60);
  assert.equal(catalog.done + catalog.todo, catalog.total);
});

test("format backlog marks only built formats as done", () => {
  const formats = formatBacklog(10);
  assert.equal(formats.filter(format => format.built).length, 1);
  assert.ok(formats.filter(format => !format.built).every(format => format.spots === 10));
});

test("postflop backlog lists flop and turn/river policies for every reachable spot", async () => {
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.mjs");
  const { postflopCatalog } = await import("../src/admin/coverage.js");
  const catalog = postflopCatalog(POSTFLOP_SPOTS, {
    "btn-bb-srp-v1-policy.json": "a", "co-bb-srp-v1-policy.json": "a", "hj-bb-srp-v1-policy.json": "a", "utg-bb-srp-v1-policy.json": "b",
  }, ["BTN_open_BB_call"]);
  const byKey = Object.fromEntries(catalog.categories.map(c => [c.key, c]));
  const reachable = POSTFLOP_SPOTS.filter(spot => spot.reachable).length;
  assert.equal(byKey.flop_srp.total + byKey.flop_3bp.total + byKey.flop_4bp.total + byKey.flop_limp.total, reachable);
  // BTN is the authored original, UTG has its own policy, CO/HJ are copies of BTN's.
  assert.equal(byKey.flop_srp.done, 2);
  assert.equal(byKey.flop_srp.rows.filter(row => row.status === "copy").length, 2);
  assert.equal(byKey.turn_river_srp.done, 0);
  assert.ok(catalog.unreachable.includes("BTN_open_SB_call"));
  assert.equal(catalog.done + catalog.todo, catalog.total);
});
