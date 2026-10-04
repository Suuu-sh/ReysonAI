// Test-only historical policy readers and bounded full-range numerical probes.
// These archives are preservation evidence, never policy/release approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { decodeArchive } from '../../scripts/postflop-ai/reviewed-postflop-archive.mjs';
import { defenceFor, replayDecision, rankTable, comboId } from '../../scripts/postflop-ai/defence.mjs';
import { parseCards } from '../../scripts/postflop-ai/model.mjs';

export const REPRESENTATIVE = 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveRoot = new URL('../../../../artifacts/postflop/', import.meta.url);
export const FOUNDATION_HASH = 'e74de8b1cfb9349d20f0e328c6d7c3f36220c0ec533eae1b01e1f6635cca45fe';
export const FOUNDATION_MANIFEST_HASH = '29e8f902289c5420b2c14dbf3bf7fd32effe975cafa14844d5b012eb74012dca';
export const LEGACY_HASH = '5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a';

function readFoundation() {
  const manifestBytes = readFileSync(new URL('hu-after-multiway-foundation-v3.manifest.json', archiveRoot));
  assert.equal(bytesHash(manifestBytes), FOUNDATION_MANIFEST_HASH);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.approval, 'unapproved');
  assert.equal(manifest.archive.sha256, FOUNDATION_HASH);
  const bodies = decodeArchive(readFileSync(new URL('hu-after-multiway-foundation-v3.tar.gz', archiveRoot)), manifest);
  return { manifest, bodies };
}

export function foundationCandidateFiles() {
  const { manifest, bodies } = readFoundation();
  return manifest.artifacts.filter(item => item.spot === REPRESENTATIVE && ['candidate', 'laterCandidate'].includes(item.kind))
    .map(item => ({ ...item, body: bodies.get(item.path) }));
}

export function foundationPair() {
  const { manifest, bodies } = readFoundation();
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
// Actual engine paths to the initial bettor's response to a river raise.
// They preserve each saved action label, including stack/merge bookkeeping.
export const riverRaiseCases = ['7c5d5hJh3h', 'AcKc4c6s9c', '7c5d5hTs6h'].flatMap(board =>
  ['oop', 'ip'].map(role => ({ id: `raise-${role}-${board}`, board,
    path: { flop: ['check', 'check'], turn: ['check', 'check'], river: [...(role === 'ip' ? ['check'] : []), 'bet33', 'raise'] } })));

// Independent test reference: base-2 string expansion instead of the production
// IEEE bit decoder. Do not use rounded cached equity to classify real support.
export function exactCallEvidence(context, id) {
  const fraction = value => {
    const [whole, tail = ''] = value.toString(2).split('.');
    return { n: BigInt(`0b${whole}${tail}`), e: tail.length };
  };
  const score = rankTable(context.board).score, hero = [Math.floor(id / 52), id % 52], rows = [];
  for (let i = 0; i < context.bettorRange.ids.length; i++) {
    const other = context.bettorRange.ids[i], cards = [Math.floor(other / 52), other % 52];
    if (!(context.bettorRange.w[i] > 0) || cards.some(card => hero.includes(card) || context.board.includes(card))) continue;
    assert.ok(score[other] >= 0 && score[id] >= 0);
    rows.push({ ...fraction(context.bettorRange.w[i]), outcome: score[id] > score[other] ? 2 : score[id] === score[other] ? 1 : 0 });
  }
  if (!rows.length) return { status: 'unknown' };
  const exponent = Math.max(...rows.map(row => row.e));
  let total = 0n, payout = 0n;
  for (const row of rows) { const weight = row.n << BigInt(exponent - row.e); total += weight; payout += weight * BigInt(row.outcome); }
  const net = fraction(context.finalPot - context.rake), cost = fraction(context.call), chips = Math.max(net.e, cost.e);
  const numerator = payout * (net.n << BigInt(chips - net.e)) - 2n * total * (cost.n << BigInt(chips - cost.e));
  return { status: 'known', sign: numerator < 0n ? -1 : numerator > 0n ? 1 : 0,
    compatible: rows.length, wins: rows.filter(row => row.outcome === 2).length, ties: rows.filter(row => row.outcome === 1).length };
}
export function legacyCase(inputs) {
  return { board: '7c5d5h3c8s', path: { flop: inputs.spot.tree === 'oop_leads' ? ['check', 'check'] : ['check'], turn: ['check', 'check'], river: ['bet33'] } };
}

export function probe(inputs, pair, item, { disableNegativeRiverFloor = false } = {}) {
  // A separate model instance preserves identical observable ranges/chip rules
  // while disabling only the scoped floor exemption for its causal control.
  if (disableNegativeRiverFloor) inputs = { ...inputs };
  const board = parseCards(item.board, item.board.length / 2);
  const table = replayDecision(inputs, board, item.path), entry = table.log.at(-1);
  const defence = defenceFor(inputs, pair.candidate.policy, pair.laterCandidate.policy);
  if (disableNegativeRiverFloor) defence.negativeRiverCallEv = () => false;
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

// Real preserved-v3 support, shared ranks and independent sparse arrays. Only
// exact cache allocation differs between probe arms; no policy/range is cloned to Git.
export function exactCacheFixture(inputs, pair, model, count = 512) {
  const p = probe(inputs, pair, riverCases.find(item => item.id === 'flush-checked'));
  const table = rankTable(p.board), contexts = Array.from({ length: count }, (_, index) => ({
    key: `exact-cache-${index}`, street: 'river', board: p.board, tables: [table],
    call: p.context.call, finalPot: p.context.finalPot, rake: p.context.rake, required: p.context.required,
    floor: { ...p.context.floor }, ceiling: p.context.ceiling,
    bettorRange: Object.fromEntries(['ids', 'lo', 'hi', 'w'].map(key => [key, p.context.bettorRange[key].slice()])),
  }));
  const residualIds = new Set(['TdTh', 'TdTs', 'ThTs'].map(text => comboId(...parseCards(text, 2))));
  const selected = [...p.rows.filter(row => residualIds.has(row.id)),
    ...[...p.rows].sort((a, b) => b.equity - a.equity).slice(0, 4)];
  assert.ok(selected.length >= 4);
  const heroes = selected.map(row => ({ id: row.id, combo: [Math.floor(row.id / 52), row.id % 52], base: row.capped, equity: row.equity }));
  for (const context of contexts) model.contexts.river.set(context.key, context);
  return { contexts, heroes, source: p };
}

export function exactCacheObservation(model, context, heroes) {
  return heroes.map(hero => {
    const negative = model.negativeRiverCallEv(context, hero.combo);
    const raw = model.applyEquity(context, hero.base, hero.equity, hero.combo, true);
    const mix = model.applyEquity(context, hero.base, hero.equity, hero.combo);
    return { id: hero.id, negative, sign: context.exactRiverCallEv.signs.get(hero.id), raw, mix };
  });
}
