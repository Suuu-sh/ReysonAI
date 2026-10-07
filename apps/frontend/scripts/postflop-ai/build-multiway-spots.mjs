// Explicit offline catalog projection; never authors or edits preflop frequencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { continuationTerminals, continuationRoots } from '../../src/estimated/continuation-tree.ts';
import { createContinuationModel, hasCompatibleDeal, continuationCombos } from '../../src/estimated/continuation-model.ts';
import { isInPosition } from '../../src/estimated/sizing.ts';
import { seededRandom, seedFor } from '../lib/equity.ts';

const sourceNames = ['opening-ranges', 'preflop-ranges', 'multiway-responses', 'multiway2-responses', 'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses', 'continuation-responses'];
const roots = new Map(continuationRoots.map(root => [root.id, root]));
const token = { three_bet: '3bet', four_bet: '4bet', all_in: 'allin' };
export const historySpotId = history => history.filter(item => !item.forced).map(item => `${item.seat}_${token[item.action] ?? item.action}`).join('_');

// Importance sampling from each participant's action-weighted range. The
// rejection fraction corrects card collisions. Forced outside folds have no
// saved range and are explicitly unweighted. This is a ranking estimate only.
function reachEstimate(id, ranges, samples = 32768) {
  const random = seededRandom(seedFor(`hu-multiway-reach-v1|${id}`));
  const tables = ranges.map(range => {
    let mass = 0;
    const combos = range.flatMap(([hand, weight]) => continuationCombos(hand).map(combo => ({ combo, upto: mass += weight })));
    return { combos, mass };
  });
  let legal = 0;
  for (let n = 0; n < samples; n++) {
    const used = new Set(); let compatible = true;
    for (const { combos, mass } of tables) {
      const draw = random() * mass; let lo = 0, hi = combos.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (combos[mid].upto > draw) hi = mid; else lo = mid + 1; }
      for (const card of combos[lo].combo) { if (used.has(card)) compatible = false; used.add(card); }
    }
    if (compatible) legal++;
  }
  const scale = tables.reduce((p, { mass }, i) => p * mass / ((52 - i * 2) * (51 - i * 2) / 2), 1);
  return { probability: scale * legal / samples, samples, compatible_samples: legal, method: 'seeded-participant-range-products-collision-corrected-v1; forced outside folds unweighted' };
}

export function buildMultiwayCatalog(datasets, { aLimit = 40, bLimit = 0, reachSamples = 32768 } = {}) {
  const model = createContinuationModel(datasets), eligible = [], omitted = [];
  for (const terminal of continuationTerminals.filter(t => t.terminal === 'flop' && t.live_participants.length === 2)) {
    const weighted = terminal.participants.map(seat => [...model.weights(terminal.source_factors[seat])].filter(([, w]) => w > 0));
    const id = historySpotId(terminal.history);
    if (!weighted.every(rows => rows.length) || !weighted[0].some(([hand]) => hasCompatibleDeal(hand, weighted.slice(1)))) {
      omitted.push({ id, terminalId: terminal.id, reason: 'zero saved action support or no compatible participant hole cards' }); continue;
    }
    const root = roots.get(terminal.root_id), aggressor = terminal.history.findLast(item => ['squeeze', 'three_bet', 'four_bet'].includes(item.action)).seat;
    const [a, b] = terminal.live_participants, ip = isInPosition(a, b) ? a : b, oop = ip === a ? b : a;
    const ranges = Object.fromEntries(terminal.participants.map(seat => [seat, terminal.source_factors[seat].map(f => [f.dataset, f.spot_id, f.action])]));
    const stage = terminal.bet_level === 3 || terminal.family === 'cold_four_bet' ? 'A' : 'B';
    eligible.push({ id, kind: terminal.family === 'cold_four_bet' ? 'c4bp' : terminal.family === 'three_bet_cold_call' ? 'ccp' : 'sqp',
      opener: root.opener, caller: terminal.live_participants.find(seat => seat !== aggressor), aggressor, ip, oop,
      tree: aggressor === oop ? 'oop_leads' : 'oop_checks', openingId: `${root.opener}_open`, responseId: terminal.parent_id,
      openBb: root.open_size_bb, potBb: terminal.pot_bb, stackBb: 100 - terminal.contributions_bb[ip],
      slug: `${id.toLowerCase().replaceAll('_', '-')}-hu-v1`, reachable: true, stage,
      terminalId: terminal.id, history: terminal.history.filter(item => !item.forced).map(({ seat, action, to_size_bb }) => ({ seat, action, to_size_bb })),
      contributionsBb: terminal.contributions_bb, ranges,
      reach: reachEstimate(id, weighted, reachSamples) });
  }
  if (new Set(eligible.map(s => s.id)).size !== eligible.length) throw new Error('Duplicate HU history ID');
  const a = eligible.filter(s => s.stage === 'A').sort((x,y) => y.reach.probability - x.reach.probability);
  const b = eligible.filter(s => s.stage === 'B').sort((x,y) => y.reach.probability - x.reach.probability);
  return { version: 1, structural: eligible.length + omitted.length, reachable: eligible.length,
    stageA: a.length, stageB: b.length, spots: [...a.slice(0, aLimit), ...b.slice(0, bLimit)],
    deferred: [...a.slice(aLimit).map(({ id, terminalId, reach }) => ({ id, terminalId, reach, reason: 'Stage A reach-ranked beyond selected limit; no authored policy yet' })), ...b.slice(bLimit).map(({ id, terminalId, reach }) => ({ id, terminalId, reach, reason: 'Stage B reach-ranked; no authored policy yet' }))], omitted };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const datasets = Object.fromEntries(sourceNames.map(name => [name, JSON.parse(readFileSync(new URL(`../../src/estimated/${name}.json`, import.meta.url)))]));
  const catalog = buildMultiwayCatalog(datasets);
  writeFileSync(new URL('../data/hu-after-multiway-spots.json', import.meta.url), JSON.stringify(catalog, null, 2) + '\n');
  console.log(JSON.stringify({ structural: catalog.structural, reachable: catalog.reachable, A: catalog.stageA, B: catalog.stageB, selected: catalog.spots.length }));
}
