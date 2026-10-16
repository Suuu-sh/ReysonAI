// Node-side authoring inputs. This source identity is isolated from every saved HU hash.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildMw3Catalog } from './mw3-spots.ts';
import { buildMw3InputMaterial } from './mw3-input-core.ts';
export const mw3Root = fileURLToPath(new URL('../..', import.meta.url));
export const mw3Sha = (value: any) : any => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read = (name: any) : any => JSON.parse(readFileSync(join(mw3Root, 'src/estimated', `${name}.json`), 'utf8'));
export function loadMw3Catalog() : any {
  return buildMw3Catalog({ opening: read('opening-ranges'), responses: read('preflop-ranges'), multiway: read('multiway-responses') });
}
export function mw3ArtifactPaths(spot?: any) : any {
  if (spot.kind !== 'mw3_srp' || !/^[a-z0-9-]+$/.test(spot.slug)) throw new Error('Invalid mw3 artifact identity');
  const base = join(mw3Root, '.local/postflop-ai/mw3', spot.slug);
  return { candidate: `${base}-policy.json`, laterCandidate: `${base}-later-policy.json`, report: `${base}-report.json` };
}
export function loadMw3Inputs(id?: any) : any {
  const sources = { opening: read('opening-ranges'), responses: read('preflop-ranges'), multiway: read('multiway-responses') };
  const { fingerprintMaterial, ...inputs } = buildMw3InputMaterial(id, sources);
  return { ...inputs, fingerprint: mw3Sha(fingerprintMaterial) };
}
