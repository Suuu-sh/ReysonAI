// Browser/Node shared input material. Exactly the same source object is hashed by
// both runtimes; this module neither reads files nor accepts a substitute HU source.
import { buildMw3Catalog, MW3_VERSION } from './mw3-spots.mjs';
import { MW3_HAND_CLASSIFIER_VERSION, MW3_TIERS } from './mw3-hand-features.mjs';
import { MW3_SIZING } from './mw3-engine.mjs';
export function buildMw3InputMaterial(id, sources) {
  const spot = buildMw3Catalog(sources).find(spot => spot.id === id);
  if (!spot) throw new Error(`Unknown mw3 SRP: ${id}`);
  if (!spot.reachable) throw new Error(`Unreachable mw3 SRP: ${id}: ${spot.unavailableReason}`);
  const sourceSpots = { opening: sources.opening.spots.find(item => item.id === spot.sources.openingId),
    response: sources.responses.spots.find(item => item.id === spot.sources.firstResponseId),
    multiway: sources.multiway.spots.find(item => item.id === spot.sources.multiwayResponseId) };
  const geometry = { kind: spot.kind, id: spot.id, seats: spot.seats, opener: spot.opener, firstCaller: spot.firstCaller,
    secondCaller: spot.secondCaller, potBb: spot.potBb, stackBb: spot.stackBb, openBb: spot.openBb };
  const fingerprintMaterial = { version: MW3_VERSION, geometry, sourceSpots, sizing: MW3_SIZING,
    rake: { rate: 0.05, capBb: 3, noFlopNoDrop: true }, evaluator: 'continuation-best-five-v1',
    classifier: { version: MW3_HAND_CLASSIFIER_VERSION, tiers: MW3_TIERS },
    sourceScope: 'three_live_ranges_forced_fold_holecards_unmodeled' };
  return { spot, seatRows: spot.seatRows, sourceSpots, sizing: MW3_SIZING, fingerprintMaterial };
}
