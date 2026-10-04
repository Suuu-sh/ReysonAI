// Read-only research probe: no policy, report, fingerprint or production writes.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadInputs, artifactPaths } from './inputs.mjs';
import { loadCandidate, loadLaterCandidate } from './generate.mjs';
import { defenceFor, replayDecision, comboId, defenceVersionFor } from './defence.mjs';
import { parseFlopBoard, handTier, flopTextureKeys } from './model.mjs';
import { captureSourceGraph, identityHash } from './audit-identity.mjs';

const cardText = card => '23456789TJQKA'[card >> 2] + 'cdhs'[card & 3];
const round = n => Number(n.toFixed(8));
const record = path => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; };

export function diagnoseFlop({ spot = 'BTN_open_BB_call', boardText = '8s5d2c', bettorRole = 'ip' } = {}) {
  if (!['ip', 'oop'].includes(bettorRole)) throw new Error('bettorRole must be ip or oop');
  const inputs = loadInputs(spot), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
  if (bettorRole === 'oop' && inputs.spot.tree !== 'oop_leads') throw new Error('This spot does not support an OOP lead');
  const board = parseFlopBoard(boardText), policy = candidate.policy, defence = defenceFor(inputs, policy, later?.policy);
  const source = captureSourceGraph({ roots: ['apps/frontend/scripts/postflop-ai/diagnose-low-flop-defence.mjs'] });
  const files = artifactPaths(inputs.spot);
  const artifactBefore = [record(files.candidate), ...(later ? [record(files.laterCandidate)] : [])];
  const nodes = [];
  for (const action of ['bet33', 'bet75', 'bet125']) {
    const path = { flop: bettorRole === 'ip' && inputs.spot.tree === 'oop_leads' ? ['check', action] : [action] };
    const table = replayDecision(inputs, board.cards, path), node = table.log.at(-1).node;
    const context = defence.context(table, board.cards, node);
    if (!context) throw new Error(`No context: ${node}`);
    const items = defence.rangeItems(table, board.cards, context.defender);
    const weights = defence.rangeOf(table, board.cards, context.defender);
    defence.prime(context, weights);
    const floor = defence.floorOf(context), ceiling = defence.ceilingOf(context);
    const combos = items.map(({ combo, weight }) => {
      const base = defence.baseMix(table, board.cards, node, combo);
      const capped = context.cap ? context.cap.applyCombo(base, combo) : base;
      const equity = defence.equity(context, combo);
      const realization = defence.realizationFor(context, combo);
      const raw = equity === null ? capped : defence.applyEquity(context, capped, equity, combo, true);
      const actual = defence.mix(table, board.cards, node, combo, base);
      return { cards: combo.map(cardText).join(''), tier: handTier(combo, board.cards), weight: round(weight), equity: equity === null ? null : round(equity), realization, realized: equity === null ? null : round(equity * realization), required: round(context.required), base, raw, actual, floor_added_call_pp: actual.call - raw.call };
    });
    const total = items.reduce((sum, x) => sum + x.weight, 0);
    const frequency = name => Object.fromEntries(['fold','call','raise'].map(action => [action, round(combos.reduce((sum,x)=>sum+x.weight*(x[name][action]??0),0)/total)]));
    const tiers = Object.fromEntries([...new Set(combos.map(x=>x.tier))].map(tier => {
      const rows=combos.filter(x=>x.tier===tier), w=rows.reduce((sum,x)=>sum+x.weight,0);
      return [tier,{weight:round(w),raw_call:round(rows.reduce((sum,x)=>sum+x.weight*x.raw.call,0)/w),actual_call:round(rows.reduce((sum,x)=>sum+x.weight*x.actual.call,0)/w)}];
    }));
    nodes.push({ node, path, bettor: context.bettor, defender: context.defender, role: context.role, can_raise: context.target.canRaise, actual_bet_bb: context.wager, pot_before_bb: context.potBefore, call_bb: context.call, required: context.required, mdf: context.mdf, floor, ceiling, capped: context.capped, total_defender_weight: round(total), frequencies: { base: frequency('base'), raw: frequency('raw'), actual: frequency('actual') }, tiers, combos });
  }
  const artifactAfter=artifactBefore.map(x=>record(x.path));
  if(JSON.stringify(artifactBefore)!==JSON.stringify(artifactAfter))throw new Error('Policy bytes changed during read-only probe');
  return {schema_version:1,kind:'read_only_diagnostic_not_gto',spot,board:board.id,texture:flopTextureKeys(board.cards),defence_version:defenceVersionFor(inputs),source_fingerprint:inputs.fingerprint,policy_hash:candidate.metadata.policy_hash,later_policy_hash:later?.metadata.policy_hash??null,source_graph:source,source_graph_sha256:identityHash(source),artifacts:artifactBefore,nodes};
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [spot, boardText, bettorRole] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(diagnoseFlop({spot,boardText,bettorRole}),null,2)+'\n');
}
