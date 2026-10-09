import type { FrequencyRow, InputOptions, Inputs, RangeFactor, SourceAction, SourceDataset, SourceHand, SourceSpot } from "./types.ts";
import type { OpeningSpot, ResponseDataset } from "../../src/estimated/preflop-types.ts";
import type { TableAdjustments } from "../../src/estimated/table-profile.ts";
import { adjustOpeningSpot, applyTableProfile, isDefaultProfile, normalizeProfile } from "../../src/estimated/table-profile.ts";
import openingAdjustments from "../../src/estimated/table-profile-adjustments.json" with { type: "json" };

type ReadDataset = (name: string) => SourceDataset | null | undefined;
type BaseInputs = Omit<Inputs, "structure_hash">;
type Hash = (value: unknown) => string;
const PROFILES = ["standard", "nit", "station", "lag", "maniac"];

export function normalizedInputOptions(options: InputOptions = {}) {
  const tableProfile = normalizeProfile(options.tableProfile);
  const opponentProfile = options.opponentProfile ?? "standard";
  if (!PROFILES.includes(opponentProfile)) throw new Error(`Unknown opponent profile: ${opponentProfile}`);
  if (options.opponentSeat !== undefined && options.opponentSeat !== "ip" && options.opponentSeat !== "oop") {
    throw new Error("opponentSeat must be ip or oop");
  }
  if (opponentProfile !== "standard" && !options.opponentSeat) throw new Error("An opponent profile requires opponentSeat (ip or oop)");
  return { tableProfile, opponentProfile, opponentSeat: options.opponentSeat };
}

export function adjustedInputOptions(options: InputOptions = {}) {
  const normalized = normalizedInputOptions(options);
  return normalized.opponentProfile !== "standard" || !isDefaultProfile(normalized.tableProfile);
}

// The registry's reach probabilities and source-range factors are not geometry.
// All action history, contributions, sizes, seats, tree, pot and stacks remain pinned.
export function inputStructureHash(inputs: Pick<BaseInputs, "spot">, gameConfig: unknown, flopConfig: unknown, sha: Hash) {
  const { reachable: _reachable, ...geometry } = inputs.spot;
  const structural = Object.fromEntries(Object.entries(geometry).filter(([key]) => !["reach", "ranges"].includes(key)));
  return sha({ spot: structural, gameConfig, config: flopConfig });
}

function rangeFactors(spot: Inputs["spot"]): Record<string, readonly RangeFactor[]> {
  if (spot.ranges) return spot.ranges;
  if (spot.history || !["srp", "3bp", "4bp"].includes(spot.kind)) {
    throw new Error(`${spot.id}: missing saved history range factors for ${spot.kind}`);
  }
  const requiredId = (id: string | undefined, field: string): string => {
    if (!id) throw new Error(`${spot.id}: missing source identifier ${field}`);
    return id;
  };
  const open: RangeFactor = ["opening-ranges", spot.openingId, "open"];
  if (spot.kind === "srp") return { [spot.opener]: [open], [spot.caller]: [["preflop-ranges", spot.responseId, "call"]] };
  if (spot.kind === "4bp") {
    const threeBettor = requiredId(spot.threeBettor, "threeBettor");
    return {
      [spot.opener]: [open, ["three-bet-responses", requiredId(spot.fourBetId, "fourBetId"), "four_bet"]],
      [threeBettor]: [["preflop-ranges", requiredId(spot.threeBetId, "threeBetId"), "three_bet"], ["four-bet-responses", spot.responseId, "call"]],
    };
  }
  if (spot.kind === "3bp") {
    const threeBettor = requiredId(spot.threeBettor, "threeBettor");
    return {
      [spot.opener]: [open, ["three-bet-responses", spot.responseId, "call"]],
      [threeBettor]: [["preflop-ranges", requiredId(spot.threeBetId, "threeBetId"), "three_bet"]],
    };
  }
  throw new Error(`${spot.id}: unsupported HU range-factor kind ${spot.kind}`);
}

