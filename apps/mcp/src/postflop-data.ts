// Read-only access to published postflop policies and exact flop bases from the
// same D1 rows used by /v1/postflop/spots, /v1/postflop/spot and /v1/postflop/flop.
// The optional policy evaluator is a bounded deterministic view of one saved flop
// node; it never generates a policy or fills a missing board/history.
import { loadPublishedPostflopSourceDatasets, McpDataError, type ReadOnlyDatabase } from "./data.ts";
import { canonicalFlop, remapFlopNode, hydrateFrame, unpackView, flopState, NODES, referenceLaterPolicy,
  assertPolicyNodeComplete, buildInputs, flopNodeCanonical, parseFlopBoard, validatePolicy,
  type FlopBase, type PackedView, type CodecView, type EvaluatedFlopNode, type FlopPolicy, type PostflopInputs } from "./postflop-shared.mjs";

const KIND = "ai_estimate_not_gto" as const;
const NOTICE = "Saved independent AI estimates for study; not solver GTO, live-game assistance, or a guarantee of profit. Missing, unreachable, or unpublished paths have no substitute strategy.";
const POSITIONS = new Set(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
const IDENTIFIER = /^[A-Za-z0-9_]{1,100}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HAND_RANKS = "AKQJT98765432";
const HANDS = HAND_RANKS.split("").flatMap((a, i) => HAND_RANKS.split("").map((b, j) => i === j ? a + b : i < j ? a + b + "s" : b + a + "o"));
const HAND_SET = new Set(HANDS);
const FLOP_ACTIONS = new Set(["check", "fold", "call", "raise", "bet33", "bet75", "bet125"]);
const SPOT_ACTIONS = new Set([...FLOP_ACTIONS, "open", "limp", "three_bet", "four_bet", "squeeze", "all_in", "allin"]);
const FLOP_NODES = /^(?:oop|ip|btn|bb)_(?:first|vs_(?:33|75|125|raise\d*))$/;
const TIERS = new Set(["monster", "strong", "draw", "medium", "air"]);
const MAX_SPOTS = 100;
const MAX_SPOT_ROWS = MAX_SPOTS + 1;
const MAX_POLICIES = MAX_SPOTS * 2 + 1;
const MAX_RELEASE_BYTES = 128_000;
const MAX_SPOT_BYTES = 90_000;
const MAX_POLICY_BYTES = 90_000;
const MAX_FLOP_PARTS = 64;
const MAX_FLOP_PART_BYTES = 45_000;
const MAX_FLOP_COMPRESSED_BYTES = 1_500_000;
const MAX_FLOP_JSON_BYTES = 12_000_000;
const MAX_HISTORIES = 2_000;
const MAX_FLOP_COLUMNS = 4_096;
const MAX_RESPONSE_BYTES = 80_000;
const CANONICAL_FLOPS = 1_755;

type Value = Record<string, unknown>;
type VersionRow = { name: string; content_hash: string; published_at: string; detail_json: string };
type SpotRow = { spot_id: string; slug: string; kind: string; tree: string; ip: string; oop: string; pot_bb: number; stack_bb: number; spot_json: string };
type PolicyRow = { spot_id: string; stage: string; policy_hash: string };
type FlopPart = { part: number; parts: number; content_hash: string; body: unknown };
type PublishedSpot = {
  id: string; kind: string; slug: string; tree: string; ip: string; oop: string; potBb: number; effectiveStackBb: number;
  opener?: string; caller?: string; aggressor?: string; threeBettor?: string;
  history?: { seat: string; action: string; toSizeBb: number | null }[];
};
type PolicyEntry = { policyHash: string; sourceHash: string; flopPolicyHash: string | null; policy: Value };
type PublishedCatalog = {
  release: VersionRow | null; baseRelease: VersionRow | null;
  policyHashes: Record<string, { flop: string; later: string | null }>;
  baseCounts: Record<string, number>;
  spots: Map<string, { data: Value; context: PublishedSpot; hashes: { flop: string; later: string | null } }>;
};
type BoundedInput = { spotId?: string; flop?: string; offset?: number; limit?: number };

function object(value: unknown): value is Value { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function integer(value: unknown, min: number, max: number): value is number { return finite(value, min, max) && Number.isInteger(value); }
function requiredString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function invalid(): never { throw new McpDataError("invalid_saved_data", "Published postflop data is incomplete or invalid; no estimate was substituted."); }
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!integer(value, min, max)) throw new McpDataError("invalid_argument", "Invalid postflop pagination limit or offset.");
  return value;
}

async function query<T>(db: ReadOnlyDatabase | undefined, sql: string, ...args: unknown[]): Promise<T[]> {
  if (!db) throw new McpDataError("data_unavailable", "Published postflop storage is unavailable.");
  try {
    const result = await db.prepare(sql).bind(...args).all<T>();
    if (!Array.isArray(result?.results)) invalid();
    return result.results;
  } catch (error) {
    if (error instanceof McpDataError) throw error;
    throw new McpDataError("data_unavailable", "Published postflop data could not be read.");
  }
}

