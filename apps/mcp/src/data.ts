// Read-only projections of the same published AI estimates and account-sync data
// used by the app. No solver, synthetic strategy, account write, or ranking access.
export interface ReadOnlyDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> };
  };
}

export type McpDataErrorCode = "invalid_argument" | "not_found" | "unsupported_dataset" | "data_unavailable" | "invalid_saved_data";
export class McpDataError extends Error {
  readonly code: McpDataErrorCode;
  constructor(code: McpDataErrorCode, message: string) { super(message); this.name = "McpDataError"; this.code = code; }
}

export const SUPPORTED_RANGE_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "limp-responses", "limp-deep-responses"] as const;
export type RangeDatasetName = typeof SUPPORTED_RANGE_DATASETS[number];
const CATALOG_DATASETS = [...SUPPORTED_RANGE_DATASETS, "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses", "continuation-responses"];
const KIND = "ai_estimate_not_gto" as const;
const NOTICE = "Saved independent AI estimates for study; not solver GTO, a live decision service, or a guarantee of profit. Missing paths are unavailable.";
const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const ACTIONS = ["open", "limp", "fold", "call", "three_bet", "four_bet", "all_in", "check", "raise"];
const SIZE_KEYS = ["open_size_bb", "three_bet_size_bb", "four_bet_size_bb", "all_in_size_bb", "limp_size_bb", "raise_size_bb", "iso_size_bb", "raise_to_bb", "limp_reraise_size_bb"];
const RANKS = "AKQJT98765432";
const HANDS = RANKS.split("").flatMap((a, i) => RANKS.split("").map((b, j) => i === j ? a + b : i < j ? a + b + "s" : b + a + "o"));
const HAND_SET = new Set(HANDS);
const MAX_DATASET_BYTES = 4_000_000;
const MAX_PARTS = 160;
const MAX_ACCOUNT_BYTES = 500_000;
type RecordValue = Record<string, unknown>;
type MetaRow = { name: string; content_hash: string; bytes: number; parts: number };
type RawSpot = RecordValue & { id: string; hero: string; hands: RecordValue[] };
type SavedDataset = { metadata: RecordValue; spots: RawSpot[]; hash: string };

function invalid(): never { throw new McpDataError("invalid_saved_data", "Saved data is incomplete or invalid; no estimate was substituted."); }
function object(value: unknown): value is RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function integer(value: unknown, min: number, max: number): value is number { return finite(value, min, max) && Number.isInteger(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_]{1,100}$/.test(value); }
function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!integer(value, min, max)) throw new McpDataError("invalid_argument", "Invalid pagination limit or offset.");
  return value;
}
function datasetName(value: unknown): RangeDatasetName {
  if (typeof value !== "string" || !SUPPORTED_RANGE_DATASETS.includes(value as RangeDatasetName)) {
    throw new McpDataError("unsupported_dataset", "This dataset has no supported saved-range lookup. Use the published coverage catalog.");
  }
  return value as RangeDatasetName;
}
async function query<T>(db: ReadOnlyDatabase | undefined, sql: string, ...args: unknown[]): Promise<T[]> {
  if (!db) throw new McpDataError("data_unavailable", "Saved data storage is unavailable.");
  try {
    const value = await db.prepare(sql).bind(...args).all<T>();
    if (!Array.isArray(value?.results)) invalid();
    return value.results;
  } catch (error) {
    if (error instanceof McpDataError) throw error;
    throw new McpDataError("data_unavailable", "Saved data could not be read.");
  }
}
function parseJson(value: unknown, maxBytes: number): unknown {
  if (typeof value !== "string" || value.length > maxBytes || new TextEncoder().encode(value).length > maxBytes) invalid();
  try { return JSON.parse(value); } catch { return invalid(); }
}
function validMeta(row: MetaRow, max = MAX_DATASET_BYTES) {
  if (!object(row) || typeof row.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(row.content_hash) || !integer(row.bytes, 1, max) || !integer(row.parts, 1, MAX_PARTS)) invalid();
}
async function readPublishedJson(db: ReadOnlyDatabase | undefined, name: string, optional = false): Promise<{ data: unknown; hash: string } | null> {
  const meta = await query<MetaRow>(db, "SELECT name, content_hash, bytes, parts FROM preflop_datasets WHERE name = ? LIMIT 2", name);
  if (!meta.length) {
    if (optional) return null;
    throw new McpDataError("not_found", "This saved dataset is not published.");
  }
  if (meta.length !== 1) invalid();
  const row = meta[0]; validMeta(row);
  if (row.name !== name) invalid();
  const parts = await query<{ part: number; body: string }>(db, "SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part LIMIT 161", name);
  if (parts.length !== row.parts || parts.some((part, index) => part.part !== index || typeof part.body !== "string" || part.body.length > 30_000)) invalid();
  const text = parts.map(part => part.body).join("");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length !== row.bytes || bytes.length > MAX_DATASET_BYTES) invalid();
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  // Detect mixed publication versions as well as corrupt/truncated parts.
  if (hash !== row.content_hash) invalid();
  return { data: parseJson(text, MAX_DATASET_BYTES), hash };
}

