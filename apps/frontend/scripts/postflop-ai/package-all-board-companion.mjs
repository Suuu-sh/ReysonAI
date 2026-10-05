// Local-only conversion of finished checkpoint evidence. Never run an audit.
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { allBoardIdentity, writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { buildAllBoardCompanion, companionPathFor, summaryPathFor } from './all-board-companion.mjs';
import { canonicalFlops } from './flop-isomorphism.ts';
import { loadInputs } from './inputs.mjs';
import { loadCandidate, loadLaterCandidate } from './generate.mjs';
import { ARTIFACT_PREFIX, assertSafeFile, readSafeFile, sha256 } from './reviewed-postflop-archive.mjs';

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
export function packageAllBoardCompanion(spotId) {
  const inputs = loadInputs(spotId), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
  if (!inputs.spot.history || !later) throw new Error('New HU spot and its own later policy are required');
  const identity = allBoardIdentity(inputs, candidate, later, 'all'), hash = sha256(JSON.stringify(identity));
  const base = `${ARTIFACT_PREFIX}all-boards-audit/checkpoints/${hash}`;
  const savedIdentity = JSON.parse(readSafeFile(REPOSITORY, `${base}/identity.json`));
  if (!isDeepStrictEqual(identity, savedIdentity)) throw new Error('Completed checkpoint identity changed');
  const summaryBytes = readSafeFile(REPOSITORY, summaryPathFor(spotId, hash));
  let total = 0;
  const checkpoints = canonicalFlops().map(board => {
    const bytes = readSafeFile(REPOSITORY, `${base}/${board.id}.json`, 512 * 1024);
    total += bytes.length;
    if (total > 16 * 1024 * 1024) throw new Error('Checkpoint evidence exceeds bounded companion budget');
    return JSON.parse(bytes);
  });
  const { bytes } = buildAllBoardCompanion(identity, summaryBytes, checkpoints, inputs), path = companionPathFor(spotId, hash);
  assertSafeFile(REPOSITORY, path, { missing: true });
  writeImmutableAllBoardOutput(join(REPOSITORY, path), bytes);
  return { path, sha256: sha256(bytes), bytes: bytes.length, rows: 1755, original_summary_sha256: sha256(summaryBytes), review_approved: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, id, ...extra] = process.argv.slice(2);
  if (flag !== '--spot' || !id || extra.length) throw new Error('Usage: package-all-board-companion.mjs --spot ID');
  console.log(JSON.stringify(packageAllBoardCompanion(id)));
}