async function digest(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", owned.buffer))].map(value => value.toString(16).padStart(2, "0")).join("");
}
function textBytes(value: string, max: number): Uint8Array {
  if (typeof value !== "string" || value.length > max) invalid();
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > max) invalid();
  return bytes;
}
function parseJson(value: unknown, max: number): unknown {
  if (typeof value !== "string") invalid();
  const bytes = textBytes(value, max);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return invalid(); }
}
function versionRow(value: unknown, expected: string): VersionRow {
  if (!object(value) || value.name !== expected || !requiredString(value.content_hash, 64) || !SHA256.test(value.content_hash)
    || !requiredString(value.published_at, 80) || !Number.isFinite(Date.parse(value.published_at))
    || typeof value.detail_json !== "string" || value.detail_json.length > MAX_RELEASE_BYTES) invalid();
  return value as VersionRow;
}
function parsePolicyHashes(version: VersionRow): Record<string, { flop: string; later: string | null }> {
  const detail = parseJson(version.detail_json, MAX_RELEASE_BYTES);
  if (!object(detail) || !object(detail.spots) || Object.keys(detail.spots).length > MAX_SPOTS) invalid();
  const entries: Record<string, { flop: string; later: string | null }> = {};
  for (const [id, value] of Object.entries(detail.spots)) {
    if (!IDENTIFIER.test(id) || !object(value) || !requiredString(value.flop, 64) || !SHA256.test(value.flop)
      || value.later !== null && (!requiredString(value.later, 64) || !SHA256.test(value.later))) invalid();
    entries[id] = { flop: value.flop as string, later: value.later as string | null };
  }
  return entries;
}

// SHA-256 over canonical JSON text. Kept async for Web Crypto on Workers.
async function digestText(text: string): Promise<string> { return digest(new TextEncoder().encode(text)); }

function parseBaseCounts(version: VersionRow | null, policyHashes: Record<string, { flop: string; later: string | null }>): Record<string, number> {
  if (!version) return {};
  const detail = parseJson(version.detail_json, MAX_RELEASE_BYTES);
  if (!object(detail) || !object(detail.spots) || Object.keys(detail.spots).length > MAX_SPOTS) invalid();
  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(detail.spots)) {
    if (!IDENTIFIER.test(id) || !Object.hasOwn(policyHashes, id) || !integer(count, 1, CANONICAL_FLOPS)) invalid();
    counts[id] = count;
  }
  return counts;
}

function projectSpot(row: SpotRow): { data: Value; context: PublishedSpot } {
  if (!object(row) || !IDENTIFIER.test(row.spot_id) || !requiredString(row.slug, 100) || !requiredString(row.kind, 32)
    || !/^(?:oop_checks|oop_leads)$/.test(row.tree) || !POSITIONS.has(row.ip) || !POSITIONS.has(row.oop) || row.ip === row.oop
    || !finite(row.pot_bb, 0, 1_000) || !finite(row.stack_bb, 0, 100) || typeof row.spot_json !== "string" || row.spot_json.length > MAX_SPOT_BYTES) invalid();
  const data = parseJson(row.spot_json, MAX_SPOT_BYTES);
  if (!object(data) || data.id !== row.spot_id || data.slug !== row.slug || data.kind !== row.kind || data.tree !== row.tree
    || data.ip !== row.ip || data.oop !== row.oop || data.potBb !== row.pot_bb || data.stackBb !== row.stack_bb
    || data.reachable !== true) invalid();
  const context: PublishedSpot = { id: row.spot_id, kind: row.kind, slug: row.slug, tree: row.tree, ip: row.ip, oop: row.oop,
    potBb: row.pot_bb, effectiveStackBb: row.stack_bb };
  for (const key of ["opener", "caller", "aggressor", "threeBettor"] as const) {
    if (key in data) {
      if (key === "aggressor" && data[key] === null) continue;
      if (!POSITIONS.has(data[key] as string)) invalid();
      context[key] = data[key] as string;
    }
  }
  if ("history" in data) {
    if (!Array.isArray(data.history) || data.history.length > 32) invalid();
    context.history = data.history.map((step: unknown) => {
      if (!object(step) || !POSITIONS.has(step.seat as string) || !SPOT_ACTIONS.has(step.action as string)
        || step.to_size_bb !== null && !finite(step.to_size_bb, 0, 100)) invalid();
      return { seat: step.seat as string, action: step.action as string, toSizeBb: step.to_size_bb as number | null };
    });
  }
  return { data, context };
}