function legalActions(name: RangeDatasetName, spot: RawSpot): string[] {
  switch (name) {
    case "opening-ranges": return spot.hero === "SB" ? ["open", "limp", "fold"] : ["open", "fold"];
    case "preflop-ranges": return ["fold", "call", "three_bet"];
    case "three-bet-responses": return ["fold", "call", "four_bet"];
    case "four-bet-responses": return ["fold", "call", "all_in"];
    case "five-bet-responses": return ["fold", "call"];
    case "limp-responses": return spot.id === "BB_vs_SB_limp" ? ["check", "raise"] : spot.id === "SB_vs_BB_iso" ? ["fold", "call", "raise"] : ["fold", "call", "four_bet"];
    case "limp-deep-responses": return spot.id === "SB_vs_BB_limp_four_bet" ? ["fold", "call", "all_in"] : ["fold", "call"];
  }
}
function validateSpot(name: RangeDatasetName, raw: unknown): RawSpot {
  if (!object(raw) || !identifier(raw.id) || !POSITIONS.includes(raw.hero as string) || raw.effective_stack_bb !== 100 || !Array.isArray(raw.hands) || raw.hands.length !== 169) invalid();
  const spot = raw as RawSpot;
  const before = (a: unknown, b: unknown) => POSITIONS.includes(a as string) && POSITIONS.indexOf(a as string) < POSITIONS.indexOf(b as string);
  if (name === "opening-ranges" && (spot.hero === "BB" || spot.id !== `${spot.hero}_open`)) invalid();
  if (name === "preflop-ranges" && (!before(spot.opener, spot.hero) || spot.id !== `${spot.hero}_vs_${spot.opener}`)) invalid();
  if (name === "three-bet-responses" && (spot.hero !== spot.opener || !before(spot.hero, spot.three_bettor) || spot.id !== `${spot.hero}_vs_${spot.three_bettor}_three_bet` || spot.source_response_id !== `${spot.three_bettor}_vs_${spot.hero}`)) invalid();
  if (name === "four-bet-responses" && (spot.hero !== spot.three_bettor || !before(spot.opener, spot.hero) || spot.id !== `${spot.hero}_vs_${spot.opener}_four_bet` || spot.source_response_id !== `${spot.hero}_vs_${spot.opener}` || spot.source_three_bet_response_id !== `${spot.opener}_vs_${spot.hero}_three_bet`)) invalid();
  if (name === "five-bet-responses" && (spot.hero !== spot.opener || !before(spot.hero, spot.five_bettor) || spot.id !== `${spot.hero}_vs_${spot.five_bettor}_five_bet` || spot.source_four_bet_response_id !== `${spot.five_bettor}_vs_${spot.hero}_four_bet`)) invalid();
  if (name.startsWith("limp")) {
    const ids = name === "limp-responses" ? ["BB_vs_SB_limp", "SB_vs_BB_iso", "BB_vs_SB_limp_reraise"] : ["SB_vs_BB_limp_four_bet", "BB_vs_SB_limp_five_bet"];
    if (!ids.includes(spot.id) || spot.hero !== spot.id.slice(0, 2) || spot.opponent !== (spot.hero === "BB" ? "SB" : "BB") || spot.source_opening_id !== "SB_open" || spot.open_size_bb !== 1) invalid();
    if (spot.id !== "BB_vs_SB_limp" && spot.source_limp_response_id !== "BB_vs_SB_limp") invalid();
    if (["BB_vs_SB_limp_reraise", "SB_vs_BB_limp_four_bet", "BB_vs_SB_limp_five_bet"].includes(spot.id) && spot.source_iso_response_id !== "SB_vs_BB_iso") invalid();
    if (name === "limp-deep-responses" && (spot.source_limp_reraise_response_id !== "BB_vs_SB_limp_reraise" || (spot.id === "BB_vs_SB_limp_five_bet" && spot.source_four_bet_response_id !== "SB_vs_BB_limp_four_bet"))) invalid();
  } else if (spot.open_size_bb !== ((spot.opener ?? spot.hero) === "SB" ? 3.5 : 2.5)) invalid();
  for (const key of SIZE_KEYS) if (key in spot && !finite(spot[key], 0.5, 100)) invalid();
  const fullRaise = (to: unknown, previous: unknown, before: unknown) => {
    if (!finite(to, 0.5, 99.999) || !finite(previous, 0.5, 100) || !finite(before, 0, 100) || to <= previous || to < 2 * previous - before) invalid();
  };
  if ("three_bet_size_bb" in spot) fullRaise(spot.three_bet_size_bb, spot.open_size_bb, 1);
  if ("four_bet_size_bb" in spot) fullRaise(spot.four_bet_size_bb, spot.three_bet_size_bb ?? spot.limp_reraise_size_bb, spot.three_bet_size_bb ? spot.open_size_bb : spot.iso_size_bb);
  if (spot.id === "BB_vs_SB_limp") fullRaise(spot.raise_size_bb, 1, 0);
  if (spot.id === "SB_vs_BB_iso") fullRaise(spot.raise_to_bb, spot.iso_size_bb, 1);
  const actions = legalActions(name, spot);
  const sizeFor: Record<string, unknown> = {
    open: spot.open_size_bb, limp: 1, three_bet: spot.three_bet_size_bb, four_bet: spot.four_bet_size_bb,
    all_in: spot.all_in_size_bb, raise: spot.raise_size_bb ?? spot.raise_to_bb,
  };
  if (sizeFor.all_in !== undefined && sizeFor.all_in !== 100) invalid();
  const seen = new Set<string>();
  for (const row of spot.hands) {
    if (!object(row) || typeof row.hand !== "string" || !HAND_SET.has(row.hand) || seen.has(row.hand)) invalid();
    seen.add(row.hand);
    if (actions.some(action => !integer(row[action], 0, 100)) || actions.reduce((sum, action) => sum + (row[action] as number), 0) !== 100 || ACTIONS.some(action => !actions.includes(action) && action in row)) invalid();
    for (const action of actions) if (action in sizeFor) {
      const key = action === "raise" ? "raise_size_bb" : `${action}_size_bb`;
      if (!finite(sizeFor[action], 0.5, 100) || row[key] !== ((row[action] as number) > 0 ? sizeFor[action] : null)) invalid();
    }
    if ("equity_vs_shove_pct" in row && row.equity_vs_shove_pct !== null && !finite(row.equity_vs_shove_pct, 0, 100)) invalid();
    if ("reason" in row && (typeof row.reason !== "string" || row.reason.length > 4096)) invalid();
  }
  return spot;
}
function reader(db: ReadOnlyDatabase | undefined) {
  // Request-local cache only: never reuse account data or stale published bytes.
  const cache = new Map<RangeDatasetName, Promise<SavedDataset>>();
  const load = (name: RangeDatasetName): Promise<SavedDataset> => {
    if (!cache.has(name)) cache.set(name, (async () => {
      const saved = (await readPublishedJson(db, name))!;
      const raw = saved.data;
      if (!object(raw) || !object(raw.metadata) || raw.metadata.schema_version !== "1.0" || raw.metadata.strategy_type !== KIND || raw.metadata.game !== "6max Cash / No-Limit Texas Holdem" || raw.metadata.effective_stack_bb !== 100 || raw.metadata.ante_bb !== 0 || !object(raw.metadata.rake) || raw.metadata.rake.rate !== 0.05 || raw.metadata.rake.cap_bb !== 3 || raw.metadata.rake.no_flop_no_drop !== true || !Array.isArray(raw.spots) || !integer(raw.spot_count, 1, 70) || raw.spots.length !== raw.spot_count || raw.hand_classes_per_spot !== 169 || raw.entry_count !== raw.spot_count * 169) invalid();
      const spots = raw.spots.map(spot => validateSpot(name, spot));
      if (new Set(spots.map(spot => spot.id)).size !== spots.length) invalid();
      return { metadata: raw.metadata, spots, hash: saved.hash };
    })());
    return cache.get(name)!;
  };
  const spot = async (name: RangeDatasetName, id: string): Promise<RawSpot> => {
    const value = (await load(name)).spots.find(item => item.id === id);
    if (!value) throw new McpDataError("not_found", "This exact saved spot is not published; no nearby spot was substituted.");
    return value;
  };
  return { load, spot };
}

