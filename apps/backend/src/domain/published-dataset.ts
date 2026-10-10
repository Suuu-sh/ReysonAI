// Names are part of the published-data boundary. The allowlist deliberately
// stays narrower than the files available in the frontend source tree.
const PUBLISHED_DATASET_NAME = /^(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?|profiles\/(?:nit|station|lag|maniac)\/villain\/(?:opening-ranges|preflop-ranges|three-bet-responses|four-bet-responses|five-bet-responses|limp-responses|limp-deep-responses|meta))$/;

export function isPublishedDatasetName(name: string): boolean {
  return PUBLISHED_DATASET_NAME.test(name);
}