function sourceGeometry(source: SourceSpot) {
  return Object.fromEntries(Object.entries(source).filter(([key]) =>
    ["id", "hero", "opener", "opponent", "three_bettor", "caller", "contributions_bb", "action_sizes_bb"].includes(key) ||
    /(?:size|stack|pot|raise_to)_bb$/.test(key) || key.startsWith("source_")));
}

function validateSource(source: SourceSpot | undefined, baseline: SourceSpot, label: string) {
  if (!source || !Array.isArray(source.hands) || source.hands.length !== baseline.hands.length ||
      new Set(source.hands.map(row => row.hand)).size !== baseline.hands.length ||
      baseline.hands.some(row => !source.hands.some(next => next.hand === row.hand))) throw new Error(`${label}: missing or malformed profile source`);
  // Key order in independently authored JSON is not significant.
  const actual = sourceGeometry(source), expected = sourceGeometry(baseline);
  if (Object.keys(expected).some(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) ||
      Object.keys(actual).some(key => !(key in expected))) throw new Error(`${label}: source geometry changed`);
}

const ACTION_SIZE_FIELDS: Partial<Record<SourceAction, string>> = {
  open: "open_size_bb", three_bet: "three_bet_size_bb", four_bet: "four_bet_size_bb",
  limp: "limp_size_bb", raise: "raise_size_bb", squeeze: "squeeze_size_bb", all_in: "all_in_size_bb",
};

function validateActionSize(row: SourceHand, action: SourceAction, baseline: SourceSpot, label: string) {
  const field = ACTION_SIZE_FIELDS[action];
  if (!field || row[action] <= 0) return;
  const saved = baseline as unknown as Record<string, unknown>;
  // Continuation sources store raise totals in one shared row field, unlike
  // ordinary sources' action-specific fields. Read geometry from the original
  // saved source, never from the substituted profile's row.
  const actionSizes = saved.action_sizes_bb as Partial<Record<SourceAction, number | null>> | undefined;
  const rowField = actionSizes ? "raise_to_size_bb" : field;
  const expected = actionSizes ? actionSizes[action]
    : action === "limp" ? 1 : action === "raise" ? saved.raise_to_bb ?? saved.raise_size_bb : saved[field];
  const actual = (row as unknown as Record<string, unknown>)[rowField];
  if (typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0 || actual !== expected) {
    throw new Error(`${label}: source action size changed ${row.hand}/${action} (missing or mismatched ${rowField})`);
  }
}

function profileUnsupported(message: string): Error & { code: string; state: string } {
  return Object.assign(new Error(message), { code: "PROFILE_POLICY_MISSING", state: "not_generated" });
}