// Read only the existing, validated head-up range datasets needed to reproduce a
// published postflop fingerprint. Dataset names are selected internally from the
// published spot; MCP clients cannot choose another table or source family.
export async function loadPublishedPostflopSourceDatasets(db: ReadOnlyDatabase | undefined, requirements: Record<string, readonly string[]>) {
  if (!object(requirements) || Object.keys(requirements).length < 1 || Object.keys(requirements).length > SUPPORTED_RANGE_DATASETS.length) {
    throw new McpDataError("invalid_argument", "Invalid published postflop source selection.");
  }
  const selected = Object.entries(requirements).map(([name, ids]) => {
    const supported = datasetName(name);
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || ids.some(id => !identifier(id)) || new Set(ids).size !== ids.length) {
      throw new McpDataError("invalid_argument", "Invalid published postflop source selection.");
    }
    return [supported, ids] as const;
  });
  const entries = await Promise.all(selected.map(async ([name, ids]) => {
    // The byte/hash and publication envelope cover the complete source file, while the
    // costlier row validation stays limited to the exact source spots needed by this policy.
    const saved = await readPublishedJson(db, name);
    const raw = saved?.data;
    if (!object(raw) || !object(raw.metadata) || raw.metadata.schema_version !== "1.0" || raw.metadata.strategy_type !== KIND
      || raw.metadata.game !== "6max Cash / No-Limit Texas Holdem" || raw.metadata.effective_stack_bb !== 100 || raw.metadata.ante_bb !== 0
      || !object(raw.metadata.rake) || raw.metadata.rake.rate !== 0.05 || raw.metadata.rake.cap_bb !== 3 || raw.metadata.rake.no_flop_no_drop !== true
      || !Array.isArray(raw.spots) || !integer(raw.spot_count, 1, 70) || raw.spots.length !== raw.spot_count
      || raw.hand_classes_per_spot !== 169 || raw.entry_count !== raw.spot_count * 169) invalid();
    const rawSpots = raw.spots;
    const spots = ids.map(id => {
      const matches = rawSpots.filter((value: unknown) => object(value) && value.id === id);
      if (!matches.length) throw new McpDataError("not_found", "An exact published source spot is missing; no substitute was used.");
      if (matches.length !== 1) invalid();
      return validateSpot(name, matches[0]);
    });
    return [name, { metadata: raw.metadata, spots, contentHash: saved!.hash }] as const;
  }));
  return Object.fromEntries(entries);
}

