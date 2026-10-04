// Lossless, browser-safe columnar JSON. Constants (field names, node/role, prices, range
// summaries) occur once, not in every combo. Variable columns retain full JS numbers.
// Schema tags: 0 literal, 1 column, 2 object, 3 array. No quantisation or strategy synthesis.
export function packFrame(records) {
  if (!records.length) return { count: 0, schema: [0, null], columns: [] };
  const columns = [], columnIds = new Map();
  const addColumn = values => {
    const key = JSON.stringify(values);
    if (columnIds.has(key)) return columnIds.get(key);
    const index = columns.length;
    columns.push(values); columnIds.set(key, index);
    return index;
  };
  const build = values => {
    const first = values[0], encoded = JSON.stringify(first);
    if (values.every(value => JSON.stringify(value) === encoded)) return [0, first];
    // Unreachable classes are null. Do not let a few nulls turn every reachable
    // class's otherwise-columnar facts into repeated full JSON objects.
    const present = values.filter(value => value != null);
    if (present.length !== values.length && present.every(value => typeof value === "object")) {
      const index = addColumn(values.map(value => value != null));
      return [4, index, build(values.map(value => value ?? present[0]))];
    }
    if (values.every(value => value && typeof value === "object" && !Array.isArray(value)) &&
        values.every(value => Object.keys(value).join("\0") === Object.keys(first).join("\0"))) {
      return [2, Object.keys(first).map(key => [key, build(values.map(value => value[key]))])];
    }
    if (values.every(value => Array.isArray(value) && value.length === first.length)) {
      return [3, first.map((_, index) => build(values.map(value => value[index])))];
    }
    const index = addColumn(values);
    return [1, index];
  };
  return { count: records.length, schema: build(records), columns };
}

export function unpackFrameRow(frame, index) {
  if (!Number.isInteger(index) || index < 0 || index >= frame.count) throw new Error("Invalid frame row");
  const read = schema => {
    switch (schema[0]) {
      case 0: return schema[1];
      case 1: return frame.columns[schema[1]][index];
      case 2: return Object.fromEntries(schema[1].map(([key, child]) => [key, read(child)]));
      case 3: return schema[1].map(read);
      case 4: return frame.columns[schema[1]][index] ? read(schema[2]) : null;
      default: throw new Error("Invalid flop-base schema");
    }
  };
  return read(frame.schema);
}
export const unpackFrame = frame => Array.from({ length: frame.count }, (_, index) => unpackFrameRow(frame, index));

