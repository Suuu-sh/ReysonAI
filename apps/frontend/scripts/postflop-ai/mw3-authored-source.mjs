// Resolve only a reviewed source recipe. No API/optimizer/strategy fallback.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMw3Author } from '../data/mw3-authored/registry.mjs';
import { loadMw3Inputs, mw3Root, mw3Sha } from './mw3-inputs.mjs';
import { mw3Contract, mw3ImplementationHash } from './mw3-artifacts.mjs';
import { assertSafeFile } from './reviewed-postflop-archive.mjs';
export function resolveMw3AuthorIdentity({ spotId, model, sourceHash }) {
  if (spotId === 'CO_open_BTN_call_BB_call' || model !== 'gpt-6-astra' || !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid explicit non-pilot Astra identity');
  const author = getMw3Author(spotId);
  if (author.spotId !== spotId || author.model !== model || author.sourceFingerprint !== sourceHash || !Number.isSafeInteger(author.version) || author.version < 1 || typeof author.build !== 'function') throw new Error('Missing or mismatched explicit Astra author identity');
  const inputs = loadMw3Inputs(spotId);
  if (inputs.fingerprint !== sourceHash) throw new Error('Stale Mw3 authored source');
  if (!Array.isArray(author.sourceFiles) || !author.sourceFiles.length || author.sourceFiles.length > 100 || new Set(author.sourceFiles).size !== author.sourceFiles.length ||
      !author.sourceFiles.includes('scripts/data/mw3-authored/registry.mjs')) throw new Error('Incomplete Mw3 recipe source inventory');
  const recipe = {};
  for (const path of author.sourceFiles) {
    if (typeof path !== 'string' || !/^scripts\/data\/mw3-authored\/(?:[A-Za-z0-9_-]+\.mjs|profiles\/[A-Za-z0-9_-]+\.json)$/.test(path)) throw new Error('Disallowed Mw3 recipe source path');
    assertSafeFile(mw3Root, path);
    recipe[path] = readFileSync(join(mw3Root, path), 'utf8');
  }
  const recipeSha256 = mw3Sha(recipe);
  return { author, inputs, recipeSha256, implementationHash: mw3ImplementationHash(),
    authorTask: `mw3-${inputs.spot.slug}-authored-v${author.version}` };
}

export function loadMw3AuthoredContext(options) {
  const identity = resolveMw3AuthorIdentity(options), contract = mw3Contract(identity.inputs);
  return { ...identity, contract, policies: identity.author.build(identity.inputs, contract) };
}
