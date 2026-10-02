// Browser-safe scalar WebAssembly for the hot blocker-subtraction loop. No SIMD, fma,
// reassociation, approximations, imports, I/O or random numbers. Every f64 operation has
// exactly the same order as the JS reference. The small assembler is the source of truth:
// there is no opaque binary artifact, compiler or additional runtime dependency.
const NUM_IDS = 52 * 52, MAX_BLOCKERS = 2 * 1326;
const layout = {};
let bytes = 0;
for (const [name, Type, length] of [
  ["ids", Int32Array, NUM_IDS], ["numerator", Float64Array, NUM_IDS], ["denominator", Float64Array, NUM_IDS],
  ["score", Int32Array, NUM_IDS], ["first", Int16Array, NUM_IDS], ["last", Int16Array, NUM_IDS],
  ["prefix", Float64Array, 1082], ["offsets", Int16Array, 53], ["blockers", Int16Array, MAX_BLOCKERS],
  ["scores", Int32Array, MAX_BLOCKERS], ["weights", Float64Array, MAX_BLOCKERS],
  ["totals", Float64Array, 52],
  ["memoSeen", Int32Array, 1082], ["memoWins", Float64Array, 1082], ["memoTies", Float64Array, 1082],
  ["sorted", Int32Array, NUM_IDS], ["bettors", Int32Array, NUM_IDS], ["dense", Float64Array, NUM_IDS],
  ["at", Int16Array, 52],
]) {
  bytes = Math.ceil(bytes / Type.BYTES_PER_ELEMENT) * Type.BYTES_PER_ELEMENT;
  layout[name] = { Type, length, offset: bytes };
  bytes += Type.BYTES_PER_ELEMENT * length;
}
const uleb = value => {
  const out = [];
  do { const byte = value & 127; value >>>= 7; out.push(byte | (value ? 128 : 0)); } while (value);
  return out;
};
const sleb = value => {
  const out = [];
  for (;;) {
    const byte = value & 127; value >>= 7;
    const end = value === 0 && !(byte & 64) || value === -1 && Boolean(byte & 64);
    out.push(byte | (end ? 0 : 128));
    if (end) return out;
  }
};
const section = (id, body) => [id, ...uleb(body.length), ...body];
const name = text => [text.length, ...Array.from(text, c => c.charCodeAt(0))];
const get = index => [0x20, index], set = index => [0x21, index], int = value => [0x41, ...sleb(value)];
const double = value => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, value, true); return [0x44, ...b]; };
const address = (field, index) => [...int(layout[field].offset), ...index, ...int(layout[field].Type.BYTES_PER_ELEMENT), 0x6c, 0x6a];
const load = (field, index) => {
  const type = layout[field].Type;
  return [...address(field, index), type === Float64Array ? 0x2b : type === Int16Array ? 0x2f : 0x28,
    Math.log2(type.BYTES_PER_ELEMENT), 0];
};
const storeDouble = (field, index, value) => [...address(field, index), ...value, 0x39, 3, 0];
const storeInt = (field, index, value) => [...address(field, index), ...value, 0x36, 2, 0];
const storeShort = (field, index, value) => [...address(field, index), ...value, 0x3b, 1, 0];
// Parameter n=0; i32 locals j=1, id=2, own=3, c1=4, c2=5, k=6, end=7, other=8;
// f64 locals total=9, win=10, tie=11, weight=12;
// i32 locals lastCard=13, generation=14, rankGroup=15.
// The first-card result is identical for tied scores. A tiny generation-tagged memo
// reuses it within one first-card group; no addition or subtraction is reordered.
const subtract = (target, value) => [...get(target), ...value, 0xa1, ...set(target)];
const advance = index => [...get(index), ...int(1), 0x6a, ...set(index)];
const removeCard = (card, second) => [
  ...load("offsets", get(card)), ...set(6),
  ...load("offsets", [...get(card), ...int(1), 0x6a]), ...set(7),
  0x02, 0x40, 0x03, 0x40, // block { loop {
  ...get(6), ...get(7), 0x4f, 0x0d, 1, // if k >= end, break
  ...(second ? [...load("blockers", get(6)), ...get(2), 0x47, 0x04, 0x40] : []),
  ...load("scores", get(6)), ...set(8), ...load("weights", get(6)), ...set(12),
  ...(second ? subtract(9, get(12)) : []),
  ...subtract(10, [...get(12), ...double(0), ...get(8), ...get(3), 0x48, 0x1b]),
  ...subtract(11, [...get(12), ...double(0), ...get(8), ...get(3), 0x46, 0x1b]),
  ...(second ? [0x0b] : []),
  ...advance(6), 0x0c, 0, 0x0b, 0x0b,
];
const instructions = [
  ...int(-1), ...set(13),
  0x02, 0x40, 0x03, 0x40,
  ...get(1), ...get(0), 0x4f, 0x0d, 1,
  ...load("ids", get(1)), ...set(2), ...load("score", get(2)), ...set(3),
  ...get(3), ...int(0), 0x4e, 0x04, 0x40, // own >= 0
  ...get(2), ...int(52), 0x6e, ...set(4), ...get(2), ...int(52), 0x70, ...set(5),
  ...load("totals", get(4)), ...set(9),
  ...load("prefix", load("first", get(2))), ...set(10),
  ...load("prefix", load("last", get(2))), ...get(10), 0xa1, ...set(11),
  ...get(13), ...get(4), 0x47, 0x04, 0x40,
  ...get(4), ...set(13), ...advance(14), 0x0b,
  ...load("first", get(2)), ...set(15),
  ...load("memoSeen", get(15)), ...get(14), 0x46, 0x04, 0x40,
  ...load("memoWins", get(15)), ...set(10), ...load("memoTies", get(15)), ...set(11),
  0x05,
  ...removeCard(4, false),
  ...storeInt("memoSeen", get(15), get(14)),
  ...storeDouble("memoWins", get(15), get(10)), ...storeDouble("memoTies", get(15), get(11)),
  0x0b,
  ...removeCard(5, true),
  ...storeDouble("numerator", get(1), [...load("numerator", get(1)), ...get(10), ...double(0.5), ...get(11), 0xa2, 0xa0, 0xa0]),
  ...storeDouble("denominator", get(1), [...load("denominator", get(1)), ...get(9), 0xa0]),
  0x0b, ...advance(1), 0x0c, 0, 0x0b, 0x0b, 0x0b,
];
const body = [3, 8, 0x7f, 4, 0x7c, 3, 0x7f, ...instructions];
// Original first-three-query scan: parameters n=0, own=1; i32 locals j=2, other=3;
// f64 total=4, win=5, tie=6, weight=7. Addition order is the original saved-ID order.
const add = (target, value) => [...get(target), ...value, 0xa0, ...set(target)];
const scanBody = [2, 2, 0x7f, 4, 0x7c,
  0x02, 0x40, 0x03, 0x40,
  ...get(2), ...get(0), 0x4f, 0x0d, 1,
  ...load("score", load("ids", get(2))), ...set(3),
  ...get(3), ...int(0), 0x4e, 0x04, 0x40,
  ...load("weights", get(2)), ...set(7),
  ...add(4, get(7)),
  ...add(5, [...get(7), ...double(0), ...get(3), ...get(1), 0x48, 0x1b]),
  ...add(6, [...get(7), ...double(0), ...get(3), ...get(1), 0x46, 0x1b]),
  0x0b, ...advance(2), 0x0c, 0, 0x0b, 0x0b,
  ...storeDouble("numerator", int(0), [...load("numerator", int(0)), ...get(5), ...double(0.5), ...get(6), 0xa2, 0xa0, 0xa0]),
  ...storeDouble("denominator", int(0), [...load("denominator", int(0)), ...get(4), 0xa0]),
  0x0b,
];
// Prefix/card-list preparation. Parameters ranks=0, bettors=1; i32 locals
// j=2, id=3, c1=4, c2=5, k=6, end/count=7, start=8; f64 all=9, weight=10, total=11.
// Sorted-prefix additions and each card's blocker subtractions use reference order.
const loop = (index, limit, code) => [
  ...int(0), ...set(index), 0x02, 0x40, 0x03, 0x40,
  ...get(index), ...limit, 0x4f, 0x0d, 1,
  ...code, ...advance(index), 0x0c, 0, 0x0b, 0x0b,
];
const cardsOfId = [
  ...get(3), ...int(52), 0x6e, ...set(4), ...get(3), ...int(52), 0x70, ...set(5),
];
const addOffset = card => storeShort("offsets", get(card), [...load("offsets", get(card)), ...int(1), 0x6a]);
const putBlocker = card => [
  ...load("at", get(card)), ...set(6),
  ...storeShort("blockers", get(6), get(3)),
  ...storeInt("scores", get(6), load("score", get(3))),
  ...storeDouble("weights", get(6), get(10)),
  ...storeShort("at", get(card), [...get(6), ...int(1), 0x6a]),
];
const prepareBody = [2, 7, 0x7f, 3, 0x7c,
  ...storeDouble("prefix", int(0), double(0)),
  ...loop(2, get(0), [
    ...load("sorted", get(2)), ...set(3), ...add(9, load("dense", get(3))),
    ...storeDouble("prefix", [...get(2), ...int(1), 0x6a], get(9)),
  ]),
  ...loop(2, int(52), storeShort("offsets", get(2), int(0))),
  ...loop(2, get(1), [
    ...load("bettors", get(2)), ...set(3),
    ...load("score", get(3)), ...int(0), 0x4e, 0x04, 0x40,
    ...cardsOfId, ...addOffset(4), ...addOffset(5), 0x0b,
  ]),
  ...loop(2, int(52), [
    ...load("offsets", get(2)), ...set(7),
    ...storeShort("offsets", get(2), get(8)), ...storeShort("at", get(2), get(8)),
    ...get(8), ...get(7), 0x6a, ...set(8),
  ]),
  ...storeShort("offsets", int(52), get(8)),
  ...loop(2, get(1), [
    ...load("bettors", get(2)), ...set(3),
    ...load("score", get(3)), ...int(0), 0x4e, 0x04, 0x40,
    ...cardsOfId, ...load("dense", get(3)), ...set(10),
    ...putBlocker(4), ...putBlocker(5), 0x0b,
  ]),
  ...loop(2, int(52), [
    ...get(9), ...set(11), ...load("offsets", get(2)), ...set(6),
    ...load("offsets", [...get(2), ...int(1), 0x6a]), ...set(7),
    0x02, 0x40, 0x03, 0x40,
    ...get(6), ...get(7), 0x4f, 0x0d, 1,
    ...subtract(11, load("weights", get(6))), ...advance(6), 0x0c, 0, 0x0b, 0x0b,
    ...storeDouble("totals", get(2), get(11)),
  ]),
  0x0b,
];
const pages = Math.ceil(bytes / 65536);
const moduleBytes = Uint8Array.from([
  0, 97, 115, 109, 1, 0, 0, 0,
  ...section(1, [2, 0x60, 1, 0x7f, 0, 0x60, 2, 0x7f, 0x7f, 0]), ...section(3, [3, 0, 1, 1]),
  ...section(5, [1, 1, ...uleb(pages), ...uleb(pages)]),
  ...section(7, [4, ...name("memory"), 2, 0, ...name("accumulate"), 0, 0, ...name("scan"), 0, 1, ...name("prepare"), 0, 2]),
  ...section(10, [3, ...uleb(body.length), ...body, ...uleb(scanBody.length), ...scanBody, ...uleb(prepareBody.length), ...prepareBody]),
]);
let kernel;
export function equityKernel() {
  if (kernel !== undefined) return kernel;
  try {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(moduleBytes));
    kernel = { accumulate: instance.exports.accumulate, scan: instance.exports.scan, prepare: instance.exports.prepare };
    for (const [key, { Type, length, offset }] of Object.entries(layout)) {
      kernel[key] = new Type(instance.exports.memory.buffer, offset, length);
    }
  } catch {
    // CSP / an environment without WebAssembly still has the identical JS implementation.
    kernel = null;
  }
  return kernel;
}