async function loadCatalog(db: ReadOnlyDatabase | undefined): Promise<PublishedCatalog> {
  const rows = await query<VersionRow>(db,
    "SELECT name, content_hash, published_at, detail_json FROM dataset_versions WHERE name IN (?, ?) ORDER BY name LIMIT 3", "postflop", "flop-base");
  if (rows.length > 2 || new Set(rows.map(row => row.name)).size !== rows.length) invalid();
  if (rows.some(row => !object(row) || !["postflop", "flop-base"].includes(row.name))) invalid();
  const byName = new Map(rows.map(row => [row.name, versionRow(row, row.name)]));
  const release = byName.get("postflop") ?? null, baseRelease = byName.get("flop-base") ?? null;
  if (!release) return { release: null, baseRelease, policyHashes: {}, baseCounts: {}, spots: new Map() };
  if (!baseRelease && (await query<unknown>(db, "SELECT spot_id FROM postflop_flop_base_br LIMIT 1")).length) invalid();

  const policyHashes = parsePolicyHashes(release);
  if (await digestText(JSON.stringify(policyHashes)) !== release.content_hash) invalid();
  const [spotRows, policyRows] = await Promise.all([
    query<SpotRow>(db, "SELECT spot_id, slug, kind, tree, ip, oop, pot_bb, stack_bb, spot_json FROM postflop_spots ORDER BY spot_id LIMIT ?", MAX_SPOT_ROWS),
    query<PolicyRow>(db, "SELECT spot_id, stage, policy_hash FROM postflop_policies ORDER BY spot_id, stage LIMIT ?", MAX_POLICIES),
  ]);
  if (spotRows.length > MAX_SPOTS || spotRows.length !== Object.keys(policyHashes).length || policyRows.length > MAX_POLICIES) invalid();
  const contexts = new Map<string, { data: Value; context: PublishedSpot }>();
  for (const row of spotRows) {
    const projected = projectSpot(row);
    if (contexts.has(projected.context.id) || !Object.hasOwn(policyHashes, projected.context.id)) invalid();
    contexts.set(projected.context.id, projected);
  }
  const policyRowsBySpot = new Map<string, Map<string, string>>();
  for (const row of policyRows) {
    if (!IDENTIFIER.test(row.spot_id) || !Object.hasOwn(policyHashes, row.spot_id) || !["flop", "later"].includes(row.stage)
      || !requiredString(row.policy_hash, 64) || !SHA256.test(row.policy_hash)) invalid();
    const stages = policyRowsBySpot.get(row.spot_id) ?? new Map<string, string>();
    if (stages.has(row.stage)) invalid();
    stages.set(row.stage, row.policy_hash); policyRowsBySpot.set(row.spot_id, stages);
  }
  for (const [id, hashes] of Object.entries(policyHashes)) {
    const stages = policyRowsBySpot.get(id);
    if (!contexts.has(id) || !stages || stages.get("flop") !== hashes.flop
      || (hashes.later === null ? stages.has("later") : stages.get("later") !== hashes.later)) invalid();
  }

  const baseCounts = parseBaseCounts(baseRelease, policyHashes);
  if (baseRelease) {
    const actualRows = await query<{ spot_id: string; flop_count: number }>(db,
      "SELECT spot_id, COUNT(DISTINCT flop_key) AS flop_count FROM postflop_flop_base_br GROUP BY spot_id ORDER BY spot_id LIMIT ?", MAX_SPOT_ROWS);
    if (actualRows.length > MAX_SPOTS) invalid();
    const actual = new Map<string, number>();
    for (const row of actualRows) {
      if (!IDENTIFIER.test(row.spot_id) || !Object.hasOwn(policyHashes, row.spot_id) || !integer(row.flop_count, 1, CANONICAL_FLOPS)) invalid();
      actual.set(row.spot_id, row.flop_count);
    }
    if (actual.size !== Object.keys(baseCounts).length || Object.entries(baseCounts).some(([id, count]) => actual.get(id) !== count)) invalid();
  }
  const spots = new Map<string, PublishedCatalog["spots"] extends Map<string, infer T> ? T : never>();
  for (const [id, hashes] of Object.entries(policyHashes)) spots.set(id, { ...contexts.get(id)!, hashes });
  return { release, baseRelease, policyHashes, baseCounts, spots };
}

// One-node evaluation validates only its exact published spot and policy rows. The
// catalog reader remains responsible for full coverage and saved-base consistency.
async function loadPublishedSpot(db: ReadOnlyDatabase | undefined, spotId: string) {
  const releases = await query<VersionRow>(db,
    "SELECT name, content_hash, published_at, detail_json FROM dataset_versions WHERE name = ? LIMIT 2", "postflop");
  if (releases.length > 1) invalid();
  if (!releases.length) spotNotFound();
  const release = versionRow(releases[0], "postflop");
  const policyHashes = parsePolicyHashes(release);
  if (await digestText(JSON.stringify(policyHashes)) !== release.content_hash) invalid();
  const hashes = policyHashes[spotId];
  if (!hashes) spotNotFound();

  const rows = await query<SpotRow>(db,
    "SELECT spot_id, slug, kind, tree, ip, oop, pot_bb, stack_bb, spot_json FROM postflop_spots WHERE spot_id = ? LIMIT 2", spotId);
  if (!rows.length) spotNotFound();
  if (rows.length !== 1) invalid();
  const projected = projectSpot(rows[0]);
  if (projected.context.id !== spotId) invalid();

  const policyRows = await query<{ spot_id: string; stage: string; policy_hash: string }>(db,
    "SELECT spot_id, stage, policy_hash FROM postflop_policies WHERE spot_id = ? ORDER BY stage LIMIT 3", spotId);
  const actual = new Map<string, string>();
  for (const row of policyRows) {
    if (row.spot_id !== spotId || !["flop", "later"].includes(row.stage) || !SHA256.test(row.policy_hash) || actual.has(row.stage)) invalid();
    actual.set(row.stage, row.policy_hash);
  }
  if (actual.get("flop") !== hashes.flop || (hashes.later === null ? actual.has("later") : actual.get("later") !== hashes.later)
    || actual.size !== (hashes.later === null ? 1 : 2)) invalid();
  return { release, spot: { ...projected, hashes } };
}

function spotNotFound(): never { throw new McpDataError("not_found", "This exact postflop spot is not published; no nearby spot was substituted."); }
function selectedSpot(catalog: PublishedCatalog, spotId: unknown) {
  if (!IDENTIFIER.test(String(spotId ?? ""))) throw new McpDataError("invalid_argument", "Use an exact postflop spot ID returned by list_postflop_coverage.");
  const spot = catalog.spots.get(spotId as string);
  if (!spot) spotNotFound();
  return spot;
}

function evaluationSourceSelections(spot: Value): Record<string, string[]> {
  if ("history" in spot) throw new McpDataError("unsupported_dataset", "This published multiway source family is not supported by the bounded head-up policy evaluator.");
  const selected: Record<string, string[]> = {};
  const add = (dataset: string, id: unknown) => {
    if (!IDENTIFIER.test(String(id ?? ""))) invalid();
    (selected[dataset] ??= []).push(id as string);
  };
  switch (spot.kind) {
    case "srp":
      add("opening-ranges", spot.openingId); add("preflop-ranges", spot.responseId); break;
    case "3bp":
      add("opening-ranges", spot.openingId); add("preflop-ranges", spot.threeBetId); add("three-bet-responses", spot.responseId); break;
    case "4bp":
      add("opening-ranges", spot.openingId); add("preflop-ranges", spot.threeBetId);
      add("three-bet-responses", spot.fourBetId); add("four-bet-responses", spot.responseId); break;
    case "limp":
      add("opening-ranges", "SB_open");
      for (const id of ["BB_vs_SB_limp", "SB_vs_BB_iso", "BB_vs_SB_limp_reraise"]) add("limp-responses", id);
      if (spot.responseId === "SB_vs_BB_limp_four_bet") add("limp-deep-responses", spot.responseId);
      break;
    default: throw new McpDataError("unsupported_dataset", "This published postflop source family is not supported by the bounded head-up policy evaluator.");
  }
  return selected;
}