function spotContext(spot: RawSpot) {
  const context: Record<string, string | number> = { id: spot.id, hero: spot.hero, effective_stack_bb: 100 };
  for (const key of ["opener", "opponent", "three_bettor", "five_bettor"]) if (POSITIONS.includes(spot[key] as string)) context[key] = spot[key] as string;
  for (const key of SIZE_KEYS) if (finite(spot[key], 0.5, 100)) context[key] = spot[key];
  return context;
}

export interface CoverageInput { dataset?: string; offset?: number; limit?: number }
export async function listSavedRangeCoverage(db: ReadOnlyDatabase | undefined, input: CoverageInput = {}) {
  const offset = boundedInt(input.offset, 0, 0, 1000), limit = boundedInt(input.limit, 20, 1, 50);
  if (input.dataset !== undefined) {
    const name = datasetName(input.dataset), saved = await reader(db).load(name);
    return { kind: KIND, notice: NOTICE, dataset: name, contentHash: saved.hash, total: saved.spots.length,
      spots: saved.spots.slice(offset, offset + limit).map(spotContext), nextOffset: offset + limit < saved.spots.length ? offset + limit : null };
  }
  const rows = await query<MetaRow>(db, `SELECT name, content_hash, bytes, parts FROM preflop_datasets WHERE name IN (${CATALOG_DATASETS.map(() => "?").join(", ")}) ORDER BY name LIMIT 14`, ...CATALOG_DATASETS);
  if (rows.length > CATALOG_DATASETS.length || new Set(rows.map(row => row.name)).size !== rows.length) invalid();
  const datasets = rows.map(row => {
    if (!CATALOG_DATASETS.includes(row.name)) invalid();
    const lookupSupported = SUPPORTED_RANGE_DATASETS.includes(row.name as RangeDatasetName);
    // Large continuation archives are visible in coverage, but not parsed by this MVP.
    if (lookupSupported) validMeta(row);
    else if (!/^[a-f0-9]{64}$/.test(row.content_hash) || !integer(row.bytes, 1, 1_000_000_000) || !integer(row.parts, 1, 100_000)) invalid();
    return { dataset: row.name, contentHash: row.content_hash, bytes: row.bytes, lookupSupported };
  });
  return { kind: KIND, notice: NOTICE, total: datasets.length, datasets: datasets.slice(offset, offset + limit), nextOffset: offset + limit < datasets.length ? offset + limit : null };
}

