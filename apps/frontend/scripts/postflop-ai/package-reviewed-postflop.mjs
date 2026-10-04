// LOCAL ONLY: package existing explicit artifacts. Never generate or approve.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARCHIVE_FILE, MANIFEST_FILE, REPOSITORY, collectSnapshot } from './reviewed-postflop.mjs';
import { assertSafeFile, jsonBytes } from './reviewed-postflop-archive.mjs';
export function packageSnapshot(options = {}) {
  const root = options.root ?? REPOSITORY, manifestPath = options.manifestPath ?? MANIFEST_FILE;
  if (!/^artifacts\/postflop\/[a-z0-9-]+\.manifest\.json$/.test(manifestPath)) throw new Error('Manifest must be a postflop artifact sidecar');
  const { manifest, compressed } = collectSnapshot(options);
  // Refuse an accidental overwrite of a prior bundle; use a new name or remove
  // the explicitly selected unapproved local outputs outside this command.
  for (const path of [manifest.archive.path, manifestPath]) {
    assertSafeFile(root, path, { missing: true });
    if (existsSync(join(root, path))) throw new Error(`Refuse to overwrite an existing snapshot: ${path}`);
  }
  for (const path of [manifest.archive.path, manifestPath]) mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, manifest.archive.path), compressed, { flag: 'wx' });
  writeFileSync(join(root, manifestPath), jsonBytes(manifest), { flag: 'wx' });
  return { archive: manifest.archive, manifest: manifestPath, artifacts: manifest.artifacts.length,
    new_candidates: manifest.spots.filter(spot => spot.classification === 'new-candidate').length,
    preserved_legacy: manifest.spots.filter(spot => spot.classification === 'preserved-legacy').length, review_approved: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = { spots: [], preserved: [], evidence: [], archivePath: ARCHIVE_FILE, manifestPath: MANIFEST_FILE };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--all-present') { options.allPresent = true; continue; }
    if (!['--spot', '--preserve-legacy', '--evidence', '--archive', '--manifest'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: package-reviewed-postflop.mjs (--all-present | --spot ID | --preserve-legacy ID) [--evidence frontend-relative.json] [--archive artifacts/postflop/NAME.tar.gz --manifest artifacts/postflop/NAME.manifest.json]');
    const value = args[++i];
    if (flag === '--spot') options.spots.push(value);
    else if (flag === '--preserve-legacy') options.preserved.push(value);
    else if (flag === '--evidence') options.evidence.push(value);
    else options[flag === '--archive' ? 'archivePath' : 'manifestPath'] = value;
  }
  console.log(JSON.stringify(packageSnapshot(options)));
}
