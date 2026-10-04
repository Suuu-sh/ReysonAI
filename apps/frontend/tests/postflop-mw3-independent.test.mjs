// Independent, read-only state-machine review: traverse every reachable chip geometry
// through all three streets. This proves structural coverage, not strategy reach or GTO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMw3Catalog } from '../scripts/postflop-ai/mw3-spots.mjs';
import { applyMw3Action, assertMw3Conservation, createMw3Table, mw3Decision,
  settleMw3, startMw3Street } from '../scripts/postflop-ai/mw3-engine.mjs';
import { describeMw3Node } from '../scripts/postflop-ai/mw3-tree.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';

const data = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const catalog = buildMw3Catalog({ opening: data('opening-ranges'), responses: data('preflop-ranges'),
  multiway: data('multiway-responses') });
const cent = value => Math.round(value * 100);
const clone = table => ({ ...table, stacks: { ...table.stacks }, invested: { ...table.invested },
  folded: [...table.folded], log: [...table.log],
  path: Object.fromEntries(Object.entries(table.path).map(([street, actions]) => [street, [...actions]])),
  streetState: { ...table.streetState, committed: { ...table.streetState.committed },
    pending: [...table.streetState.pending] } });
const geometryKey = table => JSON.stringify([table.pot, table.stacks, table.invested, table.folded,
  table.street, table.streetState, table.lastAggressor, table.winner]);

for (const potBb of [8, 8.5, 9]) {
  test(`independent mw3 complete three-street traversal: initial pot ${potBb}BB`, t => {
    const spot = catalog.find(item => item.reachable && item.potBb === potBb);
    assert.ok(spot, `Missing real source geometry for ${potBb}BB`);
    const board = parseCards('As7d2c3h4h', 5);
    const holecards = ['KhQd', 'AhAd', '7c7h'];
    const hands = Object.fromEntries(spot.seats.map((seat, i) => [seat, parseCards(holecards[i], 2)]));
    const seen = new Set(), nodeActions = new Map();
    let edges = 0, terminals = 0;
    function visit(table) {
      const key = geometryKey(table);
      if (seen.has(key)) return;
      seen.add(key);
      assert.ok(seen.size < 200000, 'Traversal must complete within its explicit state bound');
      assertMw3Conservation(table);
      const decision = mw3Decision(table);
      if (decision.end) {
        assert.equal(table.streetState.pending.length, 0);
        if (table.winner || table.street === 'river' || decision.end.type === 'all_in_runout') {
          terminals++;
          const result = settleMw3(table, hands, board);
          assert.ok(result.winners.every(seat => !table.folded.includes(seat)));
          assert.ok(Math.abs(Object.values(result.finalStacks).reduce((a, b) => a + b, 0)
            + result.rakeBb - table.initialTotal) < 1e-8);
          return;
        }
        const next = clone(table);
        startMw3Street(next, table.street === 'flop' ? 'turn' : 'river');
        visit(next);
        return;
      }
      assert.ok(!table.folded.includes(decision.seat));
      assert.ok(table.stacks[decision.seat] > 0);
      assert.deepEqual(decision.actions, describeMw3Node(decision.node).actions);
      if (nodeActions.has(decision.node)) assert.deepEqual(decision.actions, nodeActions.get(decision.node));
      nodeActions.set(decision.node, decision.actions);
      const state = table.streetState, seat = decision.seat;
      if (!decision.facing) {
        const maxRequested = Math.round(cent(table.pot) * 1.25);
        assert.equal(decision.actions.includes('allin'), maxRequested * 100 >= cent(table.stacks[seat]) * 67,
          `Explicit all-in must match the canonical bet125 merge: ${JSON.stringify(table.path)}`);
      }
      if (decision.actions.includes('raise')) {
        assert.ok(cent(table.stacks[seat]) + cent(state.committed[seat]) > cent(state.currentBet),
          `Cannot offer raise into an equal-budget all-in: ${JSON.stringify(table.path)}`);
      }
      for (const action of decision.actions) {
        edges++;
        const next = clone(table);
        let expected = 0;
        if (action === 'call') expected = cent(state.currentBet) - cent(state.committed[seat]);
        else if (!['check', 'fold'].includes(action)) {
          const limit = cent(table.stacks[seat]);
          const requested = action === 'raise' ? 3 * cent(state.currentBet) - cent(state.committed[seat])
            : action === 'allin' ? limit : Math.round(cent(table.pot) * { bet33: 0.33, bet75: 0.75, bet125: 1.25 }[action]);
          expected = requested * 100 >= limit * 67 ? limit : Math.min(limit, requested);
        }
        assert.doesNotThrow(() => applyMw3Action(next, action),
          `${spot.id}: ${JSON.stringify(table.path)} → ${action}`);
        const witness = `${spot.id}: ${JSON.stringify(table.path)} → ${action}; pot=${table.pot}`;
        assert.equal(cent(next.pot) - cent(table.pot), expected, witness);
        assert.equal(cent(table.stacks[seat]) - cent(next.stacks[seat]), expected, witness);
        visit(next);
      }
    }
    const initial = createMw3Table(spot);
    startMw3Street(initial, 'flop');
    visit(initial);
    assert.ok(terminals > 10000);
    for (const street of ['flop', 'turn', 'river']) assert.ok([...nodeActions.keys()].some(node => node.startsWith(`mw3_${street}_`)));
    t.diagnostic(JSON.stringify({ spot: spot.id, uniqueStates: seen.size, actionEdges: edges,
      terminalStates: terminals, nodes: nodeActions.size }));
  });
}
