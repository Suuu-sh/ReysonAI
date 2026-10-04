// Test-only historical policy readers and bounded full-range numerical probes.
// These archives are preservation evidence, never policy/release approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodeArchive } from '../../scripts/postflop-ai/reviewed-postflop-archive.mjs';
import { defenceFor, replayDecision } from '../../scripts/postflop-ai/defence.mjs';
import { parseCards } from '../../scripts/postflop-ai/model.mjs';

export const REPRESENTATIVE = 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveRoot = new URL('../../../../artifacts/postflop/', import.meta.url);
export const FOUNDATION_HASH = 'e74de8b1cfb9349d20f0e328c6d7c3f36220c0ec533eae1b01e1f6635cca45fe';
export const FOUNDATION_MANIFEST_HASH = '29e8f902289c5420b2c14dbf3bf7fd32effe975cafa14844d5b012eb74012dca';
export const LEGACY_HASH = '5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a';

export function foundationPair() {
  const manifestBytes = readFileSync(new URL('hu-after-multiway-foundation-v3.manifest.json', archiveRoot));
  assert.equal(bytesHash(manifestBytes), FOUNDATION_MANIFEST_HASH);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.approval, 'unapproved');
  assert.equal(manifest.archive.sha256, FOUNDATION_HASH);
  const bodies = decodeArchive(readFileSync(new URL('hu-after-multiway-foundation-v3.tar.gz', archiveRoot)), manifest);
  return Object.fromEntries(manifest.artifacts.filter(item => item.spot === REPRESENTATIVE && ['candidate', 'laterCandidate', 'report'].includes(item.kind))
    .map(item => [item.kind, JSON.parse(bodies.get(item.path))]));
}

export function legacyPairs() {
  const zip = fileURLToPath(new URL('legacy-hu45-source.zip', archiveRoot));
  assert.equal(bytesHash(readFileSync(zip)), LEGACY_HASH);
  const result = spawnSync('python3', ['-B', '-c', `import hashlib,json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 p='ReysonAI-HU45-readonly-2026-10-04/'
 m=json.loads(z.read(p+'manifest.json')); out={}
 for r in m['records']:
  pair={}
  for kind in ['candidate','later_candidate']:
   item=r[kind]; body=z.read(p+'payload/'+item['file'])
   assert len(body)==item['bytes'] and hashlib.sha256(body).hexdigest()==item['sha256']
   pair['laterCandidate' if kind=='later_candidate' else kind]=json.loads(body)
  out[r['spot_id']]=pair
 assert len(out)==45
 print(json.dumps(out,separators=(',',':')))
`, zip], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

export const riverCases = [
  { id: 'high-flop125', board: 'Ac7d2h9hJd', path: { flop: ['bet125', 'call'], turn: ['check', 'check'], river: ['bet33'] }, selected: '8c8d' },
  { id: 'flush-checked', board: 'AcKc4c6s9c', path: { flop: ['check', 'check'], turn: ['check', 'check'], river: ['bet33'] }, selected: '7d7h' },
  { id: 'flush-merged-shove', board: 'AcKc4c6s9c', path: { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['allin'] }, selected: 'AdTd' },
  { id: 'flush-flop125', board: 'AcKc4c6s9c', path: { flop: ['bet125', 'call'], turn: ['check', 'check'], river: ['bet33'] }, selected: 'AdTd' },
  { id: 'paired-oop-value-only', board: '7c5d5h3c8s', path: { flop: ['check', 'check'], turn: ['check', 'check'], river: ['bet75'] }, selected: 'Ad9d' },
  { id: 'paired-ip-merged-shove', board: '7c5d5h3c8s', path: { flop: ['check', 'check'], turn: ['bet75', 'call'], river: ['check', 'bet75'] }, selected: 'Ac2c' },
  { id: 'positive-equity-floor-control', board: '7c5d5hTs6h', path: { flop: ['check', 'check'], turn: ['check', 'check'], river: ['check', 'bet33'] }, selected: 'AcKc' },
];
export const nonriverCases = [
  { id: 'flop-control', board: 'As7d2c', path: { flop: ['bet33'] } },
  { id: 'turn-control', board: 'AcKc4c6s', path: { flop: ['check', 'check'], turn: ['bet75'] } },
];
export function legacyCase(inputs) {
  return { board: '7c5d5h3c8s', path: { flop: inputs.spot.tree === 'oop_leads' ? ['check', 'check'] : ['check'], turn: ['check', 'check'], river: ['bet33'] } };
}

export function probe(inputs, pair, item) {
  const board = parseCards(item.board, item.board.length / 2);
  const table = replayDecision(inputs, board, item.path), entry = table.log.at(-1);
  const defence = defenceFor(inputs, pair.candidate.policy, pair.laterCandidate.policy);
  const context = defence.context(table, board, entry.node);
  if (!context) return { defence, table, board, entry, context, rows: [], summary: null };
  const summary = defence.summarize(context);
  const rows = summary.defenders.map(item => {
    const combo = [Math.floor(item.id / 52), item.id % 52];
    const base = defence.baseMix(table, board, entry.node, combo);
    const capped = context.cap ? context.cap.applyCombo(base, combo) : base;
    return { id: item.id, weight: item.weight, equity: item.equity, base, capped,
      raw: defence.applyEquity(context, capped, item.equity, combo, true),
      mix: defence.mix(table, board, entry.node, combo, base) };
  });
  return { defence, table, board, entry, context, rows, summary };
}

export function numericGolden(result) {
  if (!result.context) return { context: null };
  const { rows, summary, context } = result;
  const zero = rows.filter(item => item.equity === 0);
  const total = summary.defenderTotal;
  const called = zero.reduce((sum, item) => sum + item.weight * item.mix.call / 100, 0);
  const rawCalled = zero.reduce((sum, item) => sum + item.weight * item.raw.call / 100, 0);
  const floor = context.floor && { threshold: String(context.floor.threshold), fraction: context.floor.fraction };
  return { rows_hash: hash(rows), positive_rows_hash: hash(rows.filter(item => item.equity > 0)),
    raw_rows_hash: hash(rows.map(({ mix, ...item }) => item)),
    raises_hash: hash(rows.map(item => [item.id, item.mix.raise ?? null])),
    combos: rows.length, zero_combos: zero.length, zero_called_mass: called / total, zero_raw_called_mass: rawCalled / total,
    defence_frequency: summary.defenceFrequency, floor, call: context.call, required: context.required, mdf: context.mdf,
    defender_total: total, value_weight: summary.valueWeight, bluff_weight: summary.bluffWeight };
}
