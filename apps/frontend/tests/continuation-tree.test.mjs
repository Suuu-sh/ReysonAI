import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  all_decisions, continuationRoots, continuationSpots, reusedContinuationSpots,
  continuationTerminals, continuationById, continuationFamilies,
  continuationDataset, continuationPlaceholderContract, enumerateContinuationTree,
  twoCallerFourBetToBb,
} from "../src/estimated/continuation-tree.ts";
import { multiwaySpots } from "../src/estimated/multiway-responses.ts";
import { multiway2Spots } from "../src/estimated/multiway2-responses.ts";
import { coldThreeBetSpots } from "../src/estimated/cold-three-bet-responses.ts";
import { squeezeResponseSpots } from "../src/estimated/squeeze-responses.ts";
import { coldFourBetSpots } from "../src/estimated/cold-four-bet-responses.ts";
import { positions, fourBetToSize, squeezeFourBetToSize, threeBetToSize, twoCallerSqueezeToSize } from "../src/estimated/sizing.ts";

test("the approved 30BB exception has isolated configuration with Python/TypeScript parity", () => {
  const config = JSON.parse(readFileSync(new URL("../../../configs/multiway-preflop-stage2.json", import.meta.url)));
  assert.equal(config.fixed_raise_to_bb.four_bet_after_two_caller_squeeze, twoCallerFourBetToBb);
  assert.equal(twoCallerFourBetToBb, 30);
  const value = execFileSync("python3", ["-c", "from sizing_rules import two_caller_squeeze_four_bet_to; print(two_caller_squeeze_four_bet_to())"], { cwd: new URL("../scripts/", import.meta.url), encoding: "utf8" });
  assert.equal(Number(value.trim()), twoCallerFourBetToBb);
  const shared = JSON.parse(readFileSync(new URL("../../../configs/cash-6max-100bb.json", import.meta.url)));
  assert.equal(Object.hasOwn(shared.sizing.fixed_raise_to_bb, "four_bet_after_two_caller_squeeze"), false);
  assert.equal(fourBetToSize("UTG", "HJ"), 20);
  assert.equal(fourBetToSize("SB", "BB"), 24);
  assert.equal(fourBetToSize("BB", "SB"), 26);
});

const byRoot = (items, root) => items.filter(item => item.root_id === root.id);
const allStates = [...all_decisions, ...continuationTerminals];
const byId = new Map(allStates.map(item => [item.id, item]));
const cycle = seat => {
  const i = positions.indexOf(seat);
  return [...positions.slice(i + 1), ...positions.slice(0, i)];
};
const choice = (node, name) => byId.get(node.children[name]);
const findRoot = (family, opener, ...participants) => continuationRoots.find(root =>
  root.family === family && root.opener === opener && root.participants.join() === [opener, ...participants].join());
const first = root => byId.get(root.first_decision_id);

// Independent action-count recurrence. There are n live players and p players
// left to respond at wager level k. Fold removes one; call consumes one turn;
// a raise starts a new lap with every other live player. No raise exists at 5.
function abstractCounts(n, p, k) {
  if (n === 1 || p === 0) return { decisions: 0, terminals: 1 };
  const branches = [abstractCounts(n - 1, p - 1, k), abstractCounts(n, p - 1, k)];
  if (k < 5) branches.push(abstractCounts(n, n - 1, k + 1));
  return branches.reduce((sum, branch) => ({ decisions: sum.decisions + branch.decisions, terminals: sum.terminals + branch.terminals }), { decisions: 1, terminals: 0 });
}

test("75 bounded source histories enumerate 3,115 new decisions by independent recurrence", () => {
  const cases = [
    ["squeeze", multiwaySpots.length, 3, 2, 3, 3, 440],
    ["cold_four_bet", coldThreeBetSpots.length, 3, 2, 4, 2, 160],
    ["two_caller_squeeze", multiway2Spots.length, 4, 3, 3, 0, 2295],
    ["three_bet_cold_call", coldThreeBetSpots.length, 3, 1, 3, 0, 220],
  ];
  assert.deepEqual(cases.map(item => item[0]), continuationFamilies);
  let derivedTotal = 0, derivedTerminals = 0;
  for (const [family, rootCount, players, pending, level, reusedPerRoot, expectedNew] of cases) {
    const roots = continuationRoots.filter(root => root.family === family);
    const counts = abstractCounts(players, pending, level);
    assert.equal(roots.length, rootCount);
    assert.equal(rootCount * (counts.decisions - reusedPerRoot), expectedNew);
    for (const root of roots) {
      assert.equal(root.participants.length, players);
      assert.equal(first(root).pending_actors.length, pending);
      assert.equal(byRoot(all_decisions, root).length, counts.decisions);
      assert.equal(byRoot(reusedContinuationSpots, root).length, reusedPerRoot);
      assert.equal(byRoot(continuationSpots, root).length, counts.decisions - reusedPerRoot);
      assert.equal(byRoot(continuationTerminals, root).length, counts.terminals);
    }
    derivedTotal += expectedNew;
    derivedTerminals += counts.terminals * roots.length;
  }
  assert.equal(continuationRoots.length, 75);
  assert.equal(continuationSpots.length, derivedTotal);
  assert.equal(derivedTotal, 3115);
  assert.equal(continuationTerminals.length, derivedTerminals);
  assert.equal(derivedTerminals, 4200);
});