export function finalizeInputs(base: BaseInputs, options: InputOptions, read: ReadDataset, sha: Hash, structure_hash: string): Inputs {
  const normalized = normalizedInputOptions(options);
  if (!adjustedInputOptions(options)) return { ...base, structure_hash };
  // The HU adjustment contract selects exactly two roles. Never collapse the
  // separately reviewed three-player engine into these two-seat ranges.
  const geometry = base.spot as unknown as { kind: string; seats?: readonly string[] };
  if (geometry.kind === "mw3_srp" || (geometry.seats?.length ?? 0) > 2) {
    throw new Error(`${base.spot.id}: MW3 table/opponent range adjustments are not supported`);
  }
  const { spot } = base;
  const opponent = normalized.opponentSeat ? spot[normalized.opponentSeat] : undefined;
  const factors = rangeFactors(spot);
  const usedSources: { seat: string; dataset: string; spot: SourceSpot }[] = [];
  const profileSources: { seat: string; dataset: string; spot: SourceSpot }[] = [];
  const seatRows: Record<string, FrequencyRow[]> = {};
  const profileSeatRows: Record<string, FrequencyRow[]> = {};
  for (const seat of [spot.oop, spot.ip]) {
    const maps = factors[seat].map(([file, id, action]) => {
      const baseline = read(file)?.spots.find(item => item.id === id);
      if (!baseline) throw new Error(`${spot.id}: missing source ${file}/${id}`);
      const villain = normalized.opponentProfile !== "standard" && seat === opponent;
      const dataset = villain ? `profiles/${normalized.opponentProfile}/villain/${file}` : file;
      let selected: SourceSpot | undefined = baseline;
      if (villain) {
        // A profile without this history's preflop source cannot reach the flop: same
        // preparing state as an ungenerated profile policy, never a substituted range.
        try { selected = read(dataset)?.spots.find(item => item.id === id); } catch { selected = undefined; }
        if (!selected) throw profileUnsupported(`${spot.id}/${seat}/${dataset}/${id}: missing profile source (profile preflop source is not generated)`);
      }
      validateSource(selected, baseline, `${spot.id}/${seat}/${dataset}/${id}`);
      const profileSelected = selected;
      if (!villain && !isDefaultProfile(normalized.tableProfile)) {
        selected = file === "opening-ranges"
          ? adjustOpeningSpot(selected as unknown as OpeningSpot, openingAdjustments as unknown as TableAdjustments, normalized.tableProfile) as unknown as SourceSpot
          : applyTableProfile({ spots: [selected] } as unknown as ResponseDataset, normalized.tableProfile).spots[0] as unknown as SourceSpot;
      }
      usedSources.push({ seat, dataset, spot: selected! });
      profileSources.push({ seat, dataset: villain ? dataset : file, spot: profileSelected! });
      const rows = new Map(selected!.hands.map(row => [row.hand, row]));
      const profileRows = new Map(profileSelected!.hands.map(row => [row.hand, row]));
      return { action, rows, profileRows, hands: baseline.hands, baseline };
    });
    seatRows[seat] = maps[0].hands.map(({ hand }) => ({ hand, freq: maps.reduce((reach, { action, rows, baseline }) => {
      const row = rows.get(hand), frequency = row?.[action];
      if (!Number.isFinite(frequency) || frequency! < 0 || frequency! > 100) throw new Error(`${spot.id}: invalid saved action ${hand}/${action}`);
      // Missing sizing is invalid too, including profile-only positive hands.
      validateActionSize(row!, action, baseline, spot.id);
      return reach * frequency! / 100;
    }, 100) }));
    profileSeatRows[seat] = maps[0].hands.map(({ hand }) => ({ hand, freq: maps.reduce((reach, { action, profileRows, baseline }) => {
      const row = profileRows.get(hand), frequency = row?.[action];
      if (!Number.isFinite(frequency) || frequency! < 0 || frequency! > 100) throw new Error(`${spot.id}: invalid saved profile action ${hand}/${action}`);
      validateActionSize(row!, action, baseline, spot.id);
      return reach * frequency! / 100;
    }, 100) }));
    if (!seatRows[seat].some(row => row.freq > 0)) {
      const message = `${spot.id}: ${seat} saved history is unreachable after range adjustment`;
      throw normalized.opponentProfile !== "standard" ? profileUnsupported(message) : new Error(message);
    }
  }
  const adjusted = { tableProfile: normalized.tableProfile, opponentProfile: normalized.opponentProfile };
  const profileSourceHash = sha({ baseline: base.fingerprint,
    options: { ...normalized, tableProfile: normalizeProfile() }, sources: profileSources, seatRows: profileSeatRows });
  return { ...base, structure_hash, profileSourceHash, seatRows, adjusted, ...normalized,
    ...(spot.reachable && Object.values(base.seatRows).every(rows => rows.some(row => row.freq > 0)) ? { baselineFingerprint: base.fingerprint } : {}),
    fingerprint: sha({ baseline: base.fingerprint, options: normalized, sources: usedSources, seatRows }) };
}
