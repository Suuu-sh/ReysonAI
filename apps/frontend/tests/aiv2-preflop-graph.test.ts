import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../scripts/aiv2-preflop-graph.ts";
import { consistencyPlan, auditGlobal, actionSize } from "../scripts/aiv2-preflop-consistency.ts";
const graph = buildGraph(fileURLToPath(new URL("../src/estimated", import.meta.url)));
test("all 41 tables resolve into an acyclic 2116-node domain with 2100 actionable nodes", () => {
  assert.equal(graph.datasets.size, 41); assert.equal(graph.nodes.length, 2116);
  assert.equal(graph.nodes.filter(node => !node.spot.unreachable).length, 2100);
});
test("opening folds condition the table, not the next player's same-combo reach", () => {
  const node = graph.byKey.get("base/opening-ranges/HJ_open")!;
  assert.deepEqual(node.refs.map(ref => [ref.seat, ref.action]), [["UTG", "fold"]]);
  assert.equal(node.spot.hero, "HJ");
});
test("limp reraises follow actual seats and legal raises, never bad source field names", () => {
  const node = graph.byKey.get("base/limp-deep-responses/SB_vs_BB_limp_four_bet")!;
  assert.deepEqual(node.refs.slice(-4).map(ref => [ref.seat, ref.action]), [["SB", "limp"], ["BB", "raise"], ["SB", "raise"], ["BB", "four_bet"]]);
});
test("profile references are explicitly namespaced and history edges always own seat", () => {
  const node = graph.byKey.get("profiles/nit/villain/three-bet-responses/UTG_vs_HJ_three_bet")!;
  assert.ok(node.dependencies.slice(0, 2).every(key => key.startsWith("profiles/nit/villain/")));
  assert.ok(node.dependencies.slice(2).every(key => key.startsWith("base/cold-three-bet-responses/")));
  for (const source of graph.nodes) source.refs.forEach((ref, index) => assert.equal(graph.byKey.get(source.dependencies[index])!.spot.hero, ref.seat));
});
test("semantic consistency plan covers every decision; global audit fails missing coverage", () => {
  const plan = consistencyPlan(graph.nodes); assert.equal(plan.identities.size, 2116);
  assert.throws(() => auditGlobal(graph.nodes, new Map(), plan.identities), /coverage missing/);
});

test("semantic call sizes follow the faced action, not a proposed future raise", () => {
  const openResponse = graph.byKey.get("base/preflop-ranges/HJ_vs_UTG")!;
  assert.equal(actionSize(openResponse, "call", graph.byKey), 2.5);
  assert.equal(actionSize(openResponse, "three_bet", graph.byKey), 8);
  const threeBetResponse = graph.byKey.get("base/three-bet-responses/UTG_vs_HJ_three_bet")!;
  assert.equal(actionSize(threeBetResponse, "call", graph.byKey), 8);
  assert.equal(actionSize(threeBetResponse, "four_bet", graph.byKey), 20);
});


test("a three-bet returning to the opener includes every intervening cold-seat fold", () => {
  const node = graph.byKey.get("base/three-bet-responses/UTG_vs_HJ_three_bet")!;
  assert.deepEqual(node.full_history.map(event => [event.seat, event.action]), [
    ["UTG", "open"], ["HJ", "three_bet"], ["CO", "fold"], ["BTN", "fold"], ["SB", "fold"], ["BB", "fold"],
  ]);
  assert.deepEqual(node.full_history.slice(2).map(event => event.source?.spot_id), [
    "CO_vs_HJ_3bet_UTGopen", "BTN_vs_HJ_3bet_UTGopen", "SB_vs_HJ_3bet_UTGopen", "BB_vs_HJ_3bet_UTGopen",
  ]);
  assert.equal(node.full_history[1].to_size_bb, 8);
});

test("multiway blind response conditions on each real intervening multiway fold", () => {
  const node = graph.byKey.get("base/multiway-responses/BB_vs_UTG_HJcall")!;
  assert.deepEqual(node.full_history.map(event => [event.seat, event.action]), [
    ["UTG", "open"], ["HJ", "call"], ["CO", "fold"], ["BTN", "fold"], ["SB", "fold"],
  ]);
  assert.deepEqual(node.full_history.slice(2).map(event => event.source?.spot_id), ["CO_vs_UTG_HJcall", "BTN_vs_UTG_HJcall", "SB_vs_UTG_HJcall"]);
  assert.equal(node.full_history[1].to_size_bb, 2.5);
});

test("continuation histories retain every recorded fold and resolve its exact conditional source", () => {
  const node = graph.byKey.get("base/continuation-responses/sq_UTGo2p5_HJc2p5_COf_BTNf_SBf_BBs13__UTGf_HJr26__to_BB")!;
  assert.deepEqual(node.full_history.map(({ seat, action, to_size_bb }) => [seat, action, to_size_bb]),
    node.spot.history.map((event: any) => [event.seat, event.action, event.to_size_bb]));
  for (const seat of ["CO", "BTN", "SB"]) {
    const event = node.full_history.find(event => event.seat === seat)!;
    assert.equal(event.source?.dataset, "multiway-responses");
    assert.equal(event.source?.spot_id, `${seat}_vs_UTG_HJcall`);
    assert.equal(event.forced, true);
  }
});

test("every sourced event matches its complete prior decision prefix; unsupported folds stay explicit", () => {
  let unresolved = 0;
  const canonical = (events: any[]) => events.map(({ seat, action, to_size_bb }) => [seat, action, to_size_bb]);
  for (const node of graph.nodes) {
    let refIndex = 0;
    node.full_history.forEach((event, index) => {
      if (!event.source) {
        unresolved++;
        assert.equal(event.action, "fold");
        assert.ok(event.assumption);
        return;
      }
      const source = graph.byKey.get(node.dependencies[refIndex++])!;
      assert.deepEqual(canonical(source.full_history), canonical(node.full_history.slice(0, index)), node.key);
      assert.equal(source.spot.hero, event.seat);
    });
    assert.equal(refIndex, node.refs.length);
  }
  assert.ok(unresolved > 0, "catalog gaps must be labeled, never filled with invented strategies");
});