export function packView(view) {
  const lengths = [], combos = [];
  const rows = view.rows.map(({ combos: detail, ...row }) => {
    lengths.push(detail.length); combos.push(...detail); return row;
  });
  return { node: view.node, seat: view.seat, actions: view.actions, ...(view.unavailable ? { unavailable: true } : {}), lengths,
    rows: packFrame(rows), combos: packFrame(combos) };
}
export function unpackView(view) {
  const rows = unpackFrame(view.rows), combos = unpackFrame(view.combos);
  let at = 0;
  rows.forEach((row, index) => { row.combos = combos.slice(at, at += view.lengths[index]); });
  return { node: view.node, seat: view.seat, actions: view.actions, ...(view.unavailable ? { unavailable: true } : {}), rows };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes) {
  let text = "";
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at], b = bytes[at + 1], c = bytes[at + 2];
    text += ALPHABET[a >> 2] + ALPHABET[(a & 3) << 4 | (b ?? 0) >> 4] +
      (b === undefined ? "=" : ALPHABET[(b & 15) << 2 | (c ?? 0) >> 6]) + (c === undefined ? "=" : ALPHABET[c & 63]);
  }
  return text;
}
function unbase64(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
// UI facts at four decimals and integer strategies can be delta-varint encoded
// exactly. Non-integral f64 strategy/reach columns stay verbatim; never round them.
function encodeColumn(values, scale = 10000) {
  if (values.every(value => Number.isFinite(value) && Math.round(value * scale) / scale === value && Math.abs(value * scale) < 2 ** 29)) {
    const bytes = [];
    let previous = 0;
    for (const value of values) {
      const integer = Math.round(value * scale), delta = integer - previous;
      let code = (delta << 1 ^ delta >> 31) >>> 0;
      do { const byte = code & 127; code >>>= 7; bytes.push(byte | (code ? 128 : 0)); } while (code);
      previous = integer;
    }
    return [1, values.length, base64(bytes), scale];
  }
  return [0, values];
}
const round4 = value => Math.round(value * 10000) / 10000;
function cdfPredictions(values, weights) {
  const sorted = values.map((value, index) => ({ value, index })).filter(item => weights[item.index] > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((sum, item) => sum + weights[item.index], 0), prefixes = new Map();
  let sum = 0;
  for (const item of sorted) {
    if (!prefixes.has(item.value)) prefixes.set(item.value, sum);
    sum += weights[item.index];
  }
  const keys = [...prefixes.keys()];
  return values.map(value => {
    let lo = 0, hi = keys.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] < value) lo = mid + 1; else hi = mid; }
    const before = lo < keys.length ? prefixes.get(keys[lo]) : total;
    return total ? round4(before / total) : 0;
  });
}
function averagePredictions(values, weights, lengths, rounded = true) {
  const result = [];
  let at = 0, first = null;
  for (const length of lengths) {
    let sum = 0, total = 0;
    for (let index = 0; index < length; index++, at++) if (Number.isFinite(values[at]) && weights[at] > 0) {
      sum += values[at] * weights[at]; total += weights[at];
    }
    const value = total ? rounded ? round4(sum / total) : sum / total : null;
    if (first === null && value !== null) first = value;
    result.push(value);
  }
  return result.map(value => value ?? (rounded ? first : 0) ?? 0);
}
function predictions(column, get) {
  if (column[0] === 2) return get(column[1]).map((value, index) => round4(value * get(column[2])[index]));
  if (column[0] === 3) return cdfPredictions(get(column[1]), get(column[2]));
  if (column[0] === 4) return get(column[1]).map((cards, index) => {
    const a = "23456789TJQKA".indexOf(cards[0]) * 4 + "cdhs".indexOf(cards[1]);
    const b = "23456789TJQKA".indexOf(cards[2]) * 4 + "cdhs".indexOf(cards[3]);
    return round4(column[2][a] + column[2][b] - get(column[3])[index]);
  });
  if (column[0] === 5) return averagePredictions(get(column[1]), get(column[2]), column[3]);
  if (column[0] === 6) return get(column[1]);
  if (column[0] === 7) return averagePredictions(get(column[1]), get(column[2]), column[3], false);
  if (column[0] === 9) {
    const values = get(column[1]); let at = 0;
    return column[2].map(length => { let sum = 0; for (let index = 0; index < length; index++) sum += values[at++]; return sum; });
  }
  if (column[0] === 10) {
    const tiers = get(column[1]), weights = get(column[2]); let at = 0;
    return column[3].map(length => {
      const total = weights.slice(at, at + length).reduce((sum, weight) => sum + weight, 0);
      let sum = 0;
      for (let index = 0; index < length; index++, at++) if (total && tiers[at] === column[4]) sum += weights[at] / total;
      return sum;
    });
  }
  throw new Error("Invalid predictive column");
}
function decodeColumn(column, get) {
  if (column[0] === 0) return column[1];
  if (column[0] >= 2) {
    const predicted = predictions(column, get);
    if (column.at(-1)[0] === 8) {
      const bytes = unbase64(column.at(-1)[2]), buffer = new ArrayBuffer(8), view = new DataView(buffer);
      let at = 0;
      return predicted.map(value => {
        let code = 0n, shift = 0n, byte;
        do { byte = bytes[at++]; if (byte === undefined || shift > 63n) throw new Error("Invalid f64 XOR residual"); code |= BigInt(byte & 127) << shift; shift += 7n; } while (byte & 128);
        view.setFloat64(0, value, true); view.setBigUint64(0, view.getBigUint64(0, true) ^ code, true);
        return view.getFloat64(0, true);
      });
    }
    const residuals = decodeColumn(column.at(-1), get);
    return predicted.map((value, index) => (Math.round(value * 10000) + residuals[index]) / 10000);
  }
  if (column[0] !== 1) throw new Error("Invalid flop-base column encoding");
  const bytes = unbase64(column[2]), values = [];
  let at = 0, previous = 0;
  while (at < bytes.length) {
    let code = 0, shift = 0, byte;
    do {
      byte = bytes[at++];
      if (byte === undefined || shift > 28) throw new Error("Invalid flop-base varint");
      code |= (byte & 127) << shift; shift += 7;
    } while (byte & 128);
    previous += (code >>> 1) ^ -(code & 1);
    values.push(previous / (column[3] ?? 10000));
  }
  if (values.length !== column[1]) throw new Error("Incomplete flop-base column");
  return values;
}

