#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_UPSTREAM_SHA = '9d1509fe5077d019825f833eed04b16d342dfda1';
const EXPECTED_UPSTREAM_URL = 'https://github.com/b-inary/postflop-solver';
const CHIP_UNITS_PER_BB = 65_536;
const BOARD = ['Qs', 'Jh', '2h'];
const EXPECTED = {
  board: 'QsJh2h', startingPotBb: 5.5, effectiveStackBb: 97.5,
  raiseLimitCount: 0, betSize: '50% pot', raiseSize: '2.5x previous bet',
  rakeRate: 0, rakeCap: 0, mergingThreshold: 0,
  addAllinThreshold: 0, forceAllinThreshold: 0,
  nodes: [
    { id: 'bb-root', position: 'BB', player: 'OOP', comboCsv: 'strategy-root-oop-bb-combos.csv', classCsv: 'strategy-root-oop-bb-classes.csv', count: 1176, classCount: 169 },
    { id: 'btn-after-check', position: 'BTN', player: 'IP', comboCsv: 'strategy-after-check-ip-btn-combos.csv', classCsv: 'strategy-after-check-ip-btn-classes.csv', count: 690, classCount: 119 },
  ],
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const close = (actual, expected, tolerance = 1e-8) => Math.abs(actual - expected) <= tolerance;

function parseCsv(text, fileName) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (quoted) fail(`${fileName}: unterminated quoted CSV value`);
  if (field.length > 0 || record.length > 0) { record.push(field.replace(/\r$/, '')); records.push(record); }
  if (records.length < 2) fail(`${fileName}: expected header and at least one data row`);
  const [header, ...values] = records;
  if (new Set(header).size !== header.length) fail(`${fileName}: duplicate header`);
  return values.filter((row) => row.some((value) => value !== '')).map((row, index) => {
    if (row.length !== header.length) fail(`${fileName}:${index + 2}: expected ${header.length} fields, got ${row.length}`);
    return Object.fromEntries(header.map((key, col) => [key, row[col]]));
  });
}

function cardId(card) {
  const rank = '23456789TJQKA'.indexOf(card[0]);
  const suit = 'cdhs'.indexOf(card[1]);
  if (rank < 0 || suit < 0) fail(`invalid card in combo: ${card}`);
  return rank * 4 + suit;
}

function canonicalCombo(combo, board, source) {
  if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(combo)) fail(`${source}: invalid combo key ${combo}`);
  const first = combo.slice(0, 2);
  const second = combo.slice(2, 4);
  if (first === second || cardId(first) <= cardId(second)) fail(`${source}: non-canonical or duplicate-card combo ${combo}`);
  if (board.includes(first) || board.includes(second)) fail(`${source}: combo overlaps board: ${combo}`);
  const ranks = '23456789TJQKA';
  const r1 = ranks.indexOf(first[0]);
  const r2 = ranks.indexOf(second[0]);
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const handClass = high === low
    ? `${ranks[high]}${ranks[low]}`
    : `${ranks[high]}${ranks[low]}${first[1] === second[1] ? 's' : 'o'}`;
  return handClass;
}

