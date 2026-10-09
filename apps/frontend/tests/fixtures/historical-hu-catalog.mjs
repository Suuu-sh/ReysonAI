import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Exact historical PR94 bytes, ac02a11c6d8f61ed46e8c89e289a75274a104088.
// Test-only geometry: the product continues to provide the selected 40 histories.
const raw = readFileSync(new URL('./hu-after-multiway-historical-407.json', import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'), '096b926d3d7f84c88475e99f3ebdfa80f046539ee7b41983ac9b8c1eec229851');
export const historicalHuCatalog = JSON.parse(raw);
assert.equal(historicalHuCatalog.spots.length, 407);
export const historicalHuContext = spot => ({ ...spot, pilotAvailable: false });