function evaluationSourceNames(spot: Value): string[] {
  return Object.keys(evaluationSourceSelections(spot));
}

function policyEvaluationAvailability(spot: Value) {
  try {
    evaluationSourceNames(spot);
    return { status: "head_up_sources_supported", street: "flop", maxHandClasses: 169,
      requirement: "exact published spot, three-card flop, legal action history, and complete saved policy rules for the path" };
  } catch {
    return { status: "source_family_not_supported", street: "flop", maxHandClasses: 169 };
  }
}

function historyKey(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20 || value.some(action => typeof action !== "string" || !FLOP_ACTIONS.has(action))) {
    throw new McpDataError("invalid_argument", "Use a saved flop action history returned by list_postflop_coverage.");
  }
  return [...value] as string[];
}
function canonicalBoard(value: unknown) {
  if (!requiredString(value, 6) || value.length !== 6) throw new McpDataError("invalid_argument", "Enter exactly three distinct cards, such as As7d2c.");
  try { return canonicalFlop(value); } catch { throw new McpDataError("invalid_argument", "Enter exactly three distinct cards, such as As7d2c."); }
}

function validateBaseEnvelope(value: unknown, spotId: string, canonical: string, policyHash: string, sourceHash: string, expectedLaterHash: string): FlopBase {
  if (!object(value) || value.kind !== KIND || value.mode !== "balanced" || value.spot !== spotId || value.flop !== canonical
    || !object(value.metadata) || !object(value.histories) || Object.keys(value.histories).length < 1 || Object.keys(value.histories).length > MAX_HISTORIES
    || value.ev !== undefined || !Array.isArray(value.columns) || value.columns.length > MAX_FLOP_COLUMNS) invalid();
  const meta = value.metadata;
  // This MCP adapter reads the currently published lossless v6 base only. A newer/older
  // storage schema must be reviewed here before it is exposed to clients.
  if (meta.generator_version !== 6 || meta.isomorphism_version !== 1 || meta.policy_hash !== policyHash || meta.source_hash !== sourceHash
    || !SHA256.test(String(meta.later_policy_hash ?? "")) || !integer(meta.evaluator_version, 1, 100)
    || !integer(meta.defence_version, 1, 100) || !SHA256.test(String(meta.later_sizing_hash ?? ""))
    || !SHA256.test(String(meta.defence_config_hash ?? "")) || !integer(meta.seed, 0, 2_147_483_647)
    || meta.explanation_precision !== 4 || !object(meta.samples) || !integer(meta.samples.defence_runouts, 1, 100_000)) invalid();
  if (meta.later_policy_hash !== expectedLaterHash) invalid();
  return value as unknown as FlopBase;
}

let referencePolicyHash: Promise<string> | null = null;
async function referencePolicyHashValue() {
  if (!referencePolicyHash) referencePolicyHash = digestText(JSON.stringify(referenceLaterPolicy()));
  return referencePolicyHash;
}

function byteArray(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!Array.isArray(value) || value.some(byte => !integer(byte, 0, 255))) invalid();
  return Uint8Array.from(value as number[]);
}
function storedPartLength(value: unknown): number {
  const length = value instanceof Uint8Array || Array.isArray(value) ? value.length
    : value instanceof ArrayBuffer ? value.byteLength : -1;
  if (!integer(length, 1, MAX_FLOP_PART_BYTES)) invalid();
  return length;
}