async function reachableHands(read: ReturnType<typeof reader>, name: RangeDatasetName, spot: RawSpot): Promise<Set<string>> {
  const required: { source: RawSpot; action: string }[] = [];
  const source = async (dataset: RangeDatasetName, id: string, action: string) => {
    const prior = await read.spot(dataset, id);
    for (const key of ["effective_stack_bb", "three_bet_size_bb", "four_bet_size_bb", "iso_size_bb", "limp_reraise_size_bb"]) {
      if (key in spot && key in prior && spot[key] !== prior[key]) invalid();
    }
    if (prior.hero !== spot.hero) invalid();
    required.push({ source: prior, action });
  };
  if (name === "three-bet-responses" || name === "five-bet-responses") await source("opening-ranges", `${spot.hero}_open`, "open");
  if (name === "four-bet-responses") await source("preflop-ranges", spot.source_response_id as string, "three_bet");
  if (name === "five-bet-responses") await source("three-bet-responses", `${spot.hero}_vs_${spot.five_bettor}_three_bet`, "four_bet");
  if (spot.id === "SB_vs_BB_iso" || spot.id === "SB_vs_BB_limp_four_bet") await source("opening-ranges", "SB_open", "limp");
  if (spot.id === "BB_vs_SB_limp_reraise" || spot.id === "BB_vs_SB_limp_five_bet") await source("limp-responses", "BB_vs_SB_limp", "raise");
  if (spot.id === "SB_vs_BB_limp_four_bet") await source("limp-responses", "SB_vs_BB_iso", "raise");
  if (spot.id === "BB_vs_SB_limp_five_bet") await source("limp-responses", "BB_vs_SB_limp_reraise", "four_bet");
  const reachable = new Set(HANDS);
  for (const { source: prior, action } of required) for (const row of prior.hands) {
    if (!integer(row[action], 0, 100)) invalid();
    if (row[action] === 0) reachable.delete(row.hand as string);
  }
  for (const row of spot.hands) if (!reachable.has(row.hand as string) && row.fold !== 100) invalid();
  return reachable;
}

