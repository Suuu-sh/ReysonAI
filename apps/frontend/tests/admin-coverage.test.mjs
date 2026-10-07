import test from "node:test";
import assert from "node:assert/strict";
import { dataset, hasDataset } from "../src/estimated/datasets.ts";
import { coverageCatalog, formatBacklog, postflopCatalog, priorityBacklog, RELEASE_TASKS } from "../src/admin/coverage.ts";
import { LEGAL_COPY } from "../src/site/legal-content.ts";
import { legalDocumentOf } from "../src/route.ts";

test("legal-page release is complete without claiming operational legal review is complete", () => {
  const task = RELEASE_TASKS.find(item => item.id === "release_terms");
  assert.equal(task.done, true);
  assert.match(task.path, /\/terms.*\/privacy/);
  assert.match(task.path, /法務確認.*継続/);
  assert.doesNotMatch(task.path, /準備中/);
  for (const document of ["terms", "privacy"]) {
    assert.equal(legalDocumentOf(`/${document}`), document);
    for (const copy of Object.values(LEGAL_COPY)) assert.equal(copy[document].sections.length, 7);
  }
  assert.match(JSON.stringify(LEGAL_COPY.ja.terms), /GTO.*数学的な最適性/);
  const release = postflopCatalog([]).categories.find(category => category.key === "release_tasks");
  assert.equal(release.rows.find(row => row.id === "release_terms").status, "done");
});

test("every persisted spot maps onto the enumerated preflop tree", () => {
  const catalog = coverageCatalog();
  const offTree = catalog.categories.flatMap(c => c.rows).filter(row => row.path.startsWith("（"));
  assert.deepEqual(offTree.map(row => row.id), []);
  const byKey = Object.fromEntries(catalog.categories.map(c => [c.key, c]));
  assert.equal(byKey.open.todo, 0);
  assert.equal(byKey.response.total, 15);
  assert.equal(byKey.squeeze.total, 60);
  assert.equal(catalog.done + catalog.todo + catalog.unreachable + catalog.rare, catalog.total);
});

test("format backlog marks only built formats as done", () => {
  const formats = formatBacklog(10);
  assert.equal(formats.filter(format => format.built).length, 1);
  assert.ok(formats.filter(format => !format.built).every(format => format.spots === 10));
});

test("postflop backlog lists flop and turn/river policies for every reachable legacy pot spot", async () => {
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.ts");
  const catalog = postflopCatalog(POSTFLOP_SPOTS, {
    "btn-bb-srp-v1-policy.json": "a", "co-bb-srp-v1-policy.json": "a", "hj-bb-srp-v1-policy.json": "a", "utg-bb-srp-v1-policy.json": "b",
  }, ["BTN_open_BB_call"]);
  const byKey = Object.fromEntries(catalog.categories.map(c => [c.key, c]));
  const reachable = POSTFLOP_SPOTS.filter(spot => spot.reachable).length;
  assert.equal(catalog.categories.filter(category => category.street === "flop" && category.modelled).reduce((sum,category)=>sum+category.total,0), reachable);
  for (const kind of ["sqp", "ccp", "c4bp"]) {
    const expected=POSTFLOP_SPOTS.filter(spot=>spot.reachable&&spot.kind===kind).map(spot=>spot.id).sort();
    for (const street of ["flop", "turn_river"]) {
      const category=byKey[`${street}_${kind}`];
      assert.deepEqual(category.rows.map(row=>row.id).sort(),expected);
      assert.ok(category.rows.every(row=>row.status==="todo"&&row.priority===4));
    }
  }
  // BTN is the authored original, UTG has its own policy, CO/HJ are copies of BTN's.
  assert.equal(byKey.flop_srp.done, 2);
  assert.equal(byKey.flop_srp.rows.filter(row => row.status === "copy").length, 2);
  assert.equal(byKey.turn_river_srp.done, 0);
  assert.ok(catalog.unreachable.includes("BTN_open_SB_call"));
  assert.equal(catalog.done + catalog.todo, catalog.total);
});

test("TODO priority follows BTN-BB heads-up, other heads-up, release prep, then multiway", async () => {
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.ts");
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
  assert.ok(preflopRows.filter(row => ["multiway", "squeeze", "cold_three_bet", "cold_four_bet"].includes(row.category)).every(row => row.priority === 4));
  assert.ok(postflopRows.filter(row => row.category === "postflop_multiway").every(row => row.priority === 4));
  assert.ok(postflopRows.filter(row => ["release_tasks"].includes(row.category)).every(row => row.priority === 3));
  assert.equal(preflopRows.find(row => row.id === "BB_vs_SB_limp").priority, 2);
  const priorities = priorityBacklog(preflop, postflop);
  assert.deepEqual(priorities.map(priority => priority.value), [1, 2, 3, 4]);
  assert.equal(priorities.reduce((total, priority) => total + priority.total, 0), preflop.total + postflop.total);
  assert.equal(priorities.reduce((total, priority) => total + priority.todo, 0), preflop.todo + postflop.todo);
});

