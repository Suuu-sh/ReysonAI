// Node-side authoring inputs. This source identity is isolated from every saved HU hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildMw3Catalog, MW3_VERSION } from './mw3-spots.mjs';
import { MW3_SIZING } from './mw3-engine.mjs';
export const mw3Root = fileURLToPath(new URL('../..', import.meta.url));
export const mw3Sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = name => JSON.parse(readFileSync(join(mw3Root, 'src/estimated', `${name}.json`), 'utf8'));
export function loadMw3Catalog() {
  return buildMw3Catalog({ opening: read('opening-ranges'), responses: read('preflop-ranges'), multiway: read('multiway-responses') });
}
export function mw3ArtifactPaths(spot) {
  if (spot.kind !== 'mw3_srp' || !/^[a-z0-9-]+$/.test(spot.slug)) throw new Error('Invalid mw3 artifact identity');
  const base = join(mw3Root, '.local/postflop-ai/mw3', spot.slug);
  return { candidate: `${base}-policy.json`, laterCandidate: `${base}-later-policy.json`, report: `${base}-report.json` };
}
export function loadMw3Inputs(id) {
  const sources = { opening: read('opening-ranges'), responses: read('preflop-ranges'), multiway: read('multiway-responses') };
  const spot = buildMw3Catalog(sources).find(spot => spot.id === id);
  if (!spot) throw new Error(`Unknown mw3 SRP: ${id}`);
  if (!spot.reachable) throw new Error(`Unreachable mw3 SRP: ${id}: ${spot.unavailableReason}`);
  const sourceSpots = { opening: sources.opening.spots.find(item => item.id === spot.sources.openingId),
    response: sources.responses.spots.find(item => item.id === spot.sources.firstResponseId),
    multiway: sources.multiway.spots.find(item => item.id === spot.sources.multiwayResponseId) };
  const geometry = { kind: spot.kind, id: spot.id, seats: spot.seats, opener: spot.opener, firstCaller: spot.firstCaller,
    secondCaller: spot.secondCaller, potBb: spot.potBb, stackBb: spot.stackBb, openBb: spot.openBb };
  const fingerprint = mw3Sha({ version: MW3_VERSION, geometry, sourceSpots, sizing: MW3_SIZING,
    rake: { rate: 0.05, capBb: 3, noFlopNoDrop: true }, evaluator: 'continuation-best-five-v1',
    sourceScope: 'three_live_ranges_forced_fold_holecards_unmodeled' });
  return { spot, seatRows: spot.seatRows, sourceSpots, fingerprint, sizing: MW3_SIZING };
}
