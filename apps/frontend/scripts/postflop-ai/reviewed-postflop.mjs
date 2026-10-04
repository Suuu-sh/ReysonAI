// Local snapshot collection and read-only verification. No generation or publication.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { config, loadInputs, useArtifactSource } from './inputs.mjs';
import { allBoardIdentity } from './all-board-checkpoints.mjs';
import { assertAllBoardCompanion, companionPathFor, summaryPathFor } from './all-board-companion.mjs';
import { captureAuditIdentity, identityHash } from './audit-identity.mjs';
import { loadCandidate, loadLaterCandidate, sha } from './generate.mjs';
import { isFreshSimulationReport } from './publish-d1.mjs';
import { POSTFLOP_SPOTS } from './spots.mjs';
import { ARTIFACT_PREFIX, LIMITS, allowedEvidencePath, artifactPath, assertManifest, compare, contentIdentity,
  decodeArchive, encodeArchive, fileRecord, jsonBytes, readSafeFile, safeRelativePath, sha256 } from './reviewed-postflop-archive.mjs';

export const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
export const ARCHIVE_FILE = 'artifacts/postflop/hu-after-multiway.tar.gz';
export const MANIFEST_FILE = 'artifacts/postflop/hu-after-multiway.manifest.json';
export const REVIEW_FILE = 'configs/hu-postflop-after-multiway.review.json';
const FRONTEND = 'apps/frontend/';
const inputNames = ['opening-ranges', 'preflop-ranges', 'three-bet-responses', 'four-bet-responses', 'limp-responses', 'limp-deep-responses',
  'multiway-responses', 'multiway2-responses', 'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses', 'continuation-responses'];
const sourceRoots = ['cli.mjs', 'audit-all-boards.mjs', 'board-worker.mjs', 'browser-inputs.mjs', 'publish-d1.mjs', 'build-multiway-spots.mjs',
  'package-all-board-companion.mjs', 'package-reviewed-postflop.mjs', 'restore-reviewed-postflop.mjs', 'verify-reviewed-postflop.mjs', 'preserve-legacy-postflop.py'].map(name => `${FRONTEND}scripts/postflop-ai/${name}`);
