// Browser-safe content identities. No secret, Node, environment or network inputs.
import { sha256 } from './browser-inputs.mjs';

export function assertJsonCompatible(value, name = 'source') {
  const ancestors = new Set();
  const visit = (item, path) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError(`Non-finite JSON source value at ${path}`);
      return;
    }
    if (typeof item !== 'object') throw new TypeError(`Non-JSON source value at ${path}`);
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new TypeError(`Non-plain JSON source object at ${path}`);
    if (Object.getOwnPropertySymbols(item).length || ancestors.has(item)) throw new TypeError(`Invalid JSON source object at ${path}`);
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (array && Object.keys(descriptors).filter(key => key !== 'length').length !== item.length) throw new TypeError(`Sparse or extended JSON source array at ${path}`);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !('value' in descriptor) || array && !/^(0|[1-9][0-9]*)$/.test(key)) throw new TypeError(`Invalid JSON source property at ${path}.${key}`);
      visit(descriptor.value, `${path}.${key}`);
    }
    ancestors.delete(item);
  };
  visit(value, name);
  return value;
}
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}
export function freezeSnapshot(value) {
  // Validation precedes JSON roundtrip: NaN/Infinity/undefined cannot be erased or coerced.
  assertJsonCompatible(value);
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = item => {
    if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); }
    return item;
  };
  return freeze(copy);
}
export const contentHash = value => { assertJsonCompatible(value); return sha256(canonicalJson(value)); };
// Existing saved metadata hashes JSON.stringify insertion order, not sorted canonical JSON.
export const savedPayloadHash = value => { assertJsonCompatible(value); return sha256(JSON.stringify(value)); };