function finiteNumber(value, field, source) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${source}: ${field} is not a finite number`);
  return number;
}

function parseActionRows(rows, source, expectedCount, board) {
  const columns = Object.keys(rows[0] ?? {});
  if (columns.join('|') !== 'combo|class|reach_weight|Check|Bet(180224)') {
    fail(`${source}: unexpected combo CSV columns: ${columns.join(',')}`);
  }
  if (rows.length !== expectedCount) fail(`${source}: expected ${expectedCount} combo rows, got ${rows.length}`);
  const seen = new Set();
  return rows.map((row, index) => {
    const handClass = canonicalCombo(row.combo, board, `${source}:${index + 2}`);
    if (seen.has(row.combo)) fail(`${source}: duplicate combo ${row.combo}`);
    seen.add(row.combo);
    if (row.class !== handClass) fail(`${source}:${row.combo}: hand class ${row.class} does not match ${handClass}`);
    const reachWeight = finiteNumber(row.reach_weight, 'reach_weight', `${source}:${row.combo}`);
    if (reachWeight <= 0) fail(`${source}:${row.combo}: nonpositive reach weight`);
    const check = finiteNumber(row.Check, 'Check', `${source}:${row.combo}`);
    const bet = finiteNumber(row['Bet(180224)'], 'Bet(180224)', `${source}:${row.combo}`);
    if (check < 0 || check > 1 || bet < 0 || bet > 1 || !close(check + bet, 1, 5e-8)) {
      fail(`${source}:${row.combo}: invalid/check-bet frequencies (${check}, ${bet})`);
    }
    return { combo: row.combo, handClass, reachWeight, frequencies: { check, bet } };
  });
}

function validateClassRows(classRows, comboRows, source, expectedCount) {
  const columns = Object.keys(classRows[0] ?? {});
  if (columns.join('|') !== 'class|combo_count|reach_weight|Check|Bet(180224)') {
    fail(`${source}: unexpected class CSV columns: ${columns.join(',')}`);
  }
  if (classRows.length !== expectedCount) fail(`${source}: expected ${expectedCount} present classes, got ${classRows.length}`);
  const grouped = new Map();
  for (const row of comboRows) {
    const group = grouped.get(row.handClass) ?? { weight: 0, check: 0, bet: 0, count: 0 };
    group.weight += row.reachWeight;
    group.check += row.reachWeight * row.frequencies.check;
    group.bet += row.reachWeight * row.frequencies.bet;
    group.count += 1;
    grouped.set(row.handClass, group);
  }
  const seen = new Set();
  const classes = classRows.map((row) => {
    if (seen.has(row.class)) fail(`${source}: duplicate class ${row.class}`);
    seen.add(row.class);
    const group = grouped.get(row.class);
    if (!group) fail(`${source}: class ${row.class} has no corresponding combo rows`);
    const comboCount = finiteNumber(row.combo_count, 'combo_count', source);
    const reachWeight = finiteNumber(row.reach_weight, 'reach_weight', source);
    const check = finiteNumber(row.Check, 'Check', source);
    const bet = finiteNumber(row['Bet(180224)'], 'Bet(180224)', source);
    if (comboCount !== group.count || !close(reachWeight, group.weight, 1e-7)
      || !close(check, group.check / group.weight, 1e-8)
      || !close(bet, group.bet / group.weight, 1e-8)) {
      fail(`${source}: aggregated class data mismatch for ${row.class}`);
    }
    return { handClass: row.class, comboCount, reachWeight, frequencies: { check, bet } };
  });
  if (seen.size !== grouped.size) fail(`${source}: missing class aggregate rows`);
  return classes;
}

function cardPairIndex(first, second) {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return low * (101 - low) / 2 + high - 1;
}

function hashRangeWeights(weights) {
  const bytes = Buffer.alloc(weights.length * 4);
  weights.forEach((weight, index) => bytes.writeFloatLE(weight, index * 4));
  return sha256(bytes);
}

async function validateInputFingerprints(results, projectRoot) {
  const inputs = results.configuration.input_ranges;
  const openingPath = path.join(projectRoot, 'apps/frontend/src/estimated/opening-ranges.json');
  const solutionPath = path.join(projectRoot, 'solutions/cash-6max-100bb-v1.json');
  const sourcePaths = { BTN_open: 'apps/frontend/src/estimated/opening-ranges.json', BB_call: 'solutions/cash-6max-100bb-v1.json' };
  for (const [key, sourcePath] of Object.entries(sourcePaths)) {
    // Benchmark provenance may name its original checkout. Validate the source
    // identity independently of that checkout's machine-specific absolute root.
    const recordedPath = inputs[key]?.path?.replaceAll('\\', '/');
    if (recordedPath !== sourcePath && !((path.posix.isAbsolute(recordedPath ?? '') || path.win32.isAbsolute(recordedPath ?? ''))
      && recordedPath.endsWith(`/${sourcePath}`))) {
      fail(`${key}: source path differs from benchmark input provenance`);
    }
  }
  const [openingBytes, solutionBytes] = await Promise.all([readFile(openingPath), readFile(solutionPath)]);
  const actualFileHashes = { BTN_open: sha256(openingBytes), BB_call: sha256(solutionBytes) };
  for (const key of Object.keys(sourcePaths)) {
    const input = inputs[key];
    if (input.file_sha256 !== actualFileHashes[key]) {
      fail(`${key}: source hash differs from benchmark input provenance`);
    }
  }

  const opening = JSON.parse(openingBytes.toString('utf8'));
  const btn = opening.spots?.find((spot) => spot.id === 'BTN_open');
  if (!btn || btn.open_size_bb !== 2.5 || btn.effective_stack_bb !== 100 || btn.hands?.length !== 169) {
    fail('BTN_open source identity/settings do not match benchmark provenance');
  }
  const classWeights = new Map(btn.hands.map((hand) => [hand.hand, Math.fround(Number(hand.open) / 100)]));
  const btnRange = new Array(1326).fill(0);
  for (let first = 0; first < 52; first += 1) {
    for (let second = first + 1; second < 52; second += 1) {
      const firstCard = `${'23456789TJQKA'[Math.floor(first / 4)]}${'cdhs'[first % 4]}`;
      const secondCard = `${'23456789TJQKA'[Math.floor(second / 4)]}${'cdhs'[second % 4]}`;
      const handClass = canonicalCombo(`${secondCard}${firstCard}`, [], 'BTN_open source');
      const weight = classWeights.get(handClass);
      if (weight === undefined) fail(`BTN_open source is missing class ${handClass}`);
      btnRange[cardPairIndex(first, second)] = weight;
    }
  }
  if (hashRangeWeights(btnRange) !== inputs.BTN_open.range_sha256) fail('BTN_open derived range fingerprint mismatch');

  const solution = JSON.parse(solutionBytes.toString('utf8'));
  const bbNodes = solution.nodes?.filter((node) => node.actingPosition === 'BB'
    && node.actionHistory?.actions?.length === 2
    && node.actionHistory.actions[0]?.position === 'BTN'
    && node.actionHistory.actions[0]?.action?.type === 'raise'
    && node.actionHistory.actions[0]?.action?.sizeBb === 2.5
    && node.actionHistory.actions[1]?.position === 'SB'
    && node.actionHistory.actions[1]?.action?.type === 'fold');
  if (solution.stackBb !== 100 || bbNodes?.length !== 1 || bbNodes[0].nodeId !== inputs.BB_call.node_id) {
    fail('BB_call source node identity/settings do not match benchmark provenance');
  }
  const bbRange = new Array(1326).fill(0);
  for (const combo of bbNodes[0].combos) {
    const text = combo.combo;
    if (typeof text !== 'string' || text.length !== 4) fail('BB_call source has an invalid combo key');
    const first = cardId(text.slice(0, 2));
    const second = cardId(text.slice(2, 4));
    const call = combo.actions?.find((action) => action.action === 'call')?.frequency;
    if (call === undefined || !Number.isFinite(Number(call))) fail(`BB_call source is missing call frequency for ${text}`);
    bbRange[cardPairIndex(first, second)] = Math.fround(Number(call));
  }
  if (hashRangeWeights(bbRange) !== inputs.BB_call.range_sha256) fail('BB_call derived range fingerprint mismatch');
}

function verifyResults(results) {
  const tree = results.configuration;
  if (results.status !== 'target_reached') fail(`benchmark did not reach exploitability target: ${results.status}`);
  if (results.upstream_sha !== EXPECTED_UPSTREAM_SHA || tree.upstream_sha !== EXPECTED_UPSTREAM_SHA) fail('upstream solver SHA does not match pinned benchmark SHA');
  if (tree.upstream !== EXPECTED_UPSTREAM_URL) fail('unexpected upstream solver URL');
  if (tree.board !== EXPECTED.board || tree.starting_pot_bb !== EXPECTED.startingPotBb || tree.effective_stack_bb !== EXPECTED.effectiveStackBb) fail('unexpected board/pot/effective-stack metadata');
  if (tree.bet_sizes?.all_streets !== EXPECTED.betSize || tree.bet_sizes?.raises !== EXPECTED.raiseSize || tree.bet_sizes?.raise_cap_count !== EXPECTED.raiseLimitCount) fail('unexpected action sizing or raise limit');
  if (tree.rake?.rate !== EXPECTED.rakeRate || tree.rake?.cap !== EXPECTED.rakeCap || tree.merging_threshold !== EXPECTED.mergingThreshold
    || tree.add_allin_threshold !== EXPECTED.addAllinThreshold || tree.force_allin_threshold !== EXPECTED.forceAllinThreshold) fail('unexpected rake/all-in/merge setting');
  if (!close(results.achieved_exploitability_percent_initial_pot / 100, 0.002726748585700989, 1e-12)) fail('benchmark exploitability value differs from completed run');
  if (results.iterations !== 160 || results.solve_seconds !== 755.815893125) fail('benchmark solve metadata does not match completed run');
  const inputs = tree.input_ranges;
  if (inputs.BTN_open?.file_sha256 !== '236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b'
    || inputs.BTN_open?.range_sha256 !== '30090fc2ccdeee4191298115c571defa147e8ae7f70a28dd0e21a984aab36a60'
    || inputs.BB_call?.file_sha256 !== '9cd797c296e59565dc1317e2b7e3db9dcfcd9c88f4fe6c5e1b38b036593bee2b'
    || inputs.BB_call?.range_sha256 !== '402b5c3ee030ca2144d7013c8490c9c7e9c0635c3724d5ce6377e11fd07981e5'
    || inputs.BB_call?.node_id !== 'node-72f98d904c1d2d17') fail('saved input provenance/fingerprint metadata mismatch');
}

export async function buildBenchmarkDataset({ resultsDir, projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..') } = {}) {
  if (typeof resultsDir !== 'string' || resultsDir.trim() === '') {
    fail('resultsDir is required: provide the completed benchmark results directory explicitly');
  }
  const resultsPath = path.join(resultsDir, 'results.json');
  const resultsBytes = await readFile(resultsPath);
  const results = JSON.parse(resultsBytes.toString('utf8'));
  const projectPath = path.resolve(projectRoot);
  verifyResults(results);
  await validateInputFingerprints(results, projectPath);

  const csvBytes = {};
  const nodes = [];
  for (const nodeSpec of EXPECTED.nodes) {
    const comboPath = path.join(resultsDir, nodeSpec.comboCsv);
    const classPath = path.join(resultsDir, nodeSpec.classCsv);
    csvBytes[nodeSpec.comboCsv] = await readFile(comboPath);
    csvBytes[nodeSpec.classCsv] = await readFile(classPath);
    const comboRows = parseActionRows(parseCsv(csvBytes[nodeSpec.comboCsv].toString('utf8'), nodeSpec.comboCsv), nodeSpec.comboCsv, nodeSpec.count, BOARD);
    const classRows = validateClassRows(parseCsv(csvBytes[nodeSpec.classCsv].toString('utf8'), nodeSpec.classCsv), comboRows, nodeSpec.classCsv, nodeSpec.classCount);
    nodes.push({
      id: nodeSpec.id,
      position: nodeSpec.position,
      history: nodeSpec.id === 'bb-root' ? [] : [{ position: 'BB', action: 'check' }],
      actions: [
        { id: 'check', kind: 'check', amountBb: 0, potFraction: null },
        { id: 'bet', kind: 'bet', amountBb: 180224 / CHIP_UNITS_PER_BB, potFraction: 0.5 },
      ],
      combos: comboRows,
      classes: classRows,
    });
  }

  const inputs = results.configuration.input_ranges;
  const expectedSources = [
    ['BTN_open', path.join(projectPath, 'apps/frontend/src/estimated/opening-ranges.json')],
    ['BB_call', path.join(projectPath, 'solutions/cash-6max-100bb-v1.json')],
  ];
  for (const [key, inputPath] of expectedSources) {
    const actualSha = sha256(await readFile(inputPath));
    if (actualSha !== inputs[key].file_sha256) fail(`${key}: saved input source no longer matches benchmark fingerprint`);
  }

  const resultFileSha = sha256(resultsBytes);
  const csvHashes = Object.fromEntries(Object.entries(csvBytes).map(([name, bytes]) => [name, sha256(bytes)]));
  const fullRss = results.process_metrics?.maximum_resident_set_bytes;
  if (!Number.isSafeInteger(fullRss) || fullRss <= 0) fail('missing/invalid process maximum RSS measurement');
  return {
    schemaVersion: 1,
    id: 'btn-bb-100bb-qsjh2h-single-size',
    metadata: {
      board: [...BOARD],
      startingStackBb: 100,
      effectiveStackBb: results.configuration.effective_stack_bb,
      potBb: results.configuration.starting_pot_bb,
      openSizeBb: 2.5,
      betPotFraction: 0.5,
      raiseMultiplier: 2.5,
      raiseLimit: null,
      rakePercent: results.configuration.rake.rate * 100,
      rakeCapBb: results.configuration.rake.cap,
      exploitabilityPotFraction: results.achieved_exploitability_percent_initial_pot / 100,
      benchmarkStatus: results.status,
      iterations: results.iterations,
      measured: { solveSeconds: results.solve_seconds, peakRssBytes: fullRss },
      coverage: 'flop-two-decisions',
      turnRiverDonkSizing: 'default sizing menu; 50% pot sizing remains available',
      reachWeightMeaning: 'Raw solver weighting used to aggregate strategies; not a normalized probability or hand-reach percentage.',
      frequencyMeaning: 'Each action frequency is a fraction from 0 to 1; convert to percent only for display.',
      scope: 'Heads-up restricted action-tree benchmark; near-equilibrium only for this tree and its supplied ranges.',
      upstream: {
        url: results.configuration.upstream,
        sha: results.upstream_sha,
        license: 'AGPL-3.0-or-later',
        artifactNote: 'Generated strategy results only; no upstream engine code or binary is included. This metadata is provenance, not a legal determination.',
      },
      inputs: {
        BTN_open: {
          sourcePath: 'apps/frontend/src/estimated/opening-ranges.json',
          sourceId: 'BTN_open',
          description: 'Saved ReysonAI authored 100BB / 2.5BB BTN opening estimate; used as the BTN input range.',
          fileSha256: inputs.BTN_open.file_sha256,
          rangeSha256: inputs.BTN_open.range_sha256,
        },
        BB_call: {
          sourcePath: 'solutions/cash-6max-100bb-v1.json',
          nodeId: inputs.BB_call.node_id,
          description: 'Saved ReysonAI preflop BB call-frequency estimate after BTN 2.5BB open and SB fold; used as the BB input range.',
          fileSha256: inputs.BB_call.file_sha256,
          rangeSha256: inputs.BB_call.range_sha256,
        },
        benchmarkResultsSha256: resultFileSha,
        strategyCsvSha256: csvHashes,
        note: 'These input ranges are ReysonAI estimates, not solver-derived preflop GTO ranges.',
      },
    },
    nodes,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, '../../..');
  const resultsDir = process.argv[2];
  const outputPath = path.join(projectRoot, 'apps/frontend/src/gto/benchmark-flop.json');
  const data = await buildBenchmarkDataset({ resultsDir, projectRoot });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`Imported ${data.nodes.reduce((total, node) => total + node.combos.length, 0)} combo strategies to ${outputPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
