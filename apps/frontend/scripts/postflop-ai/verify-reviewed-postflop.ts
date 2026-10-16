// Read-only CI/local verification. Does not regenerate, package, approve or publish.
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE, REPOSITORY, assertIndependentReview, readSnapshot } from './reviewed-postflop.ts';
import { LIMITS, readSafeFile } from './reviewed-postflop-archive.ts';
export function verifySnapshot({ root = REPOSITORY, manifestPath = MANIFEST_FILE, reviewPath = null }: any = {}) : any {
  const snapshot = readSnapshot(root, manifestPath);
  const approval: any = reviewPath ? assertIndependentReview(JSON.parse(readSafeFile(root, reviewPath, LIMITS.manifest)), snapshot) : null;
  return { status: approval ? 'independently-reviewed-subset-verified' : 'unapproved-snapshot-integrity-verified',
    artifacts: snapshot.files.size, archive: snapshot.manifest.archive, approval };
}
export function parseVerifyArguments(args?: any) : any {
  const options: Record<string, any> = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--manifest', '--review'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: verify-reviewed-postflop.ts [--manifest PATH] [--review PATH]');
    options[args[i] === '--manifest' ? 'manifestPath' : 'reviewPath'] = args[++i];
  }
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifySnapshot(parseVerifyArguments(process.argv.slice(2)))));