test("only exact stage-one decisions are reused, keeping their IDs and source datasets", () => {
  assert.deepEqual(reusedContinuationSpots.filter(s => s.family === "squeeze").map(s => s.id).sort(), squeezeResponseSpots.map(s => s.id).sort());
  assert.deepEqual(reusedContinuationSpots.filter(s => s.family === "cold_four_bet").map(s => s.id).sort(), coldFourBetSpots.map(s => s.id).sort());
  assert.equal(reusedContinuationSpots.length, 100);
  assert.ok(reusedContinuationSpots.every(s => s.dataset === (s.family === "squeeze" ? "squeeze-responses" : "cold-four-bet-responses")));
  assert.ok(continuationSpots.every(s => s.dataset === continuationDataset && !s.reused));
  const newIds = new Set(continuationSpots.map(s => s.id));
  assert.ok(reusedContinuationSpots.every(s => !newIds.has(s.id)));
});

test("IDs encode full histories, remain bounded, and traversal is deterministic and topological", () => {
  const ids = [...continuationRoots.map(s => s.id), ...allStates.map(s => s.id)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => id.length < 160 && /^[A-Za-z0-9_]+$/.test(id)));
  const next = enumerateContinuationTree();
  assert.deepEqual(next.roots, continuationRoots);
  assert.deepEqual(next.all_decisions, all_decisions);
  assert.deepEqual(next.terminals, continuationTerminals);
  const order = new Map(all_decisions.map((s, i) => [s.id, i]));
  for (const node of all_decisions) {
    assert.equal(continuationById.get(node.id), node);
    if (node.parent_id) assert.ok(order.get(node.parent_id) < order.get(node.id));
    assert.deepEqual(Object.keys(node.children), node.legal_actions);
    for (const name of node.legal_actions) {
      const child = choice(node, name);
      assert.ok(child);
      assert.equal(child.parent_id, node.id);
      assert.equal(child.parent_action, name);
      assert.equal(child.root_id, node.root_id);
      assert.deepEqual(child.history.slice(0, -1), node.history);
      assert.deepEqual(child.history.at(-1), {
        seat: node.hero, action: name, to_size_bb: node.action_sizes_bb[name], forced: false,
        source: { dataset: node.dataset, spot_id: node.id, action: name },
      });
    }
  }
});

test("all initial laps retain exactly their participants, forced folds, root sizes and source factors", () => {
  for (const root of continuationRoots) {
    const node = first(root);
    assert.deepEqual(root.history.map(event => event.seat), positions);
    assert.deepEqual(node.history, root.history);
    assert.equal(node.hero, root.opener);
    assert.equal(new Set(root.participants).size, root.participants.length);
    assert.deepEqual(root.participants, positions.filter(seat => root.participants.includes(seat)));
    for (const seat of positions) {
      const event = root.history.find(item => item.seat === seat);
      if (root.participants.includes(seat)) {
        assert.equal(event.forced, false);
        assert.equal(event.source.action, event.action);
        assert.deepEqual(node.source_factors[seat], [event.source]);
      } else {
        assert.deepEqual(event, { seat, action: "fold", to_size_bb: null, forced: true, source: null });
        assert.deepEqual(node.source_factors[seat], []);
        assert.ok(node.folded.includes(seat));
      }
    }
    if (root.family === "squeeze") assert.equal(root.three_bet_size_bb, threeBetToSize(root.opener, root.squeezer, 1));
    if (root.family === "two_caller_squeeze") {
      assert.equal(root.callers.length, 2);
      assert.equal(root.three_bet_size_bb, twoCallerSqueezeToSize(root.opener, root.squeezer));
      assert.deepEqual(node.source_factors[root.callers[1]], [{ dataset: "multiway-responses", spot_id: `${root.callers[1]}_vs_${root.opener}_${root.callers[0]}call`, action: "call" }]);
    }
    if (root.family === "cold_four_bet") assert.equal(root.four_bet_size_bb, fourBetToSize(root.four_bettor, root.three_bettor));
    if (root.family === "three_bet_cold_call") {
      assert.deepEqual(node.pending_actors, [root.opener]);
      assert.equal(node.source_factors[root.cold_caller][0].dataset, "cold-three-bet-responses");
      assert.equal(node.source_factors[root.cold_caller][0].action, "call");
      assert.equal(choice(node, "fold").terminal, "flop");
      assert.equal(choice(node, "call").terminal, "flop");
    }
  }
});

