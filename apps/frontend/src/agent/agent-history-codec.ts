// The account endpoint limits a complete snapshot to 500 KB. Repeated object
// property names make the 3,000-row Agent history exceed that bound, so only
// this record type uses a compact wire representation; local guest JSON stays
// backward-compatible and human-readable.
const FORMAT = "reysonai-agent-hands:compact-v1";
const FLAGS = ["vpip", "pfr", "threeBetOpp", "threeBet", "facedThreeBet", "foldedToThreeBet", "sawFlop", "showdown", "wonShowdown"] as const;
const OPTIONAL = ["pfBets", "pfCalls", "pfFacing", "pfFolds"] as const;
const KNOWN_KEYS = new Set<string>(["at", "tableId", "pos", "returnBb", ...FLAGS, ...OPTIONAL]);

type CompactRecord = [number, string, string, number, number, number | null, number | null, number | null, number | null];
type CompactHistory = { format: typeof FORMAT; records: unknown[] };

function compactRecord(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !KNOWN_KEYS.has(key)) ||
      !Number.isFinite(record.at) || typeof record.tableId !== "string" || typeof record.pos !== "string" || !Number.isFinite(record.returnBb) ||
      FLAGS.some(key => typeof record[key] !== "boolean") || OPTIONAL.some(key => record[key] !== undefined && !Number.isFinite(record[key]))) return record;
  const flags = FLAGS.reduce((bits, key, index) => bits | (record[key] ? 1 << index : 0), 0);
  return [record.at as number, record.tableId, record.pos, record.returnBb as number, flags,
    ...OPTIONAL.map(key => Number.isFinite(record[key]) ? record[key] as number : null)] as CompactRecord;
}

export function encodeAgentHistoryForAccount(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return { format: FORMAT, records: value.map(compactRecord) } satisfies CompactHistory;
}

function isCompactHistory(value: unknown): value is CompactHistory {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    (value as CompactHistory).format === FORMAT && Array.isArray((value as CompactHistory).records));
}

export function decodeAgentHistory(value: unknown): unknown {
  if (!isCompactHistory(value)) return value;
  return value.records.map(record => {
    if (!Array.isArray(record) || record.length !== 9) return record;
    const [at, tableId, pos, returnBb, bits, ...optional] = record;
    const expanded: Record<string, unknown> = { at, tableId, pos, returnBb };
    FLAGS.forEach((key, index) => { expanded[key] = Boolean(Number(bits) & (1 << index)); });
    OPTIONAL.forEach((key, index) => { if (optional[index] !== null) expanded[key] = optional[index]; });
    return expanded;
  });
}
