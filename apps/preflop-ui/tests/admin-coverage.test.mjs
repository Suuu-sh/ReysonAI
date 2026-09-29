import test from "node:test";
import assert from "node:assert/strict";
import { coverageCatalog, formatBacklog, postflopCatalog, priorityBacklog } from "../src/admin/coverage.ts";

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

test("TODO priority follows BTN-BB heads-up, other heads-up, then multiway", async () => {
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.mjs");
  const preflop = coverageCatalog();
  const postflop = postflopCatalog(POSTFLOP_SPOTS);
  const preflopRows = preflop.categories.flatMap(category => category.rows);
  const postflopRows = postflop.categories.flatMap(category => category.rows);
  assert.deepEqual(preflopRows.filter(row => row.priority === 1).map(row => row.id), [
    "BTN_open", "BB_vs_BTN", "BTN_vs_BB_three_bet", "BB_vs_BTN_four_bet", "BTN_vs_BB_five_bet",
  ]);
  assert.deepEqual(new Set(postflopRows.filter(row => row.priority === 1).map(row => row.id)), new Set([
    "BTN_open_BB_call", "BTN_open_BB_3bet_call", "BTN_open_BB_4bp_call",
  ]));
  assert.ok(preflopRows.filter(row => ["multiway", "squeeze", "cold_three_bet", "cold_four_bet"].includes(row.category)).every(row => row.priority === 3));
  assert.ok(postflopRows.filter(row => row.category === "postflop_multiway").every(row => row.priority === 3));
  assert.equal(preflopRows.find(row => row.id === "BB_vs_SB_limp").priority, 2);
  const priorities = priorityBacklog(preflop, postflop);
  assert.deepEqual(priorities.map(priority => priority.value), [1, 2, 3]);
  assert.equal(priorities.reduce((total, priority) => total + priority.total, 0), preflop.total + postflop.total);
  assert.equal(priorities.reduce((total, priority) => total + priority.todo, 0), preflop.todo + postflop.todo);
});

test("hand-EV counts as done only while it matches the current policies", async () => {
  const { postflopCatalog } = await import("../src/admin/coverage.ts");
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.mjs");
  const spot = POSTFLOP_SPOTS.find(item => item.id === "BTN_open_BB_call");
  const status = value => postflopCatalog([spot], { [`${spot.slug}-hand-ev.json`]: value })
    .categories.find(category => category.key === "hand_ev_srp").rows[0].status;
  assert.equal(status("fresh"), "done");
  assert.equal(status(null), "todo");
  assert.equal(postflopCatalog([spot], {}).categories.find(category => category.key === "hand_ev_srp").rows[0].status, "todo");
});