test("every action preserves cyclic turn order, folds, all-ins, pending actors and min full raises", () => {
  for (const node of all_decisions) {
    assert.equal(node.hero, node.pending_actors[0]);
    assert.equal(node.bet_level, node.facing_size_bb === 100 ? 5 : node.history.some(event => event.action === "four_bet") ? 4 : 3);
    assert.deepEqual(node.legal_actions, node.bet_level === 3 ? ["fold", "call", "four_bet"] : node.bet_level === 4 ? ["fold", "call", "all_in"] : ["fold", "call"]);
    assert.deepEqual(node.live_participants, node.participants.filter(seat => !node.folded.includes(seat)));
    assert.ok(node.pending_actors.every(seat => node.live_participants.includes(seat) && !node.all_in.includes(seat)));
    assert.equal(new Set(node.pending_actors).size, node.pending_actors.length);
    assert.equal(node.minimum_raise_to_bb, node.facing_size_bb === 100 ? null : node.facing_size_bb + node.last_raise_increment_bb);
    assert.ok(node.all_in.every(seat => node.live_participants.includes(seat) && node.contributions_bb[seat] === 100));
    if (node.bet_level === 3) {
      const size = node.action_sizes_bb.four_bet;
      assert.equal(size, node.family === "two_caller_squeeze" ? 30 : node.family === "squeeze" ? squeezeFourBetToSize(node.hero, node.squeezer) : fourBetToSize(node.hero, node.three_bettor));
      assert.ok(size >= node.minimum_raise_to_bb && size < 100);
      assert.equal(size === 30, node.family === "two_caller_squeeze");
    }
    if (node.bet_level === 4) {
      assert.equal(node.action_sizes_bb.all_in, 100);
      assert.ok(100 >= node.minimum_raise_to_bb);
    }
    for (const name of node.legal_actions) {
      const child = choice(node, name);
      const raised = name === "four_bet" || name === "all_in";
      const folds = name === "fold" ? [...node.folded, node.hero] : node.folded;
      const allIn = name === "all_in" || (name === "call" && node.facing_size_bb === 100) ? [...node.all_in, node.hero] : node.all_in;
      assert.deepEqual(child.folded, folds);
      assert.deepEqual(child.all_in, allIn);
      let pending = raised ? cycle(node.hero).filter(seat => !folds.includes(seat) && !allIn.includes(seat)) : node.pending_actors.slice(1);
      if (child.terminal) pending = [];
      assert.deepEqual(child.pending_actors, pending);
      assert.equal(child.bet_level, node.bet_level + Number(raised));
      assert.equal(child.facing_size_bb, raised ? node.action_sizes_bb[name] : node.facing_size_bb);
      assert.equal(child.last_raise_increment_bb, raised ? node.action_sizes_bb[name] - node.facing_size_bb : node.last_raise_increment_bb);
      for (const seat of positions) {
        assert.equal(child.contributions_bb[seat], seat === node.hero && name !== "fold" ? node.action_sizes_bb[name] : node.contributions_bb[seat]);
        const factors = seat === node.hero ? [...node.source_factors[seat], { dataset: node.dataset, spot_id: node.id, action: name }] : node.source_factors[seat];
        assert.deepEqual(child.source_factors[seat], factors);
      }
    }
  }
});

test("turn wrapping revisits prior callers and skips folded or all-in seats", () => {
  const root = findRoot("two_caller_squeeze", "UTG", "HJ", "CO", "BB");
  const utg = first(root), hj = choice(utg, "call"), co = choice(hj, "call");
  assert.deepEqual([utg.hero, hj.hero, co.hero], ["UTG", "HJ", "CO"]);
  const bb = choice(co, "four_bet"), utgAgain = choice(bb, "call"), hjAgain = choice(utgAgain, "call");
  assert.deepEqual([bb.hero, utgAgain.hero, hjAgain.hero], ["BB", "UTG", "HJ"]);
  assert.deepEqual(bb.pending_actors, ["BB", "UTG", "HJ"]);
  const coFacingJam = choice(hjAgain, "all_in");
  assert.equal(coFacingJam.hero, "CO");
  assert.deepEqual(coFacingJam.pending_actors, ["CO", "BB", "UTG"]);
  assert.deepEqual(coFacingJam.all_in, ["HJ"]);
  const bbFacingJam = choice(coFacingJam, "fold"), utgFacingJam = choice(bbFacingJam, "call");
  assert.equal(utgFacingJam.hero, "UTG");
  assert.deepEqual(utgFacingJam.pending_actors, ["UTG"]);
  assert.deepEqual(utgFacingJam.all_in, ["HJ", "BB"]);
  assert.equal(choice(utgFacingJam, "call").terminal, "all_in");
});