async function decompressBrotli(bytes: Uint8Array): Promise<Uint8Array> {
  let decompressor: DecompressionStream;
  try { decompressor = new DecompressionStream("brotli" as CompressionFormat); }
  catch { throw new McpDataError("data_unavailable", "This runtime cannot decode the published postflop storage format."); }
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const source = new Response(owned.buffer).body;
  if (!source) throw new McpDataError("data_unavailable", "Published postflop data could not be streamed.");
  const reader = source.pipeThrough(decompressor).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FLOP_JSON_BYTES) { await reader.cancel(); invalid(); }
      chunks.push(value);
    }
  } catch { invalid(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

async function loadSavedBase(db: ReadOnlyDatabase | undefined, catalog: PublishedCatalog, spotId: string, flop: string) {
  const spot = selectedSpot(catalog, spotId);
  const expectedBoards = catalog.baseCounts[spotId] ?? 0;
  if (!catalog.baseRelease || !expectedBoards) throw new McpDataError("not_found", "No saved flop range is published for this spot; no range was computed.");
  const canonical = canonicalBoard(flop);
  const [candidateRows, laterRows, parts] = await Promise.all([
    query<{ metadata_json: string; policy_json: string; policy_hash: string }>(db,
      "SELECT metadata_json, policy_json, policy_hash FROM postflop_policies WHERE spot_id = ? AND stage = ? LIMIT 2", spotId, "flop"),
    spot.hashes.later === null ? Promise.resolve([] as { metadata_json: string; policy_json: string; policy_hash: string }[]) : query<{ metadata_json: string; policy_json: string; policy_hash: string }>(db,
      "SELECT metadata_json, policy_json, policy_hash FROM postflop_policies WHERE spot_id = ? AND stage = ? LIMIT 2", spotId, "later"),
    query<FlopPart>(db, "SELECT part, parts, content_hash, body FROM postflop_flop_base_br WHERE spot_id = ? AND flop_key = ? ORDER BY part LIMIT ?", spotId, canonical.key, MAX_FLOP_PARTS + 1),
  ]);
  if (!parts.length) throw new McpDataError("not_found", "This exact flop has no saved range for the published spot; no nearby board was substituted.");
  if (parts.length > MAX_FLOP_PARTS || candidateRows.length !== 1 || laterRows.length > 1) invalid();
  const first = parts[0];
  if (!integer(first.parts, 1, MAX_FLOP_PARTS) || first.parts !== parts.length || !SHA256.test(first.content_hash)
    || parts.some((part, index) => part.part !== index || part.parts !== first.parts || part.content_hash !== first.content_hash)) invalid();
  const compressedLength = parts.reduce((sum, row) => sum + storedPartLength(row.body), 0);
  if (compressedLength < 1 || compressedLength > MAX_FLOP_COMPRESSED_BYTES) invalid();
  const chunks = parts.map(row => byteArray(row.body));
  const compressed = new Uint8Array(compressedLength);
  let cursor = 0;
  for (const chunk of chunks) { compressed.set(chunk, cursor); cursor += chunk.byteLength; }
  const bytes = await decompressBrotli(compressed);
  if (await digest(bytes) !== first.content_hash) invalid();
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return invalid(); }

  const candidate = await parsePolicy(candidateRows[0], spot.hashes.flop);
  const later = spot.hashes.later === null ? null : await parsePolicy(laterRows[0], spot.hashes.later);
  if (later && (later.flopPolicyHash !== candidate.policyHash || later.sourceHash !== candidate.sourceHash)) invalid();
  const fallbackHash = later ? later.policyHash : await referencePolicyHashValue();
  const base = validateBaseEnvelope(raw, spotId, canonical.key, candidate.policyHash, candidate.sourceHash, fallbackHash);
  return { base, canonical, spot, source: { releaseHash: catalog.release!.content_hash, publishedAt: catalog.release!.published_at,
    baseReleaseHash: catalog.baseRelease.content_hash, basePublishedAt: catalog.baseRelease.published_at,
    policyHash: candidate.policyHash, laterPolicyPublished: later !== null, flopBaseHash: first.content_hash } };
}

async function parsePolicy(row: { metadata_json: string; policy_json: string; policy_hash: string }, expectedHash: string): Promise<PolicyEntry> {
  if (!row || !SHA256.test(row.policy_hash) || row.policy_hash !== expectedHash) invalid();
  const metadata = parseJson(row.metadata_json, MAX_POLICY_BYTES), candidate = parseJson(row.policy_json, MAX_POLICY_BYTES);
  if (!object(metadata) || !object(candidate) || !object(candidate.metadata) || !object(candidate.policy)
    || !SHA256.test(String(metadata.source_hash ?? "")) || !SHA256.test(String(metadata.policy_hash ?? ""))
    || metadata.policy_hash !== expectedHash || candidate.metadata.source_hash !== metadata.source_hash
    || candidate.metadata.policy_hash !== expectedHash || JSON.stringify(candidate.metadata) !== JSON.stringify(metadata)
    || candidate.policy.kind !== KIND || candidate.policy.version !== 1
    || candidate.metadata.flop_policy_hash !== undefined && !SHA256.test(String(candidate.metadata.flop_policy_hash))) invalid();
  if (Array.isArray(candidate.policy.rules) && candidate.policy.rules.length > 10_000) invalid();
  if (!Array.isArray(candidate.policy.rules) && !object(candidate.policy.streets)) invalid();
  // Verify the exact saved object before exposing any range tied to this version.
  if (await digestText(JSON.stringify(candidate.policy)) !== expectedHash) invalid();
  return { policyHash: expectedHash, sourceHash: metadata.source_hash as string,
    flopPolicyHash: typeof candidate.metadata.flop_policy_hash === "string" ? candidate.metadata.flop_policy_hash : null,
    policy: candidate.policy };
}

function validatePackedView(base: FlopBase, value: unknown, key: string, spot: PublishedCatalog["spots"] extends Map<string, infer T> ? T : never): PackedView<number> {
  if (!Object.hasOwn(base.histories, key)) throw new McpDataError("not_found", "This exact flop action history is not saved or has already ended; no nearby history was substituted.");
  if (!object(value) || !object(value.view) || typeof value.view.node !== "string" || !FLOP_NODES.test(value.view.node)
    || !POSITIONS.has(value.view.seat as string) || !Array.isArray(value.view.actions) || value.view.actions.length < 2 || value.view.actions.length > 4
    || value.view.actions.some(action => typeof action !== "string" || !FLOP_ACTIONS.has(action))
    || new Set(value.view.actions).size !== value.view.actions.length || !Array.isArray(value.view.lengths) || value.view.lengths.length !== 169
    || value.view.lengths.some(length => !integer(length, 0, 12)) || !object(value.view.rows) || !object(value.view.combos)) invalid();
  const view = value.view as unknown as PackedView<number>;
  const expectedSeat = /^(?:btn|ip)_/.test(view.node) ? spot.context.ip : spot.context.oop;
  if (view.seat !== expectedSeat) invalid();
  const keyActions = key ? key.split(",") : [];
  if (keyActions.length > 20 || keyActions.some(action => !FLOP_ACTIONS.has(action))) invalid();
  let state;
  try { state = flopState(spot.context.tree, keyActions); } catch { return invalid(); }
  if ("end" in state || state.node !== view.node || state.role !== (view.seat === spot.context.ip ? "ip" : "oop")
    || JSON.stringify(NODES[view.node]) !== JSON.stringify(view.actions)) invalid();
  if (!integer(view.rows.count, 169, 169) || !integer(view.combos.count, 0, 1_176)
    || view.lengths.reduce((sum, length) => sum + length, 0) !== view.combos.count
    || !Array.isArray(view.rows.columns) || !Array.isArray(view.combos.columns) || !Array.isArray(base.columns)) invalid();
  for (const frame of [view.rows, view.combos]) {
    if (!Array.isArray(frame.schema) || frame.columns.length > MAX_FLOP_COLUMNS
      || frame.columns.some(index => !integer(index, 0, base.columns!.length - 1))) invalid();
  }
  return view;
}

function validateRows(view: ReturnType<typeof unpackView>, boardCards: readonly number[]) {
  if (view.rows.length !== 169) invalid();
  const seen = new Set<string>();
  return view.rows.map(row => {
    if (!HAND_SET.has(row.hand) || seen.has(row.hand) || typeof row.reachable !== "boolean" || !integer(row.comboCount, 0, 12)
      || !finite(row.reachWeight, 0, 1_000_000) || !Array.isArray(row.combos) || row.combos.length !== row.comboCount
      || !object(row.mix) || !object(row.tiers)) invalid();
    seen.add(row.hand);
    const actionKeys = Object.keys(row.mix);
    if (actionKeys.length !== view.actions.length || actionKeys.some(action => !view.actions.includes(action))
      || actionKeys.some(action => !finite(row.mix[action], 0, 1))
      || view.actions.some(action => !finite(row.mix[action], 0, 1))
      || Math.abs(Object.values(row.mix).reduce((sum, value) => sum + value, 0) - (row.reachable ? 1 : 0)) > 1e-7
      || !TIERS.has(String(row.tier ?? "air")) || row.reachWeight > 0 && !row.reachable
      || row.reachable !== (row.comboCount > 0)) invalid();
    const combos = row.combos.map(combo => {
      if (!requiredString(combo.cards, 4) || combo.cards.length !== 4 || !/^(?:[2-9TJQKA][cdhs]){2}$/.test(combo.cards)
        || combo.cards.slice(0, 2) === combo.cards.slice(2, 4) || !TIERS.has(combo.tier)
        || !finite(combo.weight, 0, 1_000_000) || !finite(combo.reachWeight, 0, 1_000_000) || !object(combo.mix)) invalid();
      const ids = combo.cards.match(/../g)!;
      if (new Set(ids).size !== 2 || ids.some(card => {
        const rank = "23456789TJQKA".indexOf(card[0]), suit = "cdhs".indexOf(card[1]);
        return boardCards.includes(rank * 4 + suit);
      })) invalid();
      if (Object.keys(combo.mix).length !== view.actions.length || view.actions.some(action => !finite(combo.mix[action], 0, 1))) invalid();
      if (Math.abs(Object.values(combo.mix).reduce((sum, value) => sum + value, 0) - 1) > 1e-7) invalid();
      return combo;
    });
    const summedReach = combos.reduce((sum, combo) => sum + (combo.reachWeight as number), 0);
    if (Math.abs(summedReach - row.reachWeight) > 1e-7) invalid();
    return { ...row, combos };
  });
}

function projectedFrequencies(combos: readonly { reachWeight: number; mix: Record<string, number> }[], actions: readonly string[]) {
  const total = combos.reduce((sum, combo) => sum + combo.reachWeight, 0);
  if (!total) return null;
  return Object.fromEntries(actions.map(action => [action,
    combos.reduce((sum, combo) => sum + combo.reachWeight * combo.mix[action], 0) / total]));
}

function outputSize(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_RESPONSE_BYTES) {
    throw new McpDataError("data_unavailable", "This saved range exceeds the bounded response size.");
  }
}