async function validatePredecessors(read: ReturnType<typeof reader>, name: RangeDatasetName, spot: RawSpot): Promise<void> {
  // Verify the exact preceding saved path, including the other player's action.
  // A plausible spot ID alone must not hide a missing or mismatched source.
  let priorName: RangeDatasetName, priorId: string, priorAction: string;
  const equalKeys = ["effective_stack_bb"];
  if (name === "opening-ranges") return;
  if (name === "preflop-ranges") {
    priorName = "opening-ranges"; priorId = `${spot.opener}_open`; priorAction = "open";
    equalKeys.push("open_size_bb");
  } else if (name === "three-bet-responses") {
    priorName = "preflop-ranges"; priorId = spot.source_response_id as string; priorAction = "three_bet";
    equalKeys.push("open_size_bb", "three_bet_size_bb");
  } else if (name === "four-bet-responses") {
    priorName = "three-bet-responses"; priorId = spot.source_three_bet_response_id as string; priorAction = "four_bet";
    equalKeys.push("open_size_bb", "three_bet_size_bb", "four_bet_size_bb");
  } else if (name === "five-bet-responses") {
    priorName = "four-bet-responses"; priorId = spot.source_four_bet_response_id as string; priorAction = "all_in";
    equalKeys.push("open_size_bb", "three_bet_size_bb", "four_bet_size_bb", "all_in_size_bb");
  } else if (spot.id === "BB_vs_SB_limp") {
    priorName = "opening-ranges"; priorId = "SB_open"; priorAction = "limp";
  } else if (spot.id === "SB_vs_BB_iso") {
    priorName = "limp-responses"; priorId = "BB_vs_SB_limp"; priorAction = "raise";
    equalKeys.push("open_size_bb");
  } else if (spot.id === "BB_vs_SB_limp_reraise") {
    priorName = "limp-responses"; priorId = "SB_vs_BB_iso"; priorAction = "raise";
    equalKeys.push("open_size_bb", "iso_size_bb");
  } else if (spot.id === "SB_vs_BB_limp_four_bet") {
    priorName = "limp-responses"; priorId = "BB_vs_SB_limp_reraise"; priorAction = "four_bet";
    equalKeys.push("open_size_bb", "iso_size_bb", "limp_reraise_size_bb", "four_bet_size_bb");
  } else {
    priorName = "limp-deep-responses"; priorId = "SB_vs_BB_limp_four_bet"; priorAction = "all_in";
    equalKeys.push("open_size_bb", "iso_size_bb", "limp_reraise_size_bb", "four_bet_size_bb", "all_in_size_bb");
  }
  const prior = await read.spot(priorName, priorId);
  if (equalKeys.some(key => spot[key] !== prior[key]) || !prior.hands.some(row => finite(row[priorAction], 1, 100))) invalid();
  if (spot.id === "SB_vs_BB_iso" && spot.iso_size_bb !== prior.raise_size_bb) invalid();
  if (spot.id === "BB_vs_SB_limp_reraise" && spot.limp_reraise_size_bb !== prior.raise_to_bb) invalid();
  await validatePredecessors(read, priorName, prior);
}

