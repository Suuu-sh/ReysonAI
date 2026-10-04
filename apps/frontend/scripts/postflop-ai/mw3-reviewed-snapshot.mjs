// Collect/verify saved Mw3 bytes only. Never compile a recipe or infer acceptance.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMw3Inputs, mw3Sha } from './mw3-inputs.mjs';
import { MW3_SEMANTIC_SOURCES, mw3Contract, mw3ImplementationHash, verifyMw3Artifact } from './mw3-artifacts.mjs';
import { MW3_PILOT_AUTHORSHIP } from '../data/mw3-co-btn-bb-authored.mjs';
import { resolveMw3AuthorIdentity } from './mw3-authored-source.mjs';
import { currentMw3SourceTree, verifyMw3SourceTree } from './mw3-source-tree.mjs';
import { verifyMw3Evidence } from './mw3-acceptance-evidence.mjs';
import { assertSafeFile, fileRecord, safeRelativePath } from './reviewed-postflop-archive.mjs';
import { MW3_ARTIFACT_PREFIX, MW3_ARCHIVE_LIMITS, MW3_REPORT_NAMES, assertMw3ArchiveManifest, mw3ArchivePaths,
  mw3ArchiveContentHash, encodeMw3Archive, decodeMw3Archive, readSafeFile, jsonBytes, sha256 } from './mw3-reviewed-archive.mjs';