export async function listPostflopCoverage(db: ReadOnlyDatabase | undefined, input: BoundedInput = {}) {
  const catalog = await loadCatalog(db);
  if (!catalog.release) return { kind: KIND, notice: NOTICE, publicationStatus: "not_published", total: 0, spots: [], nextOffset: null };
  const limit = bounded(input.limit, 20, 1, 50);
  if (input.spotId === undefined) {
    if (input.flop !== undefined) throw new McpDataError("invalid_argument", "A spotId is required when listing saved flop boards or histories.");
    const offset = bounded(input.offset, 0, 0, MAX_SPOTS);
    const entries = [...catalog.spots.values()].sort((a, b) => a.context.id.localeCompare(b.context.id));
    const spots = entries.slice(offset, offset + limit).map(entry => {
      const boardCount = catalog.baseCounts[entry.context.id] ?? 0;
      return { ...entry.context, published: true,
        policies: { flop: { status: "published", contentHash: entry.hashes.flop }, turnRiver: {
          status: entry.hashes.later ? "policy_published_range_not_materialized" : "not_published", contentHash: entry.hashes.later,
        } },
        policyNodeEvaluation: policyEvaluationAvailability(entry.data),
        savedFlopCoverage: { status: boardCount ? "saved_boards_available" : "no_saved_boards", boardClasses: boardCount,
          totalCanonicalFlopClasses: CANONICAL_FLOPS, lookupSupported: boardCount > 0 },
      };
    });
    const result = { kind: KIND, notice: NOTICE, publicationStatus: "published", source: { dataset: "postflop", contentHash: catalog.release.content_hash,
      publishedAt: catalog.release.published_at, flopBaseContentHash: catalog.baseRelease?.content_hash ?? null,
      flopBasePublishedAt: catalog.baseRelease?.published_at ?? null }, total: entries.length, spots,
      nextOffset: offset + limit < entries.length ? offset + limit : null };
    outputSize(result); return result;
  }

  const spot = selectedSpot(catalog, input.spotId);
  const total = catalog.baseCounts[spot.context.id] ?? 0;
  const offsetMax = input.flop === undefined ? CANONICAL_FLOPS : MAX_HISTORIES;
  const offset = bounded(input.offset, 0, 0, offsetMax);
  if (input.flop === undefined) {
    if (!total || !catalog.baseRelease) return { kind: KIND, notice: NOTICE, spotId: spot.context.id, publicationStatus: "no_saved_flop_bases", total: 0, boards: [], nextOffset: null };
    const remaining = Math.max(0, total - offset);
    const requested = Math.min(limit + 1, Math.max(1, remaining));
    const rows = await query<{ flop_key: string; content_hash: string }>(db,
      "SELECT flop_key, content_hash FROM postflop_flop_base_br WHERE spot_id = ? AND part = 0 ORDER BY flop_key LIMIT ? OFFSET ?",
      spot.context.id, requested, offset);
    const expectedRows = Math.min(limit + 1, remaining);
    if (rows.length !== expectedRows || rows.some(row => !requiredString(row.flop_key, 6) || !/^(?:[2-9TJQKA][cdhs]){3}$/.test(row.flop_key)
      || canonicalBoard(row.flop_key).key !== row.flop_key || !SHA256.test(row.content_hash))) invalid();
    const pageRows = rows.slice(0, limit);
    const boards = pageRows.map(row => ({ flop: row.flop_key, status: "saved", contentHash: row.content_hash }));
    const result = { kind: KIND, notice: NOTICE, spotId: spot.context.id, source: { dataset: "postflop_flop_base_br",
      publishedContentHash: catalog.baseRelease!.content_hash, publishedAt: catalog.baseRelease!.published_at }, total, boards,
      nextOffset: rows.length > limit ? offset + limit : null };
    outputSize(result); return result;
  }

  const requested = await loadSavedBase(db, catalog, spot.context.id, input.flop);
  const historyEntries = Object.entries(requested.base.histories).map(([key, value]) => {
    if (key.length > 200 || key && key.split(",").some(action => !FLOP_ACTIONS.has(action))) invalid();
    const view = validatePackedView(requested.base, value, key, requested.spot);
    const history = key ? key.split(",") : [];
    return { history, historyKey: key, node: view.node, seat: view.seat, actions: [...view.actions] };
  }).sort((a, b) => a.historyKey.localeCompare(b.historyKey));
  const totalHistories = historyEntries.length;
  const histories = historyEntries.slice(offset, offset + limit);
  const result = { kind: KIND, notice: NOTICE, spot: requested.spot.context, flop: input.flop, canonicalFlop: requested.canonical.key,
    source: requested.source, street: "flop", total: totalHistories, histories,
    nextOffset: offset + histories.length < totalHistories ? offset + histories.length : null };
  outputSize(result); return result;
}