export interface SavedRangeInput { dataset: string; spotId: string; hand?: string }
export async function getSavedRange(db: ReadOnlyDatabase | undefined, input: SavedRangeInput) {
  const name = datasetName(input?.dataset);
  if (!identifier(input.spotId) || input.hand !== undefined && !HAND_SET.has(input.hand)) throw new McpDataError("invalid_argument", "Use an exact saved spot ID and a canonical hand such as AA, AKs or AKo.");
  const read = reader(db), saved = await read.load(name), spot = await read.spot(name, input.spotId);
  await validatePredecessors(read, name, spot);
  const reachable = await reachableHands(read, name, spot), actions = legalActions(name, spot);
  const selected = input.hand ? spot.hands.filter(row => row.hand === input.hand) : spot.hands;
  let reason: { text: string; source: string; contentHash: string; sourceFingerprint: string | null } | null = null;
  if (input.hand) {
    const row = selected[0];
    if (typeof row.reason === "string") reason = { text: row.reason, source: name, contentHash: saved.hash, sourceFingerprint: null };
    else {
      const reasonName = `reasons/${spot.id}`, stored = await readPublishedJson(db, reasonName, true);
      if (stored) {
        const raw = stored.data;
        if (!object(raw) || raw.spot_id !== spot.id || !object(raw.hands) || !object(raw.hands[input.hand])) invalid();
        const handReason = raw.hands[input.hand];
        if (!object(handReason) || typeof handReason.reason !== "string" || handReason.reason.length > 4096 || typeof raw.source_fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(raw.source_fingerprint)) invalid();
        reason = { text: handReason.reason, source: reasonName, contentHash: stored.hash, sourceFingerprint: raw.source_fingerprint };
      }
    }
  }
  return { kind: KIND, notice: NOTICE, dataset: name, contentHash: saved.hash, spot: spotContext(spot),
    conditions: { game: "6max Cash / No-Limit Texas Holdem", effectiveStackBb: 100, anteBb: 0, rake: { rate: 0.05, capBb: 3, noFlopNoDrop: true } },
    frequencyUnit: "percent" as const, frequencySemantics: "Conditional on reaching this saved spot; unreachable rows have no recommendation.",
    hands: selected.map(row => ({ hand: row.hand as string, reachable: reachable.has(row.hand as string),
      frequencies: reachable.has(row.hand as string) ? Object.fromEntries(actions.map(action => [action, row[action] as number])) : null,
      sizesBb: reachable.has(row.hand as string) ? Object.fromEntries(SIZE_KEYS.filter(key => key in row).map(key => [key, row[key] as number | null])) : null })),
    reason, reasonStatus: !input.hand ? "select_hand" : reason ? "saved" : "not_published" };
}

export interface LearningHistoryInput { limit?: number }
export interface LearningAnswer { spotId: string; hand: string; action: string; result: "best" | "mixed" | "miss"; score: number; at: number | null }
const HISTORY_KEY = "reysonai.trainer.history.v1", DRILLS_KEY = "reysonai.trainer.drills.v1", REVIEWS_KEY = "reysonai.trainer.review-sessions.v1";
const TRAINER_SPOTS = new Set(POSITIONS.slice(0, -1).map(position => `${position}_open`).concat(POSITIONS.flatMap((hero, i) => POSITIONS.slice(0, i).map(opener => `${hero}_vs_${opener}`))));
function savedArray(data: RecordValue, key: string): unknown[] {
  if (!Object.hasOwn(data, key)) return [];
  const value = typeof data[key] === "string" ? parseJson(data[key], MAX_ACCOUNT_BYTES) : data[key];
  if (!Array.isArray(value)) invalid();
  return value;
}
function answerProjection(value: unknown): LearningAnswer | null {
  if (!object(value) || typeof value.spotId !== "string" || !TRAINER_SPOTS.has(value.spotId) || typeof value.hand !== "string" || !HAND_SET.has(value.hand)) return null;
  const actions = value.spotId.endsWith("_open") ? ["open", "fold"] : ["fold", "call", "three_bet"];
  if (!actions.includes(value.action as string) || !["best", "mixed", "miss"].includes(value.result as string) || value.score !== ({ best: 1, mixed: 0.5, miss: 0 }[value.result as string])) return null;
  if (value.at !== undefined && !integer(value.at, 0, 8_640_000_000_000_000)) return null;
  return { spotId: value.spotId, hand: value.hand, action: value.action as string, result: value.result as LearningAnswer["result"], score: value.score as number, at: value.at as number ?? null };
}
type SessionFact = { kind: "drill" | "review"; at: number; answered: number; score: number; accuracy: number; durationMs: number | null; handHistorySaved: boolean };
function sessionProjection(value: unknown, kind: SessionFact["kind"]): SessionFact | null {
  if (!object(value) || !integer(value.at, 0, 8_640_000_000_000_000) || !integer(value.answered, 1, 100_000) || !finite(value.score, 0, value.answered)) return null;
  return { kind, at: value.at, answered: value.answered, score: value.score, accuracy: value.score / value.answered,
    durationMs: integer(value.durationMs, 0, 31_536_000_000) ? value.durationMs : null,
    handHistorySaved: Array.isArray(value.hands) && value.hands.length === value.answered && value.hands.every(hand => answerProjection(hand) !== null) };
}