export const MW3_REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
const FRONTEND = 'apps/frontend/';
const inputPaths = ['opening-ranges', 'preflop-ranges', 'multiway-responses'].map(name => `${FRONTEND}src/estimated/${name}.json`).sort();
const gateFiles = ['mw3-audit.mjs', 'mw3-simulation.mjs', 'mw3-simulation-report.mjs', 'flop-isomorphism.mjs', '../data/postflop-ai-pilot.json'];
const json = (body, label) => { try { return JSON.parse(body.toString('utf8')); } catch { throw new Error(`Malformed saved Mw3 JSON: ${label}`); } };
export function currentMw3ArchiveIdentity(spotId) {
  const inputs = loadMw3Inputs(spotId), implementationHash = mw3ImplementationHash(), isPilot = spotId === MW3_PILOT_AUTHORSHIP.spotId;
  const recipe = isPilot ? { author: MW3_PILOT_AUTHORSHIP, recipeSha256: sha256(readSafeFile(MW3_REPOSITORY, `${FRONTEND}scripts/data/mw3-co-btn-bb-authored.mjs`)),
    authorTask: `mw3-co-btn-bb-authored-v${MW3_PILOT_AUTHORSHIP.version}`, sourceFiles: ['scripts/data/mw3-co-btn-bb-authored.mjs'] }
    : resolveMw3AuthorIdentity({ spotId, model: 'gpt-6-astra', sourceHash: inputs.fingerprint });
  if (recipe.author.sourceFingerprint !== inputs.fingerprint) throw new Error('Stale Mw3 recipe source');
  const verificationFiles = [...(isPilot ? ['gate-mw3-pilot.mjs'] : ['gate-mw3-authored.mjs', 'mw3-author-cli.mjs', 'mw3-authored-source.mjs']), ...gateFiles];
  const verificationHash = mw3Sha(Object.fromEntries(verificationFiles.map(path => [path, readFileSync(join(MW3_REPOSITORY, FRONTEND, 'scripts/postflop-ai', path), 'utf8')])));
  const suffix = `v${recipe.author.version}-${inputs.fingerprint.slice(0, 12)}-${implementationHash.slice(0, 12)}-${verificationHash.slice(0, 12)}`;
  const gateDirectory = isPilot ? `${MW3_ARTIFACT_PREFIX}pilot-gate/${suffix}` : `${MW3_ARTIFACT_PREFIX}gates/${inputs.spot.slug}/${suffix}-${recipe.recipeSha256.slice(0, 12)}`;
  return { ...recipe, inputs, implementationHash, verificationHash, gateDirectory,
    sourceFiles: recipe.sourceFiles ?? recipe.author.sourceFiles, verificationFiles };
}
function sourcePathsFor(identity) {
  const found = new Set(), visit = path => {
    path = path.replaceAll('\\', '/');
    if (!safeRelativePath(path) || path.includes('/.local/') || path.includes('/node_modules/')) throw new Error('Mw3 source dependency escaped repository source');
    if (found.has(path) || inputPaths.includes(path)) return;
    assertSafeFile(MW3_REPOSITORY, path); found.add(path);
    if (!/\.(?:mjs|ts|tsx|js)$/.test(path)) return;
    const text = readSafeFile(MW3_REPOSITORY, path).toString('utf8');
    const imports = /(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of text.matchAll(imports)) {
      const name = match[1] ?? match[2];
      if (name.startsWith('.')) visit(relative(MW3_REPOSITORY, resolve(MW3_REPOSITORY, dirname(path), name)));
    }
  };
  const roots = [...MW3_SEMANTIC_SOURCES, ...identity.verificationFiles,
    'mw3-reviewed-archive.mjs', 'mw3-reviewed-snapshot.mjs', 'mw3-reviewed-delivery.mjs', 'mw3-reviewed-restore.mjs', 'mw3-snapshot-cli.mjs', 'mw3-acceptance-evidence.mjs', 'mw3-browser-inputs.mjs', 'mw3-transport.mjs', 'mw3-delivery.mjs'];
  roots.forEach(name => visit(relative(MW3_REPOSITORY, resolve(MW3_REPOSITORY, FRONTEND, 'scripts/postflop-ai', name))));
  identity.sourceFiles.forEach(path => visit(FRONTEND + path));
  // Binding the consumer/backend source independently keeps presentation out of
  // the numerical hash while preventing unreviewed transport dispatch changes.
  ['apps/backend/src/index.ts', 'apps/backend/src/mw3-transport.ts', 'apps/backend/scripts/sql/mw3-schema.sql', 'apps/shared/mw3-approved.ts',
    `${FRONTEND}src/estimated/mw3-browser.ts`, `${FRONTEND}src/estimated/Mw3RangeView.tsx`, `${FRONTEND}src/estimated/RangeWorkspace.tsx`,
    `${FRONTEND}src/agent/mw3-hand.ts`, `${FRONTEND}src/agent/hand.ts`, `${FRONTEND}src/agent/AgentTable.tsx`,
    `${FRONTEND}package.json`, `${FRONTEND}package-lock.json`, 'configs/cash-6max-100bb.json', '.gitattributes'].forEach(visit);
  return [...found].sort();
}
function verifyBodies(identity, spot, files) {
  const paths = mw3ArchivePaths(spot), candidates = {};
  for (const kind of ['candidate', 'laterCandidate']) {
    const artifact = verifyMw3Artifact(identity.inputs, json(files.get(paths[kind]), kind), { kind, implementationHash: identity.implementationHash });
    if (artifact.metadata.approval_status !== 'candidate_pending_independent_review' || artifact.metadata.recipe_sha256 !== identity.recipeSha256 ||
        artifact.metadata.author_task !== identity.authorTask) throw new Error('Mw3 saved author provenance changed');
    candidates[kind] = artifact;
  }
  if (candidates.candidate.metadata.policy_hash !== spot.flop_policy_hash || candidates.laterCandidate.metadata.policy_hash !== spot.later_policy_hash) throw new Error('Mw3 manifest policy identity differs');
  const reports = Object.fromEntries(MW3_REPORT_NAMES.map(name => [name, json(files.get(paths[name]), name)]));
  const contract = mw3Contract(identity.inputs);
  const evidence = verifyMw3Evidence(identity.inputs, reports, { sourceHash: spot.source_hash, implementationHash: spot.implementation_hash,
    verificationHash: spot.verification_hash, recipeSha256: spot.recipe_sha256, flopHash: spot.flop_policy_hash, laterHash: spot.later_policy_hash,
    authorVersion: spot.author_version, policyContexts: Object.values(contract.contexts).filter(row => row.street === 'flop').length });
  return { candidates, reports, evidence };
}
export function collectMw3Snapshot(spotId) {
  const identity = currentMw3ArchiveIdentity(spotId), { inputs } = identity;
  const spot = { id: spotId, slug: inputs.spot.slug, author_version: identity.author.version, author_model: 'gpt-6-astra',
    source_hash: inputs.fingerprint, implementation_hash: identity.implementationHash, verification_hash: identity.verificationHash,
    recipe_sha256: identity.recipeSha256, gate_directory: identity.gateDirectory };
  const paths = mw3ArchivePaths(spot), files = new Map(Object.values(paths).map(path => [path, readSafeFile(MW3_REPOSITORY, path, MW3_ARCHIVE_LIMITS.file)]));
  spot.flop_policy_hash = json(files.get(paths.candidate), 'candidate').metadata?.policy_hash;
  spot.later_policy_hash = json(files.get(paths.laterCandidate), 'laterCandidate').metadata?.policy_hash;
  const checked = verifyBodies(identity, spot, files);
  const artifacts = Object.entries(paths).map(([kind, path]) => { const body = files.get(path), hash = sha256(body); return { path, kind, spot: spotId, bytes: body.length, sha256: hash, entry: `objects/${hash}` }; }).sort((a, b) => a.path < b.path ? -1 : 1);
  const sources = sourcePathsFor(identity).map(path => fileRecord(MW3_REPOSITORY, path)), inputsRecords = inputPaths.map(path => fileRecord(MW3_REPOSITORY, path));
  const sourceTree = currentMw3SourceTree(MW3_REPOSITORY);
  verifyMw3SourceTree(MW3_REPOSITORY, sourceTree, [...sources, ...inputsRecords]);
  const compressed = encodeMw3Archive(artifacts, files);
  const manifest = { schema_version: 1, kind: 'mw3-artifact-snapshot', approval: 'unapproved', source_tree: sourceTree, spot, sources, inputs: inputsRecords,
    sources_sha256: sha256(jsonBytes(sources)), inputs_sha256: sha256(jsonBytes(inputsRecords)), artifacts,
    archive: { path: `artifacts/postflop/mw3-${spot.slug}.tar.gz`, format: 'ustar+gzip-content-addressed-v1', bytes: compressed.length, sha256: sha256(compressed) } };
  manifest.content_sha256 = mw3ArchiveContentHash(manifest); assertMw3ArchiveManifest(manifest);
  decodeMw3Archive(compressed, manifest);
  return { manifest, manifestBytes: jsonBytes(manifest), compressed, files, ...checked };
}
export function verifyMw3Snapshot(manifestBytes, compressed) {
  if (!Buffer.isBuffer(manifestBytes) || manifestBytes.length > MW3_ARCHIVE_LIMITS.manifest) throw new Error('Oversized/missing Mw3 manifest');
  const manifest = assertMw3ArchiveManifest(json(manifestBytes, 'manifest')), files = decodeMw3Archive(compressed, manifest), identity = currentMw3ArchiveIdentity(manifest.spot.id);
  if (manifest.spot.source_hash !== identity.inputs.fingerprint || manifest.spot.implementation_hash !== identity.implementationHash ||
      manifest.spot.verification_hash !== identity.verificationHash || manifest.spot.recipe_sha256 !== identity.recipeSha256 ||
      manifest.spot.gate_directory !== identity.gateDirectory || manifest.spot.slug !== identity.inputs.spot.slug || manifest.spot.author_version !== identity.author.version) throw new Error('Stale Mw3 snapshot identity');
  for (const [records, paths] of [[manifest.sources, sourcePathsFor(identity)], [manifest.inputs, inputPaths]]) {
    if (JSON.stringify(records.map(row => row.path)) !== JSON.stringify(paths)) throw new Error('Mw3 source/input dependency inventory differs');
    for (const row of records) { const current = fileRecord(MW3_REPOSITORY, row.path); if (current.bytes !== row.bytes || current.sha256 !== row.sha256) throw new Error(`Mw3 source/input bytes changed: ${row.path}`); }
  }
  verifyMw3SourceTree(MW3_REPOSITORY, manifest.source_tree, [...manifest.sources, ...manifest.inputs]);
  return { manifest, manifestBytes, compressed, files, ...verifyBodies(identity, manifest.spot, files) };
}
export function saveMw3Snapshot(snapshot) {
  assertMw3ArchiveManifest(snapshot.manifest);
  if (!Buffer.isBuffer(snapshot.manifestBytes) || !snapshot.manifestBytes.equals(jsonBytes(snapshot.manifest))) throw new Error('Mw3 saved manifest bytes differ');
  decodeMw3Archive(snapshot.compressed, snapshot.manifest);
  // Preflight both outputs before any writes. Different old bytes stay intact.
  const records = [[snapshot.manifest.archive.path, snapshot.compressed],
    [snapshot.manifest.archive.path.replace(/\.tar\.gz$/, '.manifest.json'), snapshot.manifestBytes]];
  for (const [path, bytes] of records) {
    assertSafeFile(MW3_REPOSITORY, path, { missing: true });
    if (existsSync(join(MW3_REPOSITORY, path)) && !readFileSync(join(MW3_REPOSITORY, path)).equals(bytes)) throw new Error('Existing Mw3 archive/manifest differs and is preserved');
  }
  for (const [path, bytes] of records) {
    mkdirSync(dirname(join(MW3_REPOSITORY, path)), { recursive: true }); assertSafeFile(MW3_REPOSITORY, path, { missing: true });
    if (existsSync(join(MW3_REPOSITORY, path))) { if (!readFileSync(join(MW3_REPOSITORY, path)).equals(bytes)) throw new Error('Mw3 archive changed during save'); }
    else writeFileSync(join(MW3_REPOSITORY, path), bytes, { flag: 'wx' });
  }
  return records.map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) }));
}
