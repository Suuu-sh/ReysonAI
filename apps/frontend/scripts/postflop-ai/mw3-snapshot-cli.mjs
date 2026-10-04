// Local, explicit archive operations. No generation, upload, database execution,
// receipt approval or deployment. CI may verify/restore already saved bytes only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MW3_REPOSITORY, collectMw3Snapshot, currentMw3ArchiveIdentity, saveMw3Snapshot, verifyMw3Snapshot } from './mw3-reviewed-snapshot.mjs';
import { restoreMw3ArchiveBytes, readSafeFile, MW3_ARCHIVE_LIMITS, sha256 } from './mw3-reviewed-archive.mjs';
import { prepareMw3SnapshotDeliveries, buildMw3DeliverySql } from './mw3-reviewed-delivery.mjs';
import { assertSafeFile } from './reviewed-postflop-archive.mjs';
const [command, ...args] = process.argv.slice(2), values = {};
if (!['package', 'verify', 'restore', 'sql'].includes(command)) throw new Error('Specify package, verify, restore or sql');
for (let index = 0; index < args.length; index += 2) {
  const key = args[index], value = args[index + 1];
  if (!['--spot', '--source-hash', ...(command === 'restore' ? ['--restore-root'] : [])].includes(key) || Object.hasOwn(values, key) ||
      typeof value !== 'string' || value.startsWith('--')) throw new Error('Unknown/repeated/missing archive argument');
  values[key] = value;
}
if (Object.keys(values).length !== (command === 'restore' ? 3 : 2) || !/^[A-Za-z0-9_]{1,100}$/.test(values['--spot']) || !/^[a-f0-9]{64}$/.test(values['--source-hash'])) throw new Error('Explicit --spot and --source-hash required');
const identity = currentMw3ArchiveIdentity(values['--spot']);
if (identity.inputs.fingerprint !== values['--source-hash']) throw new Error('Requested archive source is stale');
const stem = `artifacts/postflop/mw3-${identity.inputs.spot.slug}`;
if (command === 'package') {
  const snapshot = collectMw3Snapshot(values['--spot']);
  console.log(JSON.stringify({ status: 'unapproved_preservation_only', files: saveMw3Snapshot(snapshot), evidence: snapshot.evidence }, null, 2));
} else {
  const snapshot = verifyMw3Snapshot(readSafeFile(MW3_REPOSITORY, `${stem}.manifest.json`, MW3_ARCHIVE_LIMITS.manifest),
    readSafeFile(MW3_REPOSITORY, `${stem}.tar.gz`, MW3_ARCHIVE_LIMITS.compressed));
  if (command === 'restore') {
    const result = restoreMw3ArchiveBytes(resolve(values['--restore-root']), snapshot.manifest, snapshot.files);
    console.log(JSON.stringify({ status: 'verified_bytes_restored_not_approved', ...result }));
  } else if (command === 'sql') {
    const receiptPath = `configs/mw3-${identity.inputs.spot.slug}.review.json`;
    const receipt = JSON.parse(readSafeFile(MW3_REPOSITORY, receiptPath, MW3_ARCHIVE_LIMITS.manifest).toString('utf8'));
    const sql = buildMw3DeliverySql(snapshot, receipt, await prepareMw3SnapshotDeliveries(snapshot));
    const path = `${stem}.sql`; assertSafeFile(MW3_REPOSITORY, path, { missing: true });
    // The output path is fixed to the exact spot; differing prior SQL is retained.
    try { writeFileSync(join(MW3_REPOSITORY, path), sql, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST' || readFileSync(join(MW3_REPOSITORY, path), 'utf8') !== sql) throw error; }
    console.log(JSON.stringify({ path, bytes: Buffer.byteLength(sql), sha256: sha256(sql), status: 'sql_only_not_executed' }));
  } else console.log(JSON.stringify({ status: 'saved_bytes_verified_not_approved', spot: snapshot.manifest.spot.id, evidence: snapshot.evidence }));
}