test("all pots include exact posted blinds and folded money without hypothetical future calls", () => {
  for (const state of allStates) {
    assert.deepEqual(Object.keys(state.contributions_bb), positions);
    assert.ok(Object.values(state.contributions_bb).every(size => size >= 0 && size <= 100));
    assert.ok(state.contributions_bb.SB >= 0.5);
    assert.ok(state.contributions_bb.BB >= 1);
    assert.equal(state.pot_bb, Object.values(state.contributions_bb).reduce((sum, amount) => sum + amount, 0));
    assert.equal(state.dead_money_bb, state.folded.reduce((sum, seat) => sum + state.contributions_bb[seat], 0));
    if (!state.terminal) {
      assert.equal(state.cost_to_call_bb, state.facing_size_bb - state.contributions_bb[state.hero]);
      assert.ok(state.cost_to_call_bb > 0);
      assert.equal(state.total_pot_after_call_bb, state.pot_bb + state.cost_to_call_bb);
      assert.equal(choice(state, "call").pot_bb, state.total_pot_after_call_bb);
    }
  }
  const early = first(findRoot("squeeze", "UTG", "HJ", "CO"));
  assert.equal(early.pot_bb, 2.5 + 2.5 + 12 + 0.5 + 1);
  assert.equal(early.dead_money_bb, 1.5);
  assert.equal(choice(early, "fold").dead_money_bb, 4);
  const blinds = first(findRoot("squeeze", "UTG", "SB", "BB"));
  assert.equal(blinds.pot_bb, 2.5 + 2.5 + 13);
  assert.equal(blinds.dead_money_bb, 0);
  assert.equal(choice(blinds, "call").action_sizes_bb.four_bet, 24);
  const two = first(findRoot("two_caller_squeeze", "UTG", "HJ", "CO", "BB"));
  assert.equal(two.action_sizes_bb.four_bet, twoCallerFourBetToBb);
  assert.equal(two.minimum_raise_to_bb, 28.5);
});

test("terminal leaves settle every actor and never fabricate further decisions", () => {
  for (const leaf of continuationTerminals) {
    assert.deepEqual(leaf.pending_actors, []);
    assert.equal(leaf.live_participants.length === 1, leaf.terminal === "uncontested");
    if (leaf.terminal === "all_in") {
      assert.ok(leaf.all_in.length >= 2);
      assert.ok(leaf.live_participants.every(seat => leaf.contributions_bb[seat] === 100));
    }
    if (leaf.terminal === "flop") {
      assert.equal(leaf.all_in.length, 0);
      assert.ok(leaf.live_participants.every(seat => leaf.contributions_bb[seat] === leaf.facing_size_bb));
    }
    assert.equal(Object.hasOwn(leaf, "hero"), false);
    assert.equal(Object.hasOwn(leaf, "legal_actions"), false);
  }
});

test("zero-action histories stay in the structure with precise placeholder source descriptors", () => {
  assert.deepEqual(continuationPlaceholderContract, {
    structural_zero_action_branches: "retained", zero_hero_reach_or_history_reach: "fold100",
    conditional_frequencies: true, absent_or_malformed_source: "error",
  });
  const file = JSON.parse(readFileSync(new URL("../src/estimated/preflop-ranges.json", import.meta.url), "utf8"));
  const sb = file.spots.find(spot => spot.id === "SB_vs_UTG");
  assert.ok(sb.hands.every(row => row.call === 0));
  const root = findRoot("squeeze", "UTG", "SB", "BB");
  assert.equal(byRoot(continuationSpots, root).length, 22);
  for (const node of byRoot(all_decisions, root)) {
    assert.deepEqual(node.source_factors.SB[0], { dataset: "preflop-ranges", spot_id: "SB_vs_UTG", action: "call" });
    assert.equal(Object.hasOwn(node, "hands"), false);
    assert.equal(Object.hasOwn(node, "unreachable"), false);
    // The generator, not this catalog, resolves a valid zero source to fold100.
    // Keeping every decision lets validators reject missing source rows rather
    // than quietly mistaking them for a zero-frequency source action.
    for (const factors of Object.values(node.source_factors)) {
      assert.ok(factors.every(ref => typeof ref.dataset === "string" && typeof ref.spot_id === "string" && typeof ref.action === "string"));
    }
  }
});
