// Derive bounded immutable SQL from restored, independently accepted bytes only.
// Nothing here opens D1, runs Wrangler, uploads LFS or grants approval.
import { prepareMw3Transport } from './mw3-transport.mjs';
import { jsonBytes, sha256 } from './mw3-reviewed-archive.mjs';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export const MW3_SQL_STATEMENT_LIMIT = 90_000;
export async function prepareMw3SnapshotDeliveries(snapshot) {
  const deliveries = [];
  for (const [stage, kind] of [['flop', 'candidate'], ['later', 'laterCandidate']]) {
    const record = await prepareMw3Transport(snapshot.candidates[kind], stage);
    deliveries.push({ stage, ...record });
  }
  return deliveries;
}
export function mw3DeliveryPins(snapshot, deliveries) {
  const spot = snapshot.manifest.spot;
  if (!Array.isArray(deliveries) || deliveries.length !== 2 || deliveries[0].stage !== 'flop' || deliveries[1].stage !== 'later') throw new Error('Mw3 delivery pair required');
  return deliveries.map(row => {
    const policyHash = row.stage === 'flop' ? spot.flop_policy_hash : spot.later_policy_hash;
    if (!hash(row.deliveryHash) || sha256(row.headerText) !== row.deliveryHash || row.header.stage !== row.stage ||
        JSON.stringify(row.header.manifest.stages) !== JSON.stringify(row.stage === 'flop' ? ['flop'] : ['turn', 'river']) ||
        row.header.metadata.policy_hash !== policyHash || row.header.manifest.policyHash !== policyHash ||
        row.header.manifest.spotId !== spot.id || row.header.metadata.implementation_hash !== spot.implementation_hash || row.header.metadata.source_hash !== spot.source_hash) throw new Error('Mw3 delivery identity differs');
    return { spotId: spot.id, stage: row.stage, deliveryHash: row.deliveryHash, implementationHash: spot.implementation_hash, policyHash, sourceHash: spot.source_hash };
  });
}
export function assertMw3IndependentReceipt(review, snapshot, deliveries) {
  const { manifest, manifestBytes, evidence, candidates } = snapshot, spot = manifest.spot;
  const pins = mw3DeliveryPins(snapshot, deliveries);
  if (review?.schema_version !== 1 || review.kind !== 'mw3-independent-acceptance' || review.status !== 'independently-reviewed' ||
      review.strategy_type !== 'ai_estimate_not_gto' || review.author_model !== 'gpt-6-astra' || review.reviewer_model !== 'gpt-6-astra' ||
      typeof review.reviewer_task !== 'string' || !review.reviewer_task.trim() || review.reviewer_task === candidates.candidate.metadata.author_task ||
      typeof review.author_task !== 'string' || review.author_task !== candidates.candidate.metadata.author_task ||
      review.source_tree !== manifest.source_tree || !/^[a-f0-9]{40}$/.test(review.source_tree) || typeof review.scope !== 'string' || !review.scope.trim() ||
      review.manifest_sha256 !== sha256(manifestBytes) || review.archive_sha256 !== manifest.archive.sha256 || review.content_sha256 !== manifest.content_sha256 ||
      review.sources_sha256 !== manifest.sources_sha256 || review.inputs_sha256 !== manifest.inputs_sha256 || review.spot !== spot.id ||
      JSON.stringify(review.deliveries) !== JSON.stringify(pins) ||
      JSON.stringify(review.evidence) !== JSON.stringify(evidence) ||
      !Array.isArray(review.accepted_limitations) || review.accepted_limitations.length !== evidence.limitations.length ||
      review.accepted_limitations.some((value, index) => value !== evidence.limitations[index])) throw new Error('Separate matching independent Mw3 acceptance receipt required');
  return review;
}
export function buildMw3DeliverySql(snapshot, review, deliveries) {
  assertMw3IndependentReceipt(review, snapshot, deliveries);
  const statements = ['-- Immutable, spot-scoped Mw3 delivery. Execute one complete file as a single D1 batch.',
    `-- receipt ${sha256(jsonBytes(review))}; archive ${snapshot.manifest.archive.sha256}`];
  const add = sql => { if (Buffer.byteLength(sql) > MW3_SQL_STATEMENT_LIMIT) throw new Error('Mw3 SQL statement exceeds D1 byte budget'); statements.push(sql); };
  for (const row of deliveries) {
    const { deliveryHash, headerText, header, stage, parts } = row;
    if (JSON.stringify(header) !== headerText || parts.length !== header.manifest.parts || parts.length !== header.partHashes.length ||
        parts.some((part, index) => part.part !== index || typeof part.body !== 'string' || part.body.length > 16000 ||
          sha256(part.body) !== header.partHashes[index] || part.bodyHash !== header.partHashes[index])) throw new Error('Mw3 SQL parts differ from accepted header');
    // Same-hash retry is idempotent. A conflicting immutable row deliberately
    // violates NOT NULL, making the *whole batch* fail instead of overwriting it.
    add(`INSERT INTO mw3_policy_deliveries (delivery_hash, spot_id, stage, header_json) VALUES (${quote(deliveryHash)}, ${quote(header.manifest.spotId)}, ${quote(stage)}, ${quote(headerText)}) ON CONFLICT(delivery_hash) DO UPDATE SET header_json = CASE WHEN spot_id = excluded.spot_id AND stage = excluded.stage AND header_json = excluded.header_json THEN header_json ELSE NULL END;`);
    for (const part of parts) add(`INSERT INTO mw3_policy_parts (delivery_hash, part, body) VALUES (${quote(deliveryHash)}, ${part.part}, ${quote(part.body)}) ON CONFLICT(delivery_hash, part) DO UPDATE SET body = CASE WHEN body = excluded.body THEN body ELSE NULL END;`);
  }
  return `${statements.join('\n')}\n`;
}