// Consumer provenance remains bound by the publication review even when it is
// no longer an incidental dependency of the numerical execution graph.
const consumerRoots = [`${FRONTEND}src/estimated/postflop-trial.ts`];
export function reviewedSourcePaths(root = REPOSITORY) {
  const found = new Set();
  function visit(path) {
    if (!safeRelativePath(path) || path.includes('/.local/')) throw new Error('Review source escapes the allowed repository sources');
    if (found.has(path)) return;
    found.add(path);
    if (!/\.(?:mjs|ts|tsx|js)$/.test(path)) return;
    const text = readSafeFile(root, path).toString('utf8');
    const imports = /(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of text.matchAll(imports)) {
      const name = match[1] ?? match[2];
      if (name.startsWith('.')) visit(relative(root, resolve(root, dirname(path), name)).replaceAll('\\', '/'));
    }
  }
  [...sourceRoots, ...consumerRoots, '.gitattributes', `${FRONTEND}package.json`, `${FRONTEND}package-lock.json`,
    `${FRONTEND}docs/postflop-policy-knowledge.md`,
    ...['.md', '.storage.md', '.independent-review.md', '.policy-review.md', '.observable-actions.md'].map(suffix => `${FRONTEND}docs/specs/hu-postflop-after-multiway-preflop${suffix}`)].forEach(visit);
  return [...found].filter(path => !inputNames.some(name => path === `${FRONTEND}src/estimated/${name}.json`)).sort(compare);
}
export const reviewedInputPaths = () => inputNames.map(name => `${FRONTEND}src/estimated/${name}.json`).sort(compare);
function parse(body, label) {
  try { return JSON.parse(body.toString('utf8')); } catch { throw new Error(`Malformed JSON: ${label}`); }
}
function withSnapshot(root, files, run, pinnedInputs = null) {
  const pinned = pinnedInputs ? new Map(pinnedInputs.map(record => [record.path, record])) : null;
  const ranges = Object.fromEntries(inputNames.map(name => {
    const path = `${FRONTEND}src/estimated/${name}.json`, bytes = readSafeFile(root, path, LIMITS.total);
    if (pinned && (!pinned.has(path) || pinned.get(path).bytes !== bytes.length || pinned.get(path).sha256 !== sha256(bytes))) {
      throw new Error('Snapshot preflop input bytes differ from the manifest');
    }
    return [name, parse(bytes, name)];
  }));
  const previous = useArtifactSource({ ranges, artifact: (spot, kind) => {
    const body = files.get(artifactPath(spot, kind));
    return body ? parse(body, spot.id) : null;
  } });
  try { return run(); } finally { useArtifactSource(previous); }
}
function spotIdentity(spot, files) {
  const saved = Object.fromEntries(['candidate', 'laterCandidate', 'report'].map(kind => {
    const body = files.get(artifactPath(spot, kind));
    return [kind, body ? parse(body, `${spot.id}/${kind}`) : null];
  }));
  const identity = { saved_source_fingerprint: saved.candidate?.metadata?.source_hash ?? null,
    flop_policy_hash: saved.candidate?.metadata?.policy_hash ?? null, later_policy_hash: saved.laterCandidate?.metadata?.policy_hash ?? null,
    report_status: saved.report ? 'historical-stale' : 'missing', policy_status: 'historical-unverified', current_source_fingerprint: null };
  // Preserved legacy bytes are allowed to be stale. Never relabel them as a new
  // acceptance, upgrade their versions, or regenerate a report to make them pass.
  try {
    const inputs = loadInputs(spot.id), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
    identity.current_source_fingerprint = inputs.fingerprint;
    identity.policy_status = later ? 'fresh-pair' : 'flop-only';
    if (saved.report && isFreshSimulationReport(inputs, candidate, later, saved.report)) identity.report_status = 'fresh';
    if (spot.history && (!later || [candidate, later].some(item => item.metadata.model !== 'gpt-6-astra'))) throw new Error('New policies require their own requested Astra-authored pair');
  } catch (error) {
    if (spot.history) throw error;
    identity.freshness_error = error.message;
  }
  if (spot.history && saved.report && identity.report_status !== 'fresh') throw new Error(`${spot.id}: new candidate report is stale/incomplete`);
  return identity;
}
export function collectSnapshot({ root = REPOSITORY, spots = [], preserved = [], allPresent = false, evidence = [], archivePath = ARCHIVE_FILE } = {}) {
  root = resolve(root);
  const selected = new Map(), bodies = new Map(), artifacts = [];
  const select = (id, classification) => {
    const spot = POSTFLOP_SPOTS.find(item => item.id === id);
    if (!spot || (classification === 'new-candidate') !== Boolean(spot.history)) throw new Error(`Unknown/misclassified postflop spot: ${id}`);
    if (selected.has(id)) throw new Error(`Repeated spot selection: ${id}`);
    selected.set(id, { id, slug: spot.slug, classification, identity: {}, evidence: [] });
  };
  if (allPresent && (spots.length || preserved.length)) throw new Error('Use explicit spots or --all-present, not both');
  spots.forEach(id => select(id, 'new-candidate')); preserved.forEach(id => select(id, 'preserved-legacy'));
  if (allPresent) for (const spot of POSTFLOP_SPOTS) {
    if (['candidate', 'laterCandidate', 'report'].some(kind => existsSync(join(root, artifactPath(spot, kind))))) select(spot.id, spot.history ? 'new-candidate' : 'preserved-legacy');
  }
  if (!selected.size) throw new Error('Explicit spot selection or --all-present is required');
  const add = (path, spot, kind) => {
    if (bodies.has(path)) throw new Error(`Repeated artifact path: ${path}`);
    const body = readSafeFile(root, path), hash = sha256(body);
    bodies.set(path, body); artifacts.push({ path, spot, kind, bytes: body.length, sha256: hash, entry: `objects/${hash}` });
    return body;
  };
  for (const spot of selected.values()) for (const kind of ['candidate', 'laterCandidate', 'report']) {
    const path = artifactPath(spot, kind);
    if (existsSync(join(root, path))) add(path, spot.id, kind);
  }
  for (let path of evidence) {
    if (path.startsWith('.local/')) path = FRONTEND + path;
    if (!allowedEvidencePath(path)) throw new Error('Evidence must be an explicitly allowed audit JSON, never arbitrary logs or .local contents');
    const body = readSafeFile(root, path), value = parse(body, path), spot = selected.get(value.spot);
    if (!spot) throw new Error(`Evidence belongs to an unselected spot: ${path}`);
    add(path, spot.id, 'auditEvidence'); spot.evidence.push(path);
  }
  withSnapshot(root, bodies, () => {
    for (const item of selected.values()) item.identity = spotIdentity(POSTFLOP_SPOTS.find(spot => spot.id === item.id), bodies);
  });
  const sources = reviewedSourcePaths(root).map(path => fileRecord(root, path));
  const inputs = reviewedInputPaths().map(path => fileRecord(root, path));
  artifacts.sort((a, b) => compare(a.path, b.path));
  const compressed = encodeArchive(artifacts, bodies);
  const expectedNewIds = POSTFLOP_SPOTS.filter(spot => spot.history).map(spot => spot.id).sort(compare);
  const includedNewIds = [...selected.values()].filter(spot => spot.classification === 'new-candidate').map(spot => spot.id).sort(compare);
  const manifest = { schema_version: 1, kind: 'postflop-artifact-snapshot', approval: 'unapproved',
    coverage: { scope: 'candidate-preservation', expected_new_spot_ids: expectedNewIds,
      catalog_sha256: sha256(jsonBytes(expectedNewIds)), included_new_spot_ids: includedNewIds,
      unavailable_new_spots: expectedNewIds.filter(id => !includedNewIds.includes(id)).map(spot => ({ spot, reason: 'Not included in this candidate snapshot; unavailable here and not accepted.' })) },
    sources, inputs, sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputs)),
    spots: [...selected.values()].map(spot => ({ ...spot, evidence: spot.evidence.sort(compare) })).sort((a, b) => compare(a.id, b.id)), artifacts,
    archive: { path: archivePath, format: 'ustar+gzip-content-addressed-v1', bytes: compressed.length, sha256: sha256(compressed) } };
  manifest.content_sha256 = contentIdentity(manifest);
  assertManifest(manifest); decodeArchive(compressed, manifest);
  return { manifest, compressed };
}
export function assertCurrentSources(root, manifest) {
  const sources = reviewedSourcePaths(root).map(path => fileRecord(root, path));
  const inputs = reviewedInputPaths().map(path => fileRecord(root, path));
  if (!isDeepStrictEqual(sources, manifest.sources) || !isDeepStrictEqual(inputs, manifest.inputs)) throw new Error('Postflop source/config/input identity changed; package and review the actual bytes again');
}
export function assertCurrentCandidates(root, manifest, files) {
  const expected = POSTFLOP_SPOTS.filter(spot => spot.history).map(spot => spot.id).sort(compare);
  if (!isDeepStrictEqual(expected, manifest.coverage.expected_new_spot_ids)) throw new Error('Manifest expected new-spot catalog differs');
  withSnapshot(root, files, () => {
    for (const item of manifest.spots) {
      const spot = POSTFLOP_SPOTS.find(spot => spot.id === item.id);
      if (!spot || spot.slug !== item.slug || Boolean(spot.history) !== (item.classification === 'new-candidate')) throw new Error('Manifest spot catalog differs');
      if (!isDeepStrictEqual(spotIdentity(spot, files), item.identity)) throw new Error(`Manifest policy/input identity changed: ${spot.id}`);
    }
  });
}
export function readSnapshot(root = REPOSITORY, manifestPath = MANIFEST_FILE) {
  const manifestBytes = readSafeFile(root, manifestPath, LIMITS.manifest), manifest = parse(manifestBytes, manifestPath);
  assertManifest(manifest); assertCurrentSources(root, manifest);
  const compressed = readSafeFile(root, manifest.archive.path, LIMITS.compressed);
  const files = decodeArchive(compressed, manifest);
  assertCurrentCandidates(root, manifest, files);
  return { manifest, manifestBytes, files, root };
}
export function assertCapturedAuditIdentity(evidence, expected, manifest) {
  if (!evidence || !isDeepStrictEqual(evidence.start, expected) || !isDeepStrictEqual(evidence.end, expected) ||
      evidence.sha256 !== identityHash(expected)) throw new Error('Representative audit requires unchanged official start/end transitive source and input identity');
  for (const type of ['sources', 'inputs']) {
    const pinned = new Map(manifest[type].map(item => [item.path, item]));
    if (expected[type].some(item => !isDeepStrictEqual(item, pinned.get(item.path)))) throw new Error('Official audit identity differs from the archive source/input records');
  }
}
// Evidence checks attest consistency with actual saved audit records, not proof
// of execution by themselves. The independent reviewer must inspect that evidence.
export function assertAuditEvidence(proof, spot, kind, manifest, files, { root = REPOSITORY } = {}) {
  const records = manifest.artifacts.filter(item => item.spot === spot.id);
  const recordFor = type => records.find(item => item.kind === type);
  if (proof?.schema_version !== 1 || proof.spot !== spot.id || proof.status !== 'pass' || proof.exit_code !== 0 ||
      typeof proof.command !== 'string' || !proof.command.includes(spot.id) || !Number.isFinite(Date.parse(proof.started_at)) ||
      !Number.isFinite(Date.parse(proof.completed_at)) || Date.parse(proof.completed_at) < Date.parse(proof.started_at) ||
      proof.source_fingerprint !== spot.identity.current_source_fingerprint || proof.flop_policy_hash !== spot.identity.flop_policy_hash ||
      proof.later_policy_hash !== spot.identity.later_policy_hash) throw new Error('Missing or stale actual successful audit evidence');
  for (const type of ['candidate', 'laterCandidate', 'report']) if (!recordFor(type) || proof.artifact_sha256?.[type] !== recordFor(type).sha256) throw new Error('Audit artifact byte identity differs');
  if (typeof proof.log?.text !== 'string' || !proof.log.text || sha256(Buffer.from(proof.log.text)) !== proof.log.sha256) throw new Error('Audit log bytes/hash differ');
  if (kind === 'representative') {
    assertCapturedAuditIdentity(proof.audit_identity, captureAuditIdentity({ root }), manifest);
    const report = parse(files.get(recordFor('report').path), 'simulation report');
    if (!proof.command.includes('cli.mjs audit') || proof.fixed_seed_replay_pass !== true ||
        !Number.isInteger(proof.checkedCombos) || proof.checkedCombos < 1 || !Number.isInteger(proof.comparisons) || proof.comparisons < 1 ||
        proof.comparisons !== report.results?.length ||
        !proof.log.text.includes(`[${spot.id}] PASS: ${proof.checkedCombos} expanded combo decisions, ${proof.comparisons} comparisons, fixed-seed replay.`)) throw new Error('Actual fixed-seed full audit PASS is required');
  } else if (kind === 'all-boards') {
    const path = proof.result?.path?.startsWith(FRONTEND) ? proof.result.path : FRONTEND + proof.result?.path;
    const resultBody = files.get(path), result = resultBody ? parse(resultBody, path) : null;
    const identity = allBoardIdentity({ spot: { id: spot.id }, fingerprint: spot.identity.current_source_fingerprint, config },
      { metadata: { policy_hash: spot.identity.flop_policy_hash } }, { metadata: { policy_hash: spot.identity.later_policy_hash } }, 'all');
    const currentIdentityHash = sha(identity);
    for (const record of identity.code) {
      const path = relative(root, resolve(root, FRONTEND, 'scripts/postflop-ai', record.path)).replaceAll('\\', '/');
      if (!manifest.sources.some(item => item.path === path && item.sha256 === record.sha256)) throw new Error('All-board numerical identity differs from archive source records');
    }
    const coverage = result?.later_coverage;
    if (!proof.command.includes('audit-all-boards.mjs') ||
        proof.street !== 'all' || proof.canonical_flops !== 1755 || proof.errors !== 0 ||
        !Number.isInteger(proof.evaluated_boards) || proof.evaluated_boards < 1 || !Number.isInteger(proof.proven_unreachable) || proof.proven_unreachable < 0 ||
        proof.evaluated_boards + proof.proven_unreachable !== 1755 || path !== summaryPathFor(spot.id, currentIdentityHash) || !spot.evidence.includes(path) ||
        !resultBody || sha256(resultBody) !== proof.result.sha256 || result.spot !== spot.id || result.street !== 'all' || result.boards !== 1755 ||
        proof.identity_hash !== currentIdentityHash || result.identity_hash !== currentIdentityHash || result.source_hash !== proof.source_fingerprint ||
        result.policy_hash !== proof.flop_policy_hash || result.later_policy_hash !== proof.later_policy_hash ||
        result.errors !== 0 || result.evaluated_boards !== proof.evaluated_boards || result.unreachable !== proof.proven_unreachable ||
        !Number.isInteger(result.clean) || result.clean < 0 || result.clean > result.evaluated_boards ||
        !isDeepStrictEqual(proof.later_coverage, coverage) || !coverage || coverage.flops !== result.evaluated_boards || coverage.reachable_flops !== result.evaluated_boards ||
        !['turn_boards', 'unreachable_turn_boards', 'river_runouts', 'unreachable_river_runouts'].every(key => Number.isInteger(coverage[key]) && coverage[key] >= 0) ||
        coverage.turn_boards < 1 || coverage.river_runouts < 1 ||
        !proof.log.text.includes(`${spot.id}: 1755 boards (${proof.proven_unreachable} proven unreachable), ${result.clean} clean, 0 error findings,`) ||
        !Array.isArray(result.findings) || result.findings.some(row => !/^(?:flop|later) warn /.test(row.key) || !Number.isInteger(row.boards) || row.boards < 1)) throw new Error('Complete 1,755-board all-street zero-error audit evidence is required');
    const companionPath = proof.checkpoint_companion?.path?.startsWith(FRONTEND) ? proof.checkpoint_companion.path : FRONTEND + proof.checkpoint_companion?.path;
    const companionBytes = files.get(companionPath);
    if (companionPath !== companionPathFor(spot.id, currentIdentityHash) || !spot.evidence.includes(companionPath) || !companionBytes ||
        sha256(companionBytes) !== proof.checkpoint_companion.sha256) throw new Error('Hash-pinned completed per-board checkpoint companion is required');
    withSnapshot(root, files, () => {
      const inputs = loadInputs(spot.id);
      assertAllBoardCompanion(parse(companionBytes, companionPath), resultBody, identity, inputs);
    }, manifest.inputs);
  } else throw new Error('Unknown audit proof kind');
}
export function assertIndependentReview(receipt, snapshot) {
  const { manifest, manifestBytes, files } = snapshot;
  assertManifest(manifest);
  if (!isDeepStrictEqual(parse(manifestBytes, 'manifest'), manifest)) throw new Error('Review manifest bytes differ');
  if (receipt?.schema_version !== 1 || receipt.review?.status !== 'independently-reviewed' || !receipt.review.reviewer || !receipt.review.author ||
      receipt.review.reviewer === receipt.review.author || !receipt.review.scope || !/^[a-f0-9]{40}$/.test(receipt.review.baseline_commit ?? '') ||
      receipt.manifest_sha256 !== sha256(manifestBytes) || receipt.archive_sha256 !== manifest.archive.sha256 ||
      receipt.content_sha256 !== manifest.content_sha256) throw new Error('A separate matching independent postflop review receipt is required');
  const candidateIds = manifest.spots.filter(spot => spot.classification === 'new-candidate').map(spot => spot.id);
  const accepted = receipt.accepted_new_spots;
  // A receipt can accept a precisely scoped subset while retaining unfinished
  // candidates. Nothing outside accepted_new_spots becomes publishable.
  if (!Array.isArray(accepted) || !accepted.length || new Set(accepted.map(row => row.spot)).size !== accepted.length ||
      accepted.some(row => !candidateIds.includes(row.spot))) throw new Error('Invalid accepted new-spot set');
  const coverage = receipt.coverage, expectedIds = manifest.coverage.expected_new_spot_ids;
  const acceptedIds = accepted.map(row => row.spot).sort(compare);
  if (!['complete-catalog', 'reviewed-subset'].includes(coverage?.scope) ||
      coverage.catalog_sha256 !== manifest.coverage.catalog_sha256 || !isDeepStrictEqual(coverage.expected_new_spot_ids, acceptedIds) ||
      coverage.scope === 'complete-catalog' && !isDeepStrictEqual(acceptedIds, expectedIds) ||
      !Array.isArray(coverage.deferred_new_spots) ||
      !isDeepStrictEqual(coverage.deferred_new_spots.map(row => row.spot), expectedIds.filter(id => !acceptedIds.includes(id))) ||
      coverage.deferred_new_spots.some(row => typeof row.reason !== 'string' || !row.reason.trim())) throw new Error('Review must explicitly cover the complete catalog or name every deferred new spot and reason');
  for (const row of accepted) {
    const spot = manifest.spots.find(item => item.id === row.spot);
    if (spot.identity.policy_status !== 'fresh-pair' || spot.identity.report_status !== 'fresh') throw new Error('Accepted new policy requires a fresh complete report');
    for (const [kind, key] of [['representative', 'representative_evidence'], ['all-boards', 'all_board_evidence']]) {
      if (!spot.evidence.includes(row[key]) || !files.has(row[key])) throw new Error('Independent review audit evidence is missing');
      assertAuditEvidence(parse(files.get(row[key]), row[key]), spot, kind, manifest, files, { root: snapshot.root ?? REPOSITORY });
    }
  }
  const preserved = manifest.spots.filter(spot => spot.classification === 'preserved-legacy').map(spot => spot.id);
  if (!isDeepStrictEqual(receipt.preserved_legacy_spots, preserved)) throw new Error('Independent review preserved-baseline scope differs');
  return { accepted_new_spots: accepted.map(row => row.spot), preserved_legacy_spots: preserved };
}
