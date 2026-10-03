import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { hands } from '../src/data.ts';
import { positions } from '../src/estimated/sizing.ts';
import { EQR, MULTIWAY_EQR, THREE_BETTOR_BEHIND_EQR, equityRealization } from '../src/estimated/eqr.ts';

test('four-way and original-3bettor-behind EQR preserve exhaustive Python/TypeScript parity', () => {
  const cases = [];
  for (const hand of hands) for (const hero of positions) {
    const others = positions.filter(p => p !== hero);
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) for (let k = j + 1; k < others.length; k++) {
      const opponents = [others[i], others[j], others[k]];
      cases.push([hand, hero, opponents, false, false, false, false, false, false]);
      if (hero === 'SB' && !opponents.includes('BB')) cases.push([hand, hero, opponents, false, true, false, false, false, false]);
      if (hero === 'BTN' && opponents.every(p => positions.indexOf(p) < positions.indexOf(hero))) cases.push([hand, hero, opponents, false, false, false, false, true, false]);
    }
    for (const opponent of others) cases.push([hand, hero, [opponent], false, false, false, false, false, true]);
  }
  const code = "import sys,json; sys.path.insert(0,'scripts'); from eqr import equity_realization; print(json.dumps([equity_realization(*c) for c in json.load(sys.stdin)]))";
  const result = spawnSync('python3', ['-c', code], { cwd: new URL('..', import.meta.url), input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 8 << 20 });
  assert.equal(result.status, 0, result.stderr);
  const actual = cases.map(([hand, hero, opponents, allIn, bbBehind, callerBehind, openerBehind, coldCallBehind, threeBettorBehind]) => equityRealization(hand, hero, opponents, { allIn, bbBehind, callerBehind, openerBehind, coldCallBehind, threeBettorBehind }));
  assert.deepEqual(JSON.parse(result.stdout), actual);
  assert.equal(equityRealization('AA', 'BTN', ['UTG', 'HJ', 'CO']), EQR.pair[0] * MULTIWAY_EQR ** 2);
  assert.equal(equityRealization('AA', 'UTG', ['BTN'], { threeBettorBehind: true }), EQR.pair[1] * THREE_BETTOR_BEHIND_EQR);
  assert.throws(() => equityRealization('AA', 'UTG', ['BTN', 'CO'], { threeBettorBehind: true }));
  assert.throws(() => equityRealization('AA', 'UTG', ['BTN'], { threeBettorBehind: true, callerBehind: true }));
});
