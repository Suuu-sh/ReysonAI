import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const runner = resolve(repository, 'apps/frontend/docs/qa/pr123-baseline-evidence/reproduce-standard-output-parity.sh');

test('PR123 replay runner checks manifest bytes and avoids the removed canonicalSha256 field', () => {
  const source = readFileSync(runner, 'utf8');
  assert.doesNotMatch(source, /closure\.canonicalSha256/);
  assert.match(source, /Exact runtime closure manifest bytes changed/);
  const output = execFileSync('bash', [runner, '--check-manifests'], { cwd: repository, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), {
    closureFiles: 70,
    closureManifestSha256: 'c28d77a70470845f89c37e1659c8b9a9b4b84ad6f6bca669f2e1df5e32a70d1c',
    inheritedJsonInputs: 11,
    inputManifestSha256: '9d8b9152e41c62f119c52472e9762313447a08dffe62026a6d51da13193da179',
  });
});