// trustedUserId MUST come from validated OAuth identity, never a model-supplied
// tool argument. The parameterized WHERE is the only account access in this file.
export async function getOwnLearningHistory(db: ReadOnlyDatabase | undefined, trustedUserId: string, input: LearningHistoryInput = {}) {
  if (typeof trustedUserId !== "string" || trustedUserId.length < 1 || trustedUserId.length > 255 || /[\u0000-\u001f\u007f]/.test(trustedUserId)) throw new McpDataError("invalid_argument", "An authenticated account identity is required.");
  const limit = boundedInt(input.limit, 20, 1, 50);
  const rows = await query<{ data_json: string; version: number }>(db, "SELECT data_json, version FROM account_data WHERE user_id = ? LIMIT 2", trustedUserId);
  if (rows.length > 1) invalid();
  const data = rows.length ? parseJson(rows[0].data_json, MAX_ACCOUNT_BYTES) : {};
  if (!object(data) || rows.length && !integer(rows[0].version, 0, Number.MAX_SAFE_INTEGER)) invalid();
  const rawHistory = savedArray(data, HISTORY_KEY), historyWindow = rawHistory.slice(-500);
  const answers = historyWindow.map(answerProjection).filter((answer): answer is LearningAnswer => answer !== null);
  const counts = { best: 0, mixed: 0, miss: 0 };
  for (const answer of answers) counts[answer.result]++;
  const bySpot = new Map<string, { spotId: string; answered: number; score: number }>();
  for (const answer of answers) {
    const group = bySpot.get(answer.spotId) ?? { spotId: answer.spotId, answered: 0, score: 0 };
    group.answered++; group.score += answer.score; bySpot.set(answer.spotId, group);
  }
  const drills = savedArray(data, DRILLS_KEY), reviews = savedArray(data, REVIEWS_KEY);
  let invalidSessions = 0, sessionsTruncated = drills.length > 50 || reviews.length > 50;
  const sessions: SessionFact[] = [];
  const addSessions = (values: unknown[], kind: SessionFact["kind"]) => {
    if (values.length > 50) sessionsTruncated = true;
    for (const value of values.slice(-50)) { const projected = sessionProjection(value, kind); if (projected) sessions.push(projected); else invalidSessions++; }
  };
  for (const drill of drills.slice(-50)) {
    if (!object(drill) || !Array.isArray(drill.sessions)) { invalidSessions++; continue; }
    addSessions(drill.sessions, "drill");
  }
  addSessions(reviews, "review");
  const score = answers.reduce((sum, answer) => sum + answer.score, 0);
  return { source: "own_synced_account_practice" as const, syncedDataPresent: rows.length > 0, version: rows[0]?.version ?? 0,
    notice: "Only practice data already synced to this authenticated account. Browser-only records may be absent. Old untagged records cannot be reliably separated from legacy modes. Accuracy is the saved grading score, not GTO, EV, win rate, authoritative rank, or a measure of real-money skill.",
    summary: { answered: answers.length, score, accuracy: answers.length ? score / answers.length : null, results: counts,
      distinctSpotHands: new Set(answers.map(answer => `${answer.spotId}:${answer.hand}`)).size,
      bySpot: [...bySpot.values()].map(group => ({ ...group, accuracy: group.score / group.answered })) },
    // Global history is not joined to sessions: older summary-only sessions never
    // receive fabricated hand logs, and repeated review answers retain their order.
    recentAnswers: answers.slice(-limit).reverse(),
    sessions: { completedDrillAttempts: sessions.filter(session => session.kind === "drill").length, completedReviewAttempts: sessions.filter(session => session.kind === "review").length,
      recent: sessions.sort((a, b) => b.at - a.at).slice(0, limit), truncated: sessionsTruncated, invalidRecordsIgnored: invalidSessions },
    historyWindow: { maxRecords: 500, truncated: rawHistory.length > 500, invalidRecordsIgnored: historyWindow.length - answers.length } };
}
