// Browser-safe cache storage, not a different calculation. Float64Array preserves the
// exact JS numbers; slots preserve missing, null and undefined independently of zero.
const NUM_IDS = 52 * 52;
class PackedEquities {
  constructor(map) {
    this.slots = new Int16Array(NUM_IDS);
    this.values = new Float64Array(map.size);
    this.states = new Uint8Array(map.size);
    this.extra = null;
    this.count = map.size;
    let i = 0;
    for (const [id, value] of map) {
      this.slots[id] = ++i;
      this.write(i - 1, value);
    }
  }
  write(i, value) {
    this.states[i] = value === null ? 1 : value === undefined ? 2 : 0;
    this.values[i] = value ?? NaN;
  }
  slot(id) { return Number.isInteger(id) ? this.slots[id] ?? 0 : 0; }
  get(id) {
    const slot = this.slot(id);
    if (!slot) return this.extra?.get(id);
    const i = slot - 1, value = this.values[i];
    // Numeric equities need only the slot and value loads. NaN is an internal
    // sentinel; its separate state also preserves a genuine cached NaN exactly.
    if (value === value) return value;
    const state = this.states[i];
    return state === 1 ? null : state === 2 ? undefined : value;
  }
  has(id) { return Boolean(this.slot(id)) || (this.extra?.has(id) ?? false); }
  set(id, value) {
    const slot = this.slot(id);
    if (slot) this.write(slot - 1, value);
    else {
      this.extra ??= new Map();
      if (!this.extra.has(id)) this.count++;
      this.extra.set(id, value);
    }
    return this;
  }
  get size() { return this.count; }
}
export function packEquities(map) {
  if (!(map instanceof Map) || map.size < 128) return map;
  for (const id of map.keys()) if (!Number.isInteger(id) || id < 0 || id >= NUM_IDS) return map;
  return new PackedEquities(map);
}

// Large reach-stage caches otherwise retain 21 KiB for even a very narrow range.
// Store exact non-zero slots (including negative zero) in saved combo-ID order.
export function packWeights(weights) {
  let count = 0;
  for (const value of weights) if (value !== 0 || Object.is(value, -0)) count++;
  const ids = new Int16Array(count), values = new Float64Array(count);
  let at = 0;
  for (let id = 0; id < weights.length; id++) {
    const value = weights[id];
    if (value !== 0 || Object.is(value, -0)) { ids[at] = id; values[at++] = value; }
  }
  return { ids, values };
}
export function unpackWeights(saved) {
  if (saved instanceof Float64Array) return saved;
  const weights = new Float64Array(NUM_IDS);
  for (let i = 0; i < saved.ids.length; i++) weights[saved.ids[i]] = saved.values[i];
  return weights;
}
