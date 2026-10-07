// Offline self-play/chip-flow verification of three dedicated saved policies.
// No HU reference bot, profile overlay, EV recommendation, or policy editing.
import { seededRandom, seedFor } from '../lib/equity.ts';
import { mw3BoardRanges } from './mw3-audit.mjs';
import { makeMw3TupleSampler } from './mw3-joint-defence.mjs';
import { playMw3WithPolicies } from './mw3-runtime.mjs';
import { setMw3RankingCacheLimit } from './mw3-hand-features.mjs';
import { parseCards } from './model.ts';
import { mw3Sha } from './mw3-inputs.mjs';
import pilot from '../data/postflop-ai-pilot.json' with { type: 'json' };
export const MW3_SIMULATION_VERSION = 1;
export const MW3_SIMULATION_SAMPLES = pilot.samples_per_board_profile_seat;

export function simulateMw3(inputs, policies, { samplesPerBoard = MW3_SIMULATION_SAMPLES,
  boardList = pilot.boards, onBoard = () => {} } = {}) {
  if (!Number.isInteger(samplesPerBoard) || samplesPerBoard < MW3_SIMULATION_SAMPLES) throw new Error('mw3 simulation cannot reduce the existing 10,000 samples per board');
  if (!Array.isArray(boardList) || !boardList.length || new Set(boardList.map(item => item?.cards)).size !== boardList.length ||
      boardList.some(item => !item || !['design', 'holdout'].includes(item.split))) throw new Error('Invalid mw3 simulation board list');
  const fullRepresentativeScope = JSON.stringify(boardList) === JSON.stringify(pilot.boards);
  const previousLimit = setMw3RankingCacheLimit(2048), results = [];
  try {
    for (const descriptor of boardList) {
      const flop = parseCards(descriptor.cards, 3), ranges = mw3BoardRanges(inputs, flop), sample = makeMw3TupleSampler(ranges, inputs.spot.seats);
      const seed = `mw3-simulation-v1|${inputs.fingerprint}|${descriptor.cards}`, random = seededRandom(seedFor(seed));
      const counts = { flop: {}, turn: {}, river: {} }, wins = Object.fromEntries(inputs.spot.seats.map(seat => [seat, 0]));
      let ties = 0, foldTerminals = 0, allInTerminals = 0, rakeTotal = 0;
      const finalStackTotals = Object.fromEntries(inputs.spot.seats.map(seat => [seat, 0]));
      for (let index = 0; index < samplesPerBoard; index++) {
        const hands = sample(random), blocked = new Set([...flop, ...Object.values(hands).flat()]);
        const available = Array.from({ length: 52 }, (_, card) => card).filter(card => !blocked.has(card));
        const turn = available.splice(Math.floor(random() * available.length), 1)[0];
        const river = available.splice(Math.floor(random() * available.length), 1)[0];
        const result = playMw3WithPolicies(inputs, policies, { hands, board: [...flop, turn, river], random });
        if (result.status !== 'done') throw new Error('mw3 self-play unexpectedly awaits input');
        const settlement = result.settlement;
        if (settlement.winners.length > 1) ties++; else wins[settlement.winner]++;
        if (result.table.streetState.end.type === 'fold') foldTerminals++;
        if (result.table.log.some(event => event.stackBb > 0 && event.amountBb >= event.stackBb)) allInTerminals++;
        rakeTotal += settlement.rakeBb;
        for (const seat of inputs.spot.seats) finalStackTotals[seat] += settlement.finalStacks[seat];
        for (const event of result.table.log) counts[event.street][event.action] = (counts[event.street][event.action] ?? 0) + 1;
      }
      const row = { board: descriptor.cards, split: descriptor.split, samples: samplesPerBoard, seed, wins, ties,
        foldTerminals, allInTerminals, rakeTotal, finalStackTotals, actionCounts: counts };
      results.push(row); onBoard(row);
    }
  } finally { setMw3RankingCacheLimit(previousLimit); }
  return { version: MW3_SIMULATION_VERSION, sourceHash: inputs.fingerprint, spot: inputs.spot.id,
    flopHash: mw3Sha(policies.flop), laterHash: mw3Sha(policies.later), samplesPerBoard, fullRepresentativeScope,
    tupleSampling: 'full_three_player_tuple_rejection', policyInterpretation: 'direct_saved_mix_with_observable_alias_sum',
    purpose: 'deterministic_self_play_chip_flow_not_ev_or_equilibrium_approval', results };
}