export function compactFlopBase(base, blockerPredictors = {}) {
  const pool = [], raw = [], indexes = new Map();
  const add = values => {
    const key = JSON.stringify(values);
    if (indexes.has(key)) return indexes.get(key);
    const index = pool.length;
    pool.push(encodeColumn(values)); raw.push(values); indexes.set(key, index);
    return index;
  };
  const compact = frame => ({ ...frame, columns: frame.columns.map(add) });
  const histories = Object.fromEntries(Object.entries(base.histories).map(([key, entry]) => [key, {
    view: { ...entry.view, rows: compact(entry.view.rows), combos: compact(entry.view.combos) },
    combo_facts: compact(entry.combo_facts), class_facts: compact(entry.class_facts),
  }]));
  const lookup = (frame, path) => {
    let schema = frame.schema;
    for (const name of path.split(".")) {
      while (schema?.[0] === 4) schema = schema[2];
      if (schema?.[0] === 0) {
        let value = schema[1];
        for (const remaining of path.split(".").slice(path.split(".").indexOf(name))) value = value?.[remaining];
        return value === undefined ? null : add(Array(frame.count).fill(value));
      }
      if (schema?.[0] !== 2) return null;
      schema = schema[1].find(([key]) => key === name)?.[1];
    }
    if (schema?.[0] === 1) return frame.columns[schema[1]];
    if (schema?.[0] === 0) return add(Array(frame.count).fill(schema[1]));
    return null;
  };
  const references = column => [2, 3, 5, 7, 10].includes(column[0]) ? [column[1], column[2]] : column[0] === 4 ? [column[1], column[3]] : [6, 9].includes(column[0]) ? [column[1]] : [];
  const depends = (index, target, visited = new Set()) => {
    if (index === target) return true;
    if (visited.has(index)) return false;
    visited.add(index);
    return references(pool[index]).some(parent => depends(parent, target, visited));
  };
  const predict = (target, column) => {
    if (target === null || pool[target][0] > 1 || references(column).some(parent => parent === null || depends(parent, target))) return;
    if (!raw[target].every(value => Number.isFinite(value) && Math.round(value * 10000) / 10000 === value)) return;
    const predicted = predictions(column, index => raw[index]);
    if (predicted.length !== raw[target].length) return;
    const residuals = raw[target].map((value, index) => Math.round(value * 10000) - Math.round(predicted[index] * 10000));
    pool[target] = [...column, encodeColumn(residuals, 1)];
  };
  const predictFloat = (target, column) => {
    if (target === null || pool[target][0] > 1 || references(column).some(parent => parent === null || depends(parent, target)) || !raw[target].every(Number.isFinite)) return;
    const predicted = predictions(column, index => raw[index]);
    if (predicted.length !== raw[target].length) return;
    const view = new DataView(new ArrayBuffer(8)), bytes = [];
    raw[target].forEach((value, index) => {
      view.setFloat64(0, value, true); const actual = view.getBigUint64(0, true);
      view.setFloat64(0, predicted[index], true); let code = actual ^ view.getBigUint64(0, true);
      do { const byte = Number(code & 127n); code >>= 7n; bytes.push(byte | (code ? 128 : 0)); } while (code);
    });
    pool[target] = [...column, [8, raw[target].length, base64(bytes)]];
  };
  for (const [key, entry] of Object.entries(histories)) {
    const facts = entry.combo_facts, view = entry.view;
    const equity = lookup(facts, "equity"), realization = lookup(facts, "defence.realization");
    const realized = lookup(facts, "defence.realized_equity"), percentile = lookup(facts, "defence.percentile");
    if (equity !== null && realization !== null) predict(realized, [2, equity, realization]);
    const reach = lookup(view.combos, "reachWeight"), cards = lookup(facts, "cards");
    if (realized !== null && reach !== null) predict(percentile, [3, realized, reach]);
    for (const [name, info] of Object.entries(blockerPredictors[key] ?? {})) {
      predict(lookup(facts, `defence.blockers.${name}`), [4, cards, info.perCard, add(info.intersection)]);
    }
    const weight = lookup(view.combos, "weight");
    const visit = (schema, path = "") => {
      if (schema[0] === 4) return visit(schema[2], path);
      if (schema[0] === 2) return schema[1].forEach(([name, child]) => visit(child, path ? `${path}.${name}` : name));
      if (schema[0] !== 1) return;
      const source = lookup(facts, path), target = entry.class_facts.columns[schema[1]];
      if (source !== null && weight !== null) predict(target, [5, source, weight, view.lengths]);
    };
    visit(entry.class_facts.schema);
    for (const action of view.actions) predictFloat(lookup(view.rows, `mix.${action}`), [7, lookup(view.combos, `mix.${action}`), weight, view.lengths]);
    predictFloat(lookup(view.rows, "reachWeight"), [9, reach, view.lengths]);
    const tier = lookup(view.combos, "tier");
    for (const name of ["monster", "strong", "draw", "medium", "air"]) predictFloat(lookup(view.rows, `tiers.${name}`), [10, tier, weight, view.lengths, name]);
  }
  // Further decorrelate same-length fixed-precision columns (e.g. equities facing
  // neighbouring bet sizes). This is residual coding, never a model approximation.
  for (let target = 0; target < pool.length; target++) {
    if (pool[target][0] !== 1 || raw[target].length < 250) continue;
    let best = null, size = pool[target][2].length;
    for (let source = 0; source < target; source++) {
      if (raw[source].length !== raw[target].length || !raw[source].every(value => Number.isFinite(value) && Math.round(value * 10000) / 10000 === value) || depends(source, target)) continue;
      const residual = raw[target].map((value, index) => Math.round(value * 10000) - Math.round(raw[source][index] * 10000));
      const encoded = encodeColumn(residual, 1);
      if (encoded[0] === 1 && encoded[2].length < size * .9) { best = [6, source, encoded]; size = encoded[2].length; }
    }
    if (best) pool[target] = best;
  }
  return { ...base, histories, columns: pool };
}
const hydratedColumns = new WeakMap();
export function hydrateFrame(base, frame) {
  if (!base.columns) return frame;
  let cache = hydratedColumns.get(base);
  if (!cache) hydratedColumns.set(base, cache = new Map());
  const get = index => {
    if (!cache.has(index)) cache.set(index, decodeColumn(base.columns[index], get));
    return cache.get(index);
  };
  return { ...frame, columns: frame.columns.map(get) };
}
