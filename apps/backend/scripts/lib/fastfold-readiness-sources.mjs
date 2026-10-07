import { createHash } from 'node:crypto';

// Exact deployed five-bet payload before the reviewed reason-copy corrections.
// This is the only predeploy source exception; policy/decision fields still
// have to match the checked-out reviewed source exactly.
export const PRIOR_REVIEWED_FASTFOLD_SOURCE = Object.freeze({
  name: 'five-bet-responses',
  bytes: 672183,
  hash: '14ca0bf72f17011e3cbbdea98ff106d9825f6141ee04072f052c4702894f4f76',
});

export function matchesPriorReviewedSource(name, record) {
  return name === PRIOR_REVIEWED_FASTFOLD_SOURCE.name &&
    record?.hash === PRIOR_REVIEWED_FASTFOLD_SOURCE.hash &&
    record?.bytes === PRIOR_REVIEWED_FASTFOLD_SOURCE.bytes;
}

export function decisionFieldsHash(value) {
  const decisionOnly = {
    ...value,
    spots: value.spots.map(spot => ({
      ...spot,
      hands: spot.hands.map(({ reason, ...decision }) => decision),
    })),
  };
  return createHash('sha256').update(JSON.stringify(decisionOnly)).digest('hex');
}

export function matchesDecisionFields(current, prior) {
  return decisionFieldsHash(current) === decisionFieldsHash(prior);
}