test("postflop hand-EV is not tracked as a coverage stage (dropped 2026-10-01)", async () => {
  const { postflopCatalog, RELEASE_TASKS } = await import("../src/admin/coverage.ts");
  const { POSTFLOP_SPOTS } = await import("../scripts/postflop-ai/spots.ts");
  const spot = POSTFLOP_SPOTS.find(item => item.id === "BTN_open_BB_call");
  assert.equal(postflopCatalog([spot], {}).categories.some(category => category.street === "hand_ev"), false);
  assert.match(RELEASE_TASKS.find(task => task.id === "release_turn_river_ev").path, /見送り/);
});

test("stage 1 preflop categories enumerate and store every expected history", () => {
  const catalog = coverageCatalog();
  for (const [key, count] of Object.entries({ multiway: 20, squeeze: 60, multiway_two_callers: 15, cold_four_bet: 40 })) {
    const category = catalog.categories.find(c => c.key === key);
    assert.equal(category.total, count, key);
    assert.equal(category.done, count, key);
    assert.equal(category.todo, 0, key);
    assert.ok(category.modelled, key);
    assert.equal(new Set(category.rows.map(r => r.id)).size, count, key);
  }
});


test("stage 2 coverage enumerates all 3,115 continuation decisions separately from source decisions", () => {
  const catalog = coverageCatalog();
  const counts = { squeeze: 440, cold_four_bet: 160, two_caller_squeeze: 2295, three_bet_cold_call: 220 };
  for (const [family, count] of Object.entries(counts)) {
    const category = catalog.categories.find(c => c.key === `continuation_${family}`);
    assert.equal(category.total, count);
    assert.equal(category.done + category.todo + category.unreachable, count);
    assert.ok(category.rows.every(row => row.priority === 4 && (row.status === "done" ? row.hands === 169 : row.hands === 0)));
  }
  assert.equal(catalog.categories.filter(category => !category.key.startsWith("stage3_")).reduce((sum, category) => sum + category.total, 0), 3340);
});


test("missing Stage 2 publication stays pending while proved impossible histories are not TODO work", () => {
  const current = coverageCatalog(), absent = coverageCatalog({ continuationData: null });
  const currentRows = current.categories.filter(category => category.key.startsWith("continuation_")).flatMap(category => category.rows);
  const absentRows = absent.categories.filter(category => category.key.startsWith("continuation_")).flatMap(category => category.rows);
  assert.equal(absentRows.length, 3115);
  assert.ok(absentRows.some(row => row.status === "todo"));
  assert.ok(absentRows.every(row => row.status !== "done"));
  for (const row of currentRows.filter(row => row.status === "done")) {
    assert.equal(absentRows.find(item => item.id === row.id).status, "todo", row.id);
  }
  if (currentRows.some(row => row.status === "done")) {
    assert.equal(currentRows.filter(row => row.status === "unreachable").length, 1504);
    assert.equal(currentRows.filter(row => row.status === "todo").length, 0);
  }
});


test("a stored continuation with a missing reachable ancestor remains pending", { skip: !hasDataset("continuation-responses") }, () => {
  const original = dataset("continuation-responses"), ids = new Set(original.spots.map(spot => spot.id));
  const child = original.spots.find(spot => Object.values(spot.source_factors).flat().some(factor => factor.dataset === "continuation-responses" && ids.has(factor.spot_id)));
  const ancestor = Object.values(child.source_factors).flat().find(factor => factor.dataset === "continuation-responses" && ids.has(factor.spot_id)).spot_id;
  const partial = { ...original, spots: original.spots.filter(spot => spot.id !== ancestor) };
  const rows = coverageCatalog({ continuationData: partial }).categories.flatMap(category => category.rows);
  assert.equal(rows.find(row => row.id === ancestor).status, "todo");
  assert.equal(rows.find(row => row.id === child.id).status, "todo");
});


test("Stage3 lists every decision while keeping intentionally rare histories out of TODO", () => {
  const catalog = coverageCatalog();
  const categories = catalog.categories.filter(category => category.key.startsWith("stage3_"));
  assert.equal(categories.length, 6);
  assert.equal(categories.reduce((sum, category) => sum + category.total, 0), 16132);
  assert.equal(catalog.rare, 8710);
  const rare = categories.flatMap(category => category.rows).filter(row => row.status === "rare");
  assert.ok(rare.every(row => row.hands === 0 && row.joint_reach_upper_bound < 0.0001 && row.reason.includes("0.01%")));
  assert.equal(catalog.done + catalog.todo + catalog.unreachable + catalog.rare, catalog.total);
});
