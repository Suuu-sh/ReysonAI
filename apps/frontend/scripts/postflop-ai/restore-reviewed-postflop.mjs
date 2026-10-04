// Restore verified bytes only. Unapproved local candidates require explicit opt-in.
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE, REPOSITORY, assertIndependentReview, readSnapshot } from './reviewed-postflop.mjs';
import { LIMITS, readSafeFile, restoreBytes } from './reviewed-postflop-archive.mjs';
import { parseVerifyArguments } from './verify-reviewed-postflop.mjs';
export function restoreSnapshot({ root = REPOSITORY, manifestPath = MANIFEST_FILE, reviewPath = null, allowUnapproved = false } = {}) {
  if (!reviewPath && !allowUnapproved) throw new Error('Restoration requires --review PATH or explicit --allow-unapproved; restoration is never acceptance');
  const snapshot = readSnapshot(root, manifestPath);
  const approval = reviewPath ? assertIndependentReview(JSON.parse(readSafeFile(root, reviewPath, LIMITS.manifest)), snapshot) : null;
  return { status: approval ? 'restored-reviewed-snapshot-bytes' : 'restored-unapproved-candidates',
    ...restoreBytes(root, snapshot.manifest, snapshot.files), approval };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), allowUnapproved = args.includes('--allow-unapproved');
  console.log(JSON.stringify(restoreSnapshot({ ...parseVerifyArguments(args.filter(arg => arg !== '--allow-unapproved')), allowUnapproved })));
}
