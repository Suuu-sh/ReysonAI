#!/usr/bin/env node
// Audit only: saved inputs/policies and the real HandReasons builders; never authors data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTFLOP_SPOTS } from './spots.ts';
import { buildInputs } from './browser-inputs.ts';
import { readArtifact } from './inputs.mjs';
import { SIMULATION_VERSION } from './simulation.mjs';
import { betFraction } from './later-tree.ts';
import { loadScreenAdapter } from './audit-explanations-render.mjs';
import { auditExplanationCase, FINDING_KINDS } from './audit-explanations-oracle.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
export const MANDATORY_BOARDS = [
  { family: 'paired', cards: 'Kh8h8c3h2d' },
  { family: 'double-paired', cards: 'KdKs9c9h2c' },
  { family: 'trips', cards: 'KhKdKc5s2d' },
  { family: 'river-quads', cards: 'KhKd5cKsKc' },
  { family: 'monotone', cards: 'Ah7h2h5cKd' },
  { family: 'four-flush', cards: 'Ah7h2h5hKc' },
  { family: 'four-straight', cards: '9h8d7c6s2d' },
  { family: 'river-board-straight', cards: 'Th9d8c7s6h' },
  { family: 'river-board-flush', cards: 'Ah7h2h5hKh' },
];
const FALSE_POSITIVE_EXCLUSIONS = [
  '## False-positive exclusions', '',
  '- Opponent/range/paying-hand statements are not assertions of the hero made hand or draw.',
  '- Negated and missed-draw mentions are not affirmative made-hand/draw assertions.',
  '- Hand-class averages compare weighted production tiers, not the tier of one representative combo; made-hand/draw copy uses the actual dominant-feature representative selected by the screen.',
  '- Vague future flush-draw threats are excluded: a holding may redraw to a better full house or straight flush without winning with an ordinary flush.',
  '- The known paired-board flush-out approximation is excluded: completing a flush does not prove that it beats every full house.',
  '- Sixes/deuces and other rank inflections are parsed correctly; lower-pair holdings that upgrade to sets/full houses/flushes remain in the shape tally. These are corrected interpretations, not disabled finding kinds.',
  '', '## Oracle regression verification', '',
  'Implementation review (2026-10-07): `node --test tests/explanation-audit.test.mjs` — 15 tests passed (reused independent agent result). The audit CLI does not itself rerun that suite.', '',
];
const deck = [...'23456789TJQKA'].flatMap(rank => [...'cdhs'].map(suit => rank + suit));
function rng(seed) { let x = seed >>> 0; return () => { x += 0x6D2B79F5; let t = Math.imul(x ^ x >>> 15, x | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seededNumber(value) { return [...String(value)].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261); }
function options(args) {
  const out = { spots: 'all', boards: 6, seed: '20261007', out: '.local/postflop-ai/explanation-audit/' };
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || !Object.hasOwn(out, key) || args[i + 1] === undefined) throw new Error('Usage: audit-explanations.mjs [--spots all|id,id] [--boards N] [--seed S] [--out DIR]');
    out[key] = args[++i];
  }
  out.boards = Number(out.boards);
  if (!Number.isInteger(out.boards) || out.boards < 0) throw new Error('--boards must be a nonnegative integer (mandatory boards are always added)');
  return out;
}
function boardList(opts) {
  const random = rng(seededNumber(opts.seed));
  const boards = MANDATORY_BOARDS.map(board => ({ ...board }));
  for (let i = 0; i < opts.boards; i++) {
    const shuffled = [...deck];
    for (let j = shuffled.length - 1; j > 0; j--) { const k = Math.floor(random() * (j + 1)); [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]]; }
    boards.push({ family: 'random', cards: shuffled.slice(0, 5).join(''), randomIndex: i });
  }
  return boards;
}
function selectCombos(view, random) {
  const all = view.rows.flatMap(row => row.combos.map(combo => ({ ...combo, hand: row.hand }))).filter(combo => combo.weight > 0);
  const ranked = [...all].sort((a, b) => b.weight - a.weight || a.cards.localeCompare(b.cards));
  const selected = [], seen = new Set(), hands = new Set();
  for (const combo of ranked) { if (hands.has(combo.hand)) continue; selected.push({ hand: combo.hand, cards: combo.cards, selection: 'top-weight' }); seen.add(combo.cards); hands.add(combo.hand); if (selected.length === 2) break; }
  const live = all.filter(combo => !seen.has(combo.cards));
  for (let i = 0; i < 2 && live.length; i++) { const at = Math.floor(random() * live.length), combo = live.splice(at, 1)[0]; selected.push({ hand: combo.hand, cards: combo.cards, selection: 'random-live-combo' }); }
  const average = view.rows.filter(row => row.reachable && row.combos.length > 1).sort((a, b) => b.reachWeight - a.reachWeight || a.hand.localeCompare(b.hand))[0];
  if (average) selected.push({ hand: average.hand, selection: 'hand-class-average', combos: average.combos.map(combo => ({ cards: combo.cards, weight: combo.weight })) });
  return { selected, liveCombos: all.length };
}
function readDatasets() {
  const names = ['opening-ranges', 'preflop-ranges', 'three-bet-responses', 'four-bet-responses', 'five-bet-responses',
    'limp-responses', 'limp-deep-responses', 'multiway-responses', 'multiway2-responses', 'cold-three-bet-responses',
    'cold-four-bet-responses', 'squeeze-responses', 'continuation-responses'];
  return { ...Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(join(root, 'src/estimated', `${name}.json`), 'utf8'))])),
    'hu-after-multiway-spots': JSON.parse(readFileSync(join(root, 'scripts/data/hu-after-multiway-spots.json'), 'utf8')) };
}
function firstBet(decision) { return decision.options?.find(option => option.action === 'bet33' && !option.allIn)?.action ?? decision.options?.find(option => option.action.startsWith('bet') || option.action === 'allin')?.action; }
function renderedText(rendered) { return { headline: rendered.headline, actionReasons: rendered.blocks, ...(rendered.texture ? { texture: rendered.texture } : {}) }; }
function summaryMarkdown(report) {
  const s = report.summary, lines = ['# Postflop screen explanation audit', '',
    `Status: ${report.status}; seed: ${report.options.seed}; runtime: ${report.runtimeSeconds}s; saved AI estimates, not GTO.`,
    `Catalog: ${report.coverage.catalogSpots}; reachable: ${report.coverage.reachableSpots}; selected: ${report.coverage.selectedSpots}; processed: ${report.coverage.processedSpots}; complete without runtime exclusions: ${report.coverage.completedSpots}.`,
    `Boards per spot: ${report.options.boards} random + ${MANDATORY_BOARDS.length} mandatory. Judgments: ${report.coverage.judgments}; locale cases: ${report.coverage.localeCases}; findings: ${report.findings.length}.`,
    'Sampling per judgment: up to 2 distinct-hand top-weight exact combos + up to 2 uniform random live combos + up to 1 live weighted hand-class average (limited only by actual positive range support).',
    'Paths: alternating checked / bet33-call flop; turn OOP first and IP facing the smallest legal wager; river OOP first and IP facing after turn check-check.',
    'Only legal positive actor reach is sampled. Missing/stale artifacts, empty reach, unavailable later streets and runtime failures are reported below, never replaced by reference policies.',
    'All eight finding kinds are enabled. This is a deterministic sample, not exhaustive tree/board/combo coverage. Explicit EN/JA assertion patterns are checked against an independent best-five/opponent enumeration oracle; unrecognised paraphrases are a residual limitation, and zero findings do not prove all copy correct.',
    'No production strategy, policy, hand feature, or wording is changed. Numeric checks apply to actual displayed numeric claims; the current HandReasons paragraphs are deliberately numberless, while action sizing labels are audited against the replay.', '',
    '| kind | findings |', '|---|---:|', ...FINDING_KINDS.map(kind => `| ${kind} | ${s.byKind[kind] ?? 0} |`), '',
    '| spot family | spots | locale cases | findings |', '|---|---:|---:|---:|', ...Object.entries(s.bySpotFamily).map(([family, item]) => `| ${family} | ${item.spots.length} | ${item.cases} | ${item.findings} |`), '',
    '| board family | locale cases | findings |', '|---|---:|---:|', ...Object.entries(s.byFamily).map(([family, item]) => `| ${family} | ${item.cases} | ${item.findings} |`), '', '## Exclusions and failures', '',
    `Unreachable catalog spots: ${report.coverage.unreachable.map(spot => spot.id).join(', ') || 'none'}.`,
    ...report.skipped.map(item => `- ${item.spotId}${item.board ? ` / ${item.board} / ${item.judgment ?? ''}` : ''}: ${item.reason}`), '', ...FALSE_POSITIVE_EXCLUSIONS, '## Examples (up to three distinct cases per kind)', ''];
  for (const kind of FINDING_KINDS) {
    lines.push(`### ${kind}`, ''); const examples = [], seen = new Set();
    for (const finding of report.findings.filter(f => f.kind === kind)) { if (seen.has(finding.caseId)) continue; seen.add(finding.caseId); examples.push(finding); if (examples.length === 3) break; }
    if (!examples.length) lines.push('No findings.', '');
    for (const f of examples) {
      lines.push(`- **${f.spotId} / ${f.board} / ${f.node} / ${f.combo ?? f.hand + ' average'}**`, `  - Path: flop=${f.path.flop || '(empty)'}; turn=${f.path.turn || '(empty)'}; river=${f.path.river || '(empty)'}.`, `  - ${f.message}`, `  - Flagged (${f.locale}): ${JSON.stringify(f.excerpt)}`);
      const affectedActions = new Set(f.originals[f.locale].actionReasons.filter((block, index) => f.excerpt === block.text || block.text.includes(f.excerpt) || f.excerpt?.includes(`actionReasons.${index}.`)).map(block => block.action));
      for (const locale of ['en', 'ja']) {
        const original = f.originals[locale]; lines.push(`  - ${locale.toUpperCase()} headline: ${original.headline}`);
        for (const block of original.actionReasons.filter(block => affectedActions.has(block.action))) lines.push(`  - ${locale.toUpperCase()} ${block.label} (${Math.round(block.frequency * 100)}%): ${JSON.stringify(block.text)}`);
        if (original.texture && f.originals[f.locale].texture?.includes(f.excerpt)) lines.push(`  - ${locale.toUpperCase()} texture: ${original.texture}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

export async function runAudit(opts) {
  const started = Date.now(), datasets = readDatasets(), boards = boardList(opts);
  const reachable = POSTFLOP_SPOTS.filter(spot => spot.reachable), ids = opts.spots === 'all' ? reachable.map(spot => spot.id) : opts.spots.split(',');
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !POSTFLOP_SPOTS.some(spot => spot.id === id))) throw new Error('--spots includes unknown or duplicate IDs');
  const selected = ids.map(id => POSTFLOP_SPOTS.find(spot => spot.id === id));
  const report = { version: 1, status: 'running', options: opts, startedAt: new Date(started).toISOString(), runtimeSeconds: 0,
    checksEnabled: [...FINDING_KINDS], boards, coverage: { catalogSpots: POSTFLOP_SPOTS.length, reachableSpots: reachable.length, selectedSpots: selected.length,
      processedSpots: 0, completedSpots: 0, attemptedLocaleCases: 0, unreachable: POSTFLOP_SPOTS.filter(spot => !spot.reachable).map(({ id, responseId }) => ({ id, responseId })), judgments: 0, localeCases: 0, exactComboCases: 0, averageCases: 0, sources: [], decisions: [] },
    skipped: [], findings: [], summary: { byKind: Object.fromEntries(FINDING_KINDS.map(kind => [kind, 0])), byFamily: {}, bySpotFamily: {} } };
  const adapter = await loadScreenAdapter();
  const out = resolve(root, opts.out); mkdirSync(out, { recursive: true });
  const save = () => { report.runtimeSeconds = Math.round((Date.now() - started) / 100) / 10; writeFileSync(join(out, 'findings.json'), JSON.stringify(report, null, 2) + '\n'); writeFileSync(join(out, 'summary.md'), summaryMarkdown(report)); };
  try {
    for (const spot of selected) {
      const spotStart = Date.now(), skippedBeforeSpot = report.skipped.length;
      let source;
      try {
        if (!spot.reachable) throw new Error('catalog marks this spot unreachable');
        const inputs = buildInputs(spot.id, datasets), flopCandidate = readArtifact(spot, 'candidate'), laterCandidate = readArtifact(spot, 'laterCandidate');
        if (!flopCandidate || !laterCandidate) throw new Error(`saved ${!flopCandidate ? 'flop' : 'later'} policy missing`);
        const savedReport = readArtifact(spot, 'report');
        if (!savedReport || savedReport.source_hash !== inputs.fingerprint || savedReport.policy_hash !== flopCandidate.metadata.policy_hash ||
            savedReport.simulation_version !== SIMULATION_VERSION || savedReport.spot !== spot.id || savedReport.results?.length !== 72) {
          throw new Error('saved screen source report missing/stale/malformed (same gate as local postflop endpoint)');
        }
        source = { spotId: spot.id, datasets, flopCandidate, laterCandidate };
        // Validate saved hashes via the product view, not a permissive reference-policy loader.
        adapter.computeLaterView({ ...source, flop: boards[0].cards.slice(0, 6), turn: boards[0].cards.slice(6, 8), flopActions: spot.tree === 'oop_checks' ? 'check' : 'check,check' });
        if (inputs.fingerprint !== flopCandidate.metadata.source_hash) throw new Error('saved input fingerprint mismatch');
        report.coverage.sources.push({ spotId: spot.id, sourceHash: inputs.fingerprint, flopPolicyHash: flopCandidate.metadata.policy_hash,
          laterPolicyHash: laterCandidate.metadata.policy_hash, reportSimulationVersion: savedReport.simulation_version });
      } catch (error) { report.skipped.push({ spotId: spot.id, reason: error.message, stage: 'source-validation' }); save(); continue; }
      for (const [boardIndex, board] of boards.entries()) {
        const random = rng(seededNumber(`${opts.seed}|${spot.id}|${board.cards}`));
        const checkedFlop = spot.tree === 'oop_checks' ? 'check' : 'check,check';
        const flopActions = boardIndex % 2 ? 'bet33,call' : checkedFlop;
        const base = { ...source, flop: board.cards.slice(0, 6), flopActions, turn: board.cards.slice(6, 8) };
        const start = adapter.laterStart(flopActions.split(','), spot);
        if (!start) { report.skipped.push({ spotId: spot.id, board: board.cards, reason: 'flop path finishes all-in or is unavailable', stage: 'path' }); continue; }
        const turnFirst = adapter.laterDecision('turn', [], start, spot);
        const turnBet = firstBet(turnFirst);
        const turnEnd = adapter.replayLater('turn', ['check', 'check'], start, spot);
        const riverStart = { pot: turnEnd.pot, stacks: turnEnd.stacks, lastAggressor: turnEnd.lastAggressor };
        const riverFirst = adapter.laterDecision('river', [], riverStart, spot), riverBet = firstBet(riverFirst);
        const judgments = [
          { name: 'turn-first', options: { ...base, turnActions: '' }, decision: turnFirst, board: board.cards.slice(0, 8) },
          { name: 'turn-facing', options: { ...base, turnActions: turnBet }, decision: turnBet ? adapter.laterDecision('turn', [turnBet], start, spot) : null, board: board.cards.slice(0, 8) },
          { name: 'river-first', options: { ...base, turnActions: 'check,check', river: board.cards.slice(8), riverActions: '' }, decision: riverFirst, board: board.cards },
          { name: 'river-facing', options: { ...base, turnActions: 'check,check', river: board.cards.slice(8), riverActions: riverBet }, decision: riverBet ? adapter.laterDecision('river', [riverBet], riverStart, spot) : null, board: board.cards },
        ];
        for (const judgment of judgments) {
          const spotFamily = 'history' in spot ? `multiway/${spot.kind}` : spot.kind;
          const identity = { spotId: spot.id, spotFamily, board: judgment.board, family: board.family, judgment: judgment.name };
          try {
            if (!judgment.decision?.node) throw new Error('no legal pending decision');
            const street = judgment.name.startsWith('turn') ? 'turn' : 'river';
            const currentActions = (street === 'turn' ? judgment.options.turnActions : judgment.options.riverActions) || '';
            const chips = adapter.replayLater(street, currentActions ? currentActions.split(',') : [], street === 'turn' ? start : riverStart, spot).chipsNow;
            const role = judgment.decision.role, other = role === 'ip' ? 'oop' : 'ip';
            const actionSizing = Object.fromEntries(judgment.decision.options.map(option => [option.action, {
              amount_bb: option.amountBb, allIn: option.allIn,
              pot_fraction: option.action.startsWith('bet') ? betFraction(street, option.action) : option.action === 'raise'
                ? (option.amountBb - chips.committed[other]) / (chips.pot + chips.committed[other] - chips.committed[role]) : undefined,
            }]));
            const view = adapter.computeLaterView(judgment.options), { selected: selections, liveCombos } = selectCombos(view, random);
            if (!selections.length) throw new Error('actual acting range has zero positive reach');
            const rangeFacts = adapter.computeLaterRangeFacts(judgment.options);
            if (!rangeFacts) report.skipped.push({ ...identity, reason: 'range-level facts unavailable; hand facts and actual screen fallback still audited', stage: 'range-facts' });
            const path = { flop: flopActions, turn: judgment.options.turnActions, river: judgment.options.riverActions ?? '' };
            report.coverage.judgments++;
            report.coverage.decisions.push({ ...identity, node: view.node, actor: view.actor, path, liveCombos, sampled: selections.map(({ hand, cards, selection }) => ({ hand, cards, selection })) });
            for (const selection of selections) {
              const explanation = adapter.computeLaterExplain({ ...judgment.options, ...(selection.cards ? { cards: selection.cards } : { combos: selection.combos }) });
              if (rangeFacts) explanation.range_facts = rangeFacts;
              const rendered = Object.fromEntries(['en', 'ja'].map(locale => [locale, adapter.render(view, selection, explanation, judgment.decision, spot, judgment.board, locale)]));
              const originals = Object.fromEntries(['en', 'ja'].map(locale => [locale, renderedText(rendered[locale])]));
              const caseId = `${spot.id}|${judgment.board}|${path.flop}|${path.turn}|${path.river}|${selection.cards ?? selection.hand + ':average'}`;
              for (const locale of ['en', 'ja']) {
                report.coverage.attemptedLocaleCases++;
                const family = report.summary.byFamily[board.family] ??= { cases: 0, findings: 0 };
                const spotFamilyCounts = report.summary.bySpotFamily[spotFamily] ??= { cases: 0, findings: 0, spots: [] };
                if (!spotFamilyCounts.spots.includes(spot.id)) spotFamilyCounts.spots.push(spot.id);
                const facts = { ...explanation, decision: judgment.decision, actionMix: rendered[locale].actionMix };
                const auditCase = { ...identity, caseId, node: view.node, street: view.street, path, hand: selection.hand,
                  combo: selection.cards, combos: selection.combos, selection: selection.selection, locale, rendered: originals[locale],
                  observedTier: rendered[locale].observedTier, expectedTier: rendered[locale].expectedTier, representativeCombo: rendered[locale].representativeCombo,
                  explanation, decision: { ...judgment.decision, defence: explanation.defence, actionSizing }, facts };
                const caseFindings = auditExplanationCase(auditCase);
                report.coverage.localeCases++; report.coverage[selection.cards ? 'exactComboCases' : 'averageCases']++;
                family.cases++; spotFamilyCounts.cases++;
                for (const finding of caseFindings) {
                  if (!FINDING_KINDS.includes(finding.kind)) throw new Error(`oracle returned unknown kind ${finding.kind}`);
                  report.findings.push({ ...identity, caseId, node: view.node, street: view.street, path, hand: selection.hand, combo: selection.cards ?? null,
                    selection: selection.selection, ...(selection.combos ? { combos: selection.combos } : {}), locale, ...finding, originals });
                  report.summary.byKind[finding.kind]++; family.findings++; spotFamilyCounts.findings++;
                }
              }
            }
          } catch (error) { report.skipped.push({ ...identity, reason: error.message, stage: 'judgment' }); }
        }
      }
      report.coverage.processedSpots++; if (!report.skipped.slice(skippedBeforeSpot).some(item => item.stage !== 'range-facts')) report.coverage.completedSpots++; save();
      console.log(`${spot.id}: ${((Date.now() - spotStart) / 1000).toFixed(1)}s; cumulative ${report.coverage.localeCases} locale cases / ${report.findings.length} findings / ${report.skipped.length} exclusions`);
    }
    report.status = 'completed';
  } finally { if (report.status !== 'completed') report.status = 'incomplete'; await adapter.close(); save(); }
  console.log(JSON.stringify({ runtimeSeconds: report.runtimeSeconds, coverage: { ...report.coverage, sources: undefined, decisions: undefined }, byKind: report.summary.byKind, skipped: report.skipped.length, out }, null, 2));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runAudit(options(process.argv.slice(2)));