export interface EvaluatePostflopPolicyInput { spotId: string; flop: string; history?: string[] }
export async function evaluatePublishedPostflopPolicy(db: ReadOnlyDatabase | undefined, input: EvaluatePostflopPolicyInput) {
  if (!object(input) || !IDENTIFIER.test(input.spotId) || typeof input.flop !== "string") {
    throw new McpDataError("invalid_argument", "Use an exact published spot ID and a three-card flop.");
  }
  const history = historyKey(input.history);
  const published = await loadPublishedSpot(db, input.spotId);
  const { release, spot } = published;
  const sourceRequirements = evaluationSourceSelections(spot.data);
  const sourceNames = Object.keys(sourceRequirements);
  const sourceDatasets = await loadPublishedPostflopSourceDatasets(db, sourceRequirements);
  let inputs: PostflopInputs;
  try { inputs = buildInputs(input.spotId, sourceDatasets); } catch { return invalid(); }
  // The published spot is the authority. A changed local descriptor or source geometry
  // must not be silently substituted just because the same identifier still exists.
  if (JSON.stringify(inputs.spot) !== JSON.stringify(spot.data) || inputs.spot.reachable !== true) invalid();

  const policyRows = await query<{ metadata_json: string; policy_json: string; policy_hash: string }>(db,
    "SELECT metadata_json, policy_json, policy_hash FROM postflop_policies WHERE spot_id = ? AND stage = ? LIMIT 2", input.spotId, "flop");
  if (policyRows.length !== 1) invalid();
  const saved = await parsePolicy(policyRows[0], spot.hashes.flop);
  let policy: FlopPolicy;
  try { policy = validatePolicy(saved.policy, inputs.spot.tree); } catch { return invalid(); }
  if (saved.sourceHash !== inputs.fingerprint) invalid();

  const canonical = canonicalBoard(input.flop);
  let parsed: ReturnType<typeof parseFlopBoard>;
  try { parsed = parseFlopBoard(input.flop); } catch { throw new McpDataError("invalid_argument", "Enter exactly three distinct cards, such as As7d2c."); }
  let state;
  try { state = flopState(inputs.spot.tree, history); } catch { throw new McpDataError("not_found", "This exact flop action history does not reach a published decision."); }
  if ("end" in state) throw new McpDataError("not_found", "This flop action history has ended; no later node was substituted.");

  // Every node on the requested path needs a complete saved `any` rule for each tier.
  // This prevents the shared defence replay or the target node from falling back to its
  // fixed reference mix on a re-raise added after the published policy was authored.
  for (let length = 0; length <= history.length; length++) {
    let ancestor;
    try { ancestor = flopState(inputs.spot.tree, history.slice(0, length)); }
    catch { throw new McpDataError("not_found", "This exact flop action history does not reach a published decision."); }
    if ("end" in ancestor) throw new McpDataError("not_found", "This flop action history has ended; no later node was substituted.");
    try { assertPolicyNodeComplete(policy, ancestor.node); }
    catch { throw new McpDataError("not_found", "The published policy has no complete saved rules for this exact node path; no reference mix was substituted."); }
  }

  let evaluated: EvaluatedFlopNode;
  try {
    evaluated = flopNodeCanonical(inputs, policy, canonical.cards, state.node, history,
      { includeCombos: false, requireSavedRules: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unreachable flop history")) {
      throw new McpDataError("not_found", "The saved ranges do not reach this exact flop decision; no substitute node was evaluated.");
    }
    return invalid();
  }
  if (evaluated.rows.length !== 169 || !evaluated.rows.some(row => row.reachWeight > 0)) {
    throw new McpDataError("not_found", "The saved ranges do not reach this exact flop decision; no substitute node was evaluated.");
  }
  const expectedSeat = state.role === "ip" ? inputs.spot.ip : inputs.spot.oop;
  if (evaluated.seat !== expectedSeat || JSON.stringify(evaluated.actions) !== JSON.stringify(NODES[state.node])) invalid();
  const datasets = sourceDatasets as Record<string, { contentHash: string }>;
  const handClasses = evaluated.rows.map(row => ({ hand: row.hand, reachable: row.reachable, comboCount: row.comboCount,
    frequencies: row.mix, tierWeights: row.tiers, reachWeight: row.reachWeight }));
  const result = {
    kind: KIND, notice: NOTICE, lookupMode: "published_flop_policy_evaluation", street: "flop",
    spot: spot.context, flop: parsed.id, canonicalFlop: canonical.key, history, node: state.node,
    actingSeat: evaluated.seat, actions: [...evaluated.actions], rangeStatus: "available", frequencyUnit: "fraction",
    handClassCount: handClasses.length, hands: handClasses,
    calculation: { method: "deterministic_shared_flop_estimate", savedBaseUsed: false, referenceFallbackUsed: false,
      defenceAdjustmentApplied: true, completeSavedRulesRequired: true, maxHandClasses: 169 },
    source: { postflop: { dataset: "postflop", contentHash: release.content_hash, publishedAt: release.published_at },
      policy: { contentHash: saved.policyHash, inputHash: saved.sourceHash },
      inputDatasets: Object.fromEntries(sourceNames.map(name => [name, datasets[name]?.contentHash ?? null])) },
  };
  outputSize(result);
  return result;
}

export interface SavedPostflopRangeInput { spotId: string; flop: string; history?: string[]; hand?: string }
export async function getSavedPostflopRange(db: ReadOnlyDatabase | undefined, input: SavedPostflopRangeInput) {
  if (!object(input) || input.hand !== undefined && !HAND_SET.has(input.hand)) {
    throw new McpDataError("invalid_argument", "Use a canonical hand such as AA, AKs or AKo.");
  }
  if (!IDENTIFIER.test(input.spotId) || typeof input.flop !== "string") {
    throw new McpDataError("invalid_argument", "Use an exact published spot ID and a three-card flop.");
  }
  const history = historyKey(input.history), key = history.join(",");
  const catalog = await loadCatalog(db);
  if (!catalog.release) spotNotFound();
  const loaded = await loadSavedBase(db, catalog, input.spotId, input.flop);
  const packed = validatePackedView(loaded.base, loaded.base.histories[key], key, loaded.spot);
  let view: CodecView;
  try { view = unpackView({ ...packed, rows: hydrateFrame(loaded.base, packed.rows), combos: hydrateFrame(loaded.base, packed.combos) }); }
  catch { return invalid(); }
  const rows = validateRows(view, loaded.canonical.cards);
  const actualView = remapFlopNode(view, loaded.canonical.fromCanonical);
  const projected = rows.map(row => {
    const exact = actualView.rows.find(item => item.hand === row.hand)!;
    const liveCombos = exact.combos.filter((combo): combo is typeof combo & { reachWeight: number } => combo.reachWeight !== undefined && combo.reachWeight > 0);
    const frequencies = projectedFrequencies(liveCombos, view.actions);
    const response: Record<string, unknown> = { hand: row.hand, reachable: frequencies !== null,
      boardRangeAvailable: row.reachable, comboCount: row.combos.length, reachedComboCount: liveCombos.length,
      rangeReachWeight: row.reachWeight, frequencies };
    if (input.hand) response.combos = liveCombos.map(combo => ({ cards: combo.cards, tier: combo.tier, reachWeight: combo.reachWeight, frequencies: combo.mix }));
    return response;
  }).filter(row => !input.hand || row.hand === input.hand);
  if (input.hand && !projected.length) throw new McpDataError("not_found", "This hand is not present in the saved hand-class range.");
  const totalReachWeight = rows.reduce((sum, row) => sum + row.reachWeight, 0);
  const result = { kind: KIND, notice: NOTICE, source: { dataset: "postflop_flop_base_br", ...loaded.source },
    spot: loaded.spot.context, street: "flop", flop: input.flop, canonicalFlop: loaded.canonical.key,
    history, node: view.node, actingSeat: view.seat, actions: [...view.actions],
    conditions: { potBb: loaded.spot.context.potBb, effectiveStackBb: loaded.spot.context.effectiveStackBb,
      inPosition: loaded.spot.context.ip, outOfPosition: loaded.spot.context.oop },
    rangeStatus: totalReachWeight > 0 ? "available" : "unreachable_after_saved_actions",
    frequencyUnit: "fraction" as const,
    frequencySemantics: "Exact saved combo mixes weighted by the published reach weights for this flop and prior action history; unreachable hands and combos have no frequency recommendation.",
    totalReachWeight, reasonStatus: "not_included", hands: projected };
  outputSize(result); return result;
}
