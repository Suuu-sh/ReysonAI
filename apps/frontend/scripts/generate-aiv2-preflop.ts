// LLM-backed, resumable AIv2 preflop generation. `--sample` is a single real
// scenario and writes only under .local; `--all` is quota-gated and publishes
// nothing until every base/profile scenario and derived reason passes audit.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AIV2_MODEL, AIV2_REASONING_EFFORT, AIV2_PREflop_METHOD, actionsForSpot, analyzeRange, compressConcretePolicy,
  concreteComboReachWeights, encodeComboReachWeights, expandConcretePolicy, rangePrompt, scenarioOnly,
  validateAiv2Policy, validateFinalReasons, validateRangeAnalysis } from "./aiv2-preflop.ts";
import { runCodex } from "./postflop-ai/generate.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const estimated = join(root, "src/estimated");
const local = join(root, `.local/aiv2-preflop/${AIV2_PREflop_METHOD}`);
const files = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses",
  "squeeze-responses", "limp-responses", "limp-deep-responses", "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses", "continuation-responses"];
const profiles = ["nit", "station", "lag", "maniac"];
const profileRoles = ["villain"];
const profileFiles = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "limp-responses", "limp-deep-responses"];
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Spot = Record<string, any>;

function read(path: string): any { return JSON.parse(readFileSync(path, "utf8")); }
function safeName(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function atomicJson(path: string, value: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value)}\n`, { flag: "wx" });
  renameSync(temp, path);
}
function getDataset(name: string) {
  const sourceName = name.startsWith("aiv2/profiles/") ? name.slice("aiv2/".length) : name;
  return read(join(estimated, `${sourceName}.json`));
}
function generatedPath(name: string, id: string, profile?: { profile: string; role: string }) {
  const prefix = profile ? join("profiles", profile.profile, profile.role) : "";
  return join(local, "generated", prefix, name, `${safeName(id)}.json`);
}
function getGenerated(name: string, id: string, profile?: { profile: string; role: string }) {
  const path = generatedPath(name, id, profile);
  return existsSync(path) ? read(path) : null;
}

type Ref = { dataset: string; spot_id: string; action: string; seat?: string };
function references(name: string, spot: Spot): Ref[] {
  if (Array.isArray(spot.source_factors)) return spot.source_factors.flatMap((factor: any) => factor);
  if (spot.source_factors && typeof spot.source_factors === "object") return Object.entries<any>(spot.source_factors).flatMap(([seat, factors]) =>
    (factors as any[]).map(factor => ({ ...factor, seat })));
  const refs: Ref[] = [];
  const add = (dataset: string, spot_id: string | undefined, action: string, seat?: string) => { if (spot_id) refs.push({ dataset, spot_id, action, seat }); };
  const opening = spot.source_opening_id ?? (spot.opener ? `${spot.opener}_open` : undefined);
  if (opening) add("opening-ranges", opening, "open", spot.opener ?? spot.hero);
  if (name === "preflop-ranges") return refs;
  if (name === "three-bet-responses") add("preflop-ranges", spot.source_response_id, "three_bet");
  if (name === "four-bet-responses") {
    add("preflop-ranges", spot.source_response_id, "three_bet");
    add("three-bet-responses", spot.source_three_bet_response_id, "four_bet");
  }
  if (name === "five-bet-responses") add("four-bet-responses", spot.source_four_bet_response_id, "all_in");
  if (name === "multiway-responses") {
    const callers: string[] = spot.callers ?? [];
    let prior: string[] = [];
    callers.forEach((seat, index) => {
      const id = index === 0 ? `${seat}_vs_${spot.opener}` : `${seat}_vs_${spot.opener}_${prior.join("")}call`;
      add(index === 0 ? "preflop-ranges" : "multiway-responses", id, "call", seat);
      prior = [...prior, seat];
    });
  }
  if (name === "squeeze-responses") add("multiway-responses", spot.source_squeeze_id, "squeeze");
  if (name === "limp-responses") add("opening-ranges", spot.source_opening_id, "limp", "SB");
  if (name === "limp-deep-responses") {
    add("opening-ranges", spot.source_opening_id, "limp", "SB");
    add("limp-responses", spot.source_limp_response_id, "call", "BB");
    add("limp-deep-responses", spot.source_iso_response_id, "raise", "BB");
    add("limp-deep-responses", spot.source_limp_reraise_response_id, "four_bet", "SB");
  }
  if (name === "cold-three-bet-responses") add("preflop-ranges", spot.source_response_id, "three_bet");
  if (name === "multiway2-responses") {
    const callerIds: string[] = spot.source_caller_ids ?? [];
    callerIds.forEach((id, index) => add(index === 0 ? "preflop-ranges" : "multiway-responses", id, "call"));
  }
  if (name === "cold-four-bet-responses") {
    add("preflop-ranges", spot.source_response_id, "three_bet");
    add("cold-three-bet-responses", spot.source_cold_three_bet_id, "four_bet");
  }
  // Continuation records carry their complete action history in source_factors.
  if (name === "continuation-responses") return refs;
  return refs;
}

function scenarioContext(name: string, spot: Spot, profile?: { profile: string; role: string }) {
  const refs = references(name, spot);
  const contexts: any[] = [];
  const factorsBySeat = new Map<string, Array<{ action: string; frequenciesByHand: Record<string, number>; frequenciesByCombo?: Record<string, number> }>>();
  for (const ref of refs) {
    const prior = getGenerated(ref.dataset, ref.spot_id, profile);
    if (!prior) throw new Error(`Missing AIv2 prerequisite ${ref.dataset}/${ref.spot_id}; refusing legacy-AI fallback`);
    const sourceRows = prior.spot.hands as Array<Record<string, any>>;
    const frequenciesByHand = Object.fromEntries(sourceRows.map(row => [row.hand, row[ref.action]]));
    if (Object.values(frequenciesByHand).some(value => !Number.isFinite(value))) throw new Error(`Missing action ${ref.action} in generated prerequisite ${ref.dataset}/${ref.spot_id}`);
    const frequenciesByCombo = prior.spot.combo_mixes
      ? Object.fromEntries((prior.spot.combo_mixes as Array<any>).map(row => [row.combo, row.mix?.[ref.action]])) : undefined;
    const seat = ref.seat ?? prior.spot.hero;
    const factors = factorsBySeat.get(seat) ?? [];
    factors.push({ action: ref.action, frequenciesByHand, frequenciesByCombo }); factorsBySeat.set(seat, factors);
    contexts.push({ seat, dataset: ref.dataset, spot_id: ref.spot_id, action: ref.action,
      action_mixes: sourceRows.map(row => ({ hand: row.hand, frequency: row[ref.action] })),
      combo_overrides: prior.spot.combo_mixes?.filter((row: any) => {
        const base = sourceRows.find(sourceRow => sourceRow.hand === row.hand);
        return Number(row.mix?.[ref.action]) !== Number(base?.[ref.action]);
      }).map((row: any) => ({ combo: row.combo, frequency: row.mix[ref.action] })) ?? [],
      combo_reach_weights: prior.combo_reach_weights });
  }
  const reachWeightsBySeat: Record<string, Record<string, number>> = {};
  for (const [seat, factors] of factorsBySeat) reachWeightsBySeat[seat] = concreteComboReachWeights(factors);
  return { contexts, reachWeightsBySeat };
}

async function createSpot(name: string, spot: Spot, profile?: { profile: string; role: string }) {
  const actions = actionsForSpot(spot);
  if (spot.unreachable) {
    const placeholder = { ...spot, hands: (spot.hands as Array<Record<string, any>>).map(row => ({ ...row,
      ...Object.fromEntries(actions.map(action => [action, action === "fold" ? 100 : 0])) })), combo_mixes: [] };
    const output = { spot: placeholder, combo_reach_weights: { encoding: "none-unreachable", players: {} },
      metadata: { method: AIV2_PREflop_METHOD, status: "unreachable-placeholder", scenario_id: spot.id } };
    atomicJson(generatedPath(name, spot.id, profile), output);
    return output;
  }
  const { contexts, reachWeightsBySeat } = scenarioContext(name, spot, profile);
  const scenario = { ...scenarioOnly(spot), dataset: name, ...(profile ?? {}) };
  const inputHash = sha({ scenario, actions, contexts, method: AIV2_PREflop_METHOD, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT });
  const checkpoint = join(local, "checkpoints", profile ? "profiles" : "standard", profile?.profile ?? "", profile?.role ?? "", name, `${safeName(spot.id)}.json`);
  const stem = checkpoint.slice(0, -5);
  if (existsSync(checkpoint)) {
    const saved = read(checkpoint);
    if (saved.input_hash !== inputHash || saved.metadata?.method !== AIV2_PREflop_METHOD || saved.metadata?.model !== AIV2_MODEL)
      throw new Error(`Stale checkpoint identity for ${name}/${spot.id}; reset only that checkpoint explicitly before regeneration`);
    atomicJson(generatedPath(name, spot.id, profile), saved);
    return saved;
  }
  const identity = { input_hash: inputHash, method: AIV2_PREflop_METHOD, model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT };
  const phase = async <T>(suffix: string, run: () => Promise<T>, validate: (value: unknown) => T) => {
    const path = `${stem}.${suffix}.json`;
    if (existsSync(path)) {
      const saved = read(path);
      if (saved.input_hash !== inputHash || saved.method !== AIV2_PREflop_METHOD || saved.model !== AIV2_MODEL)
        throw new Error(`Stale ${suffix} checkpoint identity for ${name}/${spot.id}`);
      return validate(saved.result);
    }
    const result = validate(await run());
    atomicJson(path, { ...identity, result });
    return result;
  };
  const analysis = await phase("analysis", async () => (await analyzeRange({ scenario, actions, context: contexts })).analysis,
    raw => validateRangeAnalysis(raw, spot.id));
  const candidate = await phase("candidate", async () => {
    return runCodex(rangePrompt({ scenario, actions, context: contexts, analysis }), { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT });
  }, raw => validateAiv2Policy(raw, spot.id, actions));
  const firstPrompt = rangePrompt({ scenario, actions, context: contexts, analysis });
  const reviewPrompt = rangePrompt({ scenario, actions, context: contexts, analysis, phase: "reevaluate", candidate });
  const finalized = await phase("final-policy", async () => runCodex(reviewPrompt,
    { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT }), raw => validateAiv2Policy(raw, spot.id, actions));
  const provenance = { method: AIV2_PREflop_METHOD, model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT,
    prompt_hashes: [sha(firstPrompt), sha(reviewPrompt)], analysis_hash: sha(analysis), candidate_hash: sha(candidate), final_hash: sha(finalized),
    combo_exceptions: Object.keys(finalized.combo_overrides).sort() };
  const expanded = expandConcretePolicy(finalized, reachWeightsBySeat[spot.hero] ?? {});
  const classRows = compressConcretePolicy(expanded, actions);
  const rowTemplate = new Map((spot.hands as Array<Record<string, unknown>>).map(row => [String(row.hand), row]));
  const updatedHands = classRows.map(({ hand, mix }) => ({ ...rowTemplate.get(hand), ...mix }));
  if (updatedHands.length !== 169 || updatedHands.some(row => Object.keys(actions).length === 0 ||
      actions.reduce((sum, action) => sum + Number(row[action]), 0) !== 100)) throw new Error(`Class aggregation did not preserve 169 hand rows for ${name}/${spot.id}`);
  const comboReach = { compression: "exact-suit-symmetry-verified-per-player", players: Object.fromEntries(
    Object.entries(reachWeightsBySeat).map(([seat, weights]) => [seat, encodeComboReachWeights(weights)])) };
  const output = { spot: { ...spot, hands: updatedHands, combo_mixes: expanded }, combo_reach_weights: comboReach,
    metadata: { ...provenance, source_hash: inputHash, scenario_id: spot.id, decision_count: 169, concrete_combo_count: expanded.length } };
  atomicJson(checkpoint, output);
  atomicJson(generatedPath(name, spot.id, profile), output);
  return output;
}

function domainSummary() {
  let spots = 0, classes = 0;
  const rows = files.map(name => {
    const dataset = getDataset(name), count = dataset.spots.length;
    spots += count; classes += count * 169;
    return { dataset: name, spots: count, hand_classes: count * 169 };
  });
  let profileSpots = 0, profileUnreachable = 0;
  const profileRows = profiles.flatMap(profile => profileFiles.map(name => {
    const dataset = getDataset(`aiv2/profiles/${profile}/villain/${name}`), count = dataset.spots.length;
    profileSpots += count; profileUnreachable += dataset.spots.filter((spot: Spot) => spot.unreachable).length;
    return { profile, role: "villain", dataset: name, spots: count };
  }));
  const unreachable = rows.reduce((sum, row) => sum + getDataset(row.dataset).spots.filter((spot: Spot) => spot.unreachable).length, 0);
  return { game: "6-max cash, 100BB, no ante, rake 5% capped at 3BB", root: { datasets: files.length, spots, hand_classes: classes, unreachable_placeholders: unreachable,
      actionable_spots: spots - unreachable, concrete_combo_instances: (spots - unreachable) * 1326, breakdown: rows },
    profiles: { archetypes: profiles.length, roles: profileRoles.length, dataset_files: profiles.length * profileRoles.length * profileFiles.length,
      spots: profileSpots, hand_classes: profileSpots * 169, unreachable_placeholders: profileUnreachable,
      actionable_spots: profileSpots - profileUnreachable, concrete_combo_instances: (profileSpots - profileUnreachable) * 1326, breakdown: profileRows },
    output_passes: ["range generation", "range-wide strategic reevaluation", "post-final-frequency reason composition"],
    provider: { model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT, bridge: "authenticated local Codex app-server; no API key read or stored; model quota/network required" } };
}

async function sample(datasetName: string, scenarioId: string) {
  if (!files.includes(datasetName)) throw new Error(`Unsupported sample dataset: ${datasetName}`);
  const source = getDataset(datasetName), spot = source.spots.find((candidate: Spot) => candidate.id === scenarioId);
  if (!spot) throw new Error(`Scenario not found: ${datasetName}/${scenarioId}`);
  if (references(datasetName, spot).length) throw new Error("For a safe one-scenario quota sample, select a root spot with no generated prerequisites (e.g. opening-ranges UTG_open)");
  const before = Date.now();
  const generated = await createSpot(datasetName, spot);
  const afterStrategy = Date.now();
  // Reasons are deliberately composed only after final frequencies are saved.
  const comboExceptions = generated.metadata.combo_exceptions ?? [];
  const reasonPrompt = `Write honest per-hand explanations only AFTER this finalized AIv2 policy was generated and strategically reevaluated. This is an estimate, not GTO or solver output. Never alter frequencies. Return JSON {"scenario_id":${JSON.stringify(scenarioId)},"reasons":[{"hand":"AA","text":"...","text_ja":"..."},...169 canonical classes in this exact order: ${readDatasetHands().join(",")}],"combo_reasons":[{"combo":"AsKh","text":"...","text_ja":"..."},...one for each listed combo exception, in exact listed order]}. ` +
    `For every item, write text in natural English and text_ja as a faithful, natural Japanese translation of that same explanation. Preserve the exact action frequencies and strategic meaning in both languages; do not add new reasoning in translation. Explain hand-class decisions from the finalized frequencies; explain each combo exception and its card-specific reason using only finalized combo mixes and exact reach.\nScenario: ${JSON.stringify(scenarioOnly(spot))}\nAction order: ${JSON.stringify(actionsForSpot(spot))}\nFinal class frequencies: ${JSON.stringify(generated.spot.hands.map((row: any) => ({ hand: row.hand, mix: Object.fromEntries(actionsForSpot(spot).map(action => [action, row[action]])) })))}\nConcrete combo exceptions: ${JSON.stringify(generated.spot.combo_mixes.filter((row: any) => comboExceptions.includes(row.combo)))}\nReach weights (exact per combo or verified class symmetry): ${JSON.stringify(generated.combo_reach_weights)}`;
  const reasonCheckpoint = join(local, "checkpoints", "standard", datasetName, `${safeName(scenarioId)}.reasons.json`);
  const finalHash = generated.metadata.final_hash;
  const reasonPromptHash = sha(reasonPrompt);
  let reasons: any;
  if (existsSync(reasonCheckpoint)) {
    const saved = read(reasonCheckpoint);
    if (saved.input_hash !== generated.metadata.source_hash || saved.final_hash !== finalHash || saved.method !== AIV2_PREflop_METHOD || saved.model !== AIV2_MODEL)
      throw new Error(`Stale post-final reason checkpoint identity for ${datasetName}/${scenarioId}`);
    if (saved.reason_prompt_hash === reasonPromptHash) {
      try { reasons = validateFinalReasons(saved.result, scenarioId, comboExceptions); }
      catch { reasons = await runCodex(reasonPrompt, { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT }); }
    } else {
      // The prompt/schema changed (for example, from English-only to bilingual).
      // Refresh only explanations; keep the finalized strategy and its hash.
      reasons = await runCodex(reasonPrompt, { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT });
    }
  } else {
    reasons = await runCodex(reasonPrompt, { model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT });
  }
  reasons = validateFinalReasons(reasons, scenarioId, comboExceptions);
  const samplePath = join(local, "sample", datasetName, `${safeName(scenarioId)}.json`);
  const reasonHash = sha(reasons);
  atomicJson(reasonCheckpoint, {
    input_hash: generated.metadata.source_hash, final_hash: finalHash, method: AIV2_PREflop_METHOD, model: AIV2_MODEL,
    reason_prompt_hash: reasonPromptHash, result: reasons, result_hash: reasonHash });
  atomicJson(samplePath, { ...generated, reasons, metadata: { ...generated.metadata, publication_status: "local-experimental-single-spot-not-selectable",
    reason_generated_after_finalization: true,
    reason_hash: reasonHash, total_elapsed_ms: Date.now() - before,
    strategy_elapsed_ms: afterStrategy - before, reason_elapsed_ms: Date.now() - afterStrategy } });
  console.log(JSON.stringify({ sample_path: samplePath, scenario_id: scenarioId, method: AIV2_PREflop_METHOD, model: AIV2_MODEL,
    action_classes: generated.spot.hands.length, concrete_combos: generated.spot.combo_mixes.length, reasons: reasons.reasons.length,
    selected: generated.spot.hands.find((row: any) => row.hand === "AA"), duration_ms: { total: Date.now() - before, strategy: afterStrategy - before, reasons: Date.now() - afterStrategy } }, null, 2));
}

function readDatasetHands(): string[] { return getDataset("opening-ranges").spots[0].hands.map((row: any) => row.hand); }

async function fullGeneration() {
  const summary = domainSummary();
  console.log(JSON.stringify(summary, null, 2));
  if (!process.argv.includes("--confirm-full-quota")) throw new Error("Stopped before provider calls: get user approval for the estimated full-range quota, then rerun with --confirm-full-quota");
  throw new Error("Full generation is not enabled yet: the all-dataset/profile reason audit and atomic publication path are incomplete. No provider calls were made; use --sample only until that path is implemented and reviewed.");
}

async function main(argv: string[]) {
  if (argv.includes("--domain")) { console.log(JSON.stringify(domainSummary(), null, 2)); return; }
  if (argv.includes("--sample")) {
    const index = argv.indexOf("--sample");
    await sample(argv[index + 1] ?? "opening-ranges", argv[index + 2] ?? "UTG_open");
    return;
  }
  if (argv.includes("--all")) { await fullGeneration(); return; }
  throw new Error("Usage: node scripts/generate-aiv2-preflop.ts --domain | --sample opening-ranges UTG_open | --all --confirm-full-quota");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
