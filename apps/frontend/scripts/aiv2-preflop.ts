// Range-wide AIv2 preflop generation primitives. This module deliberately keeps
// generated candidates local until a complete, audited manifest is written.
import { createHash } from "node:crypto";
import { hands } from "../src/data.ts";
import { runCodex } from "./postflop-ai/generate.ts";

export const AIV2_PREflop_METHOD = "llm-range-wide-combo-v3";
export const AIV2_MODEL = "gpt-6-sol";
export const AIV2_REASONING_EFFORT = "high";
const SUITS = ["s", "h", "d", "c"] as const;
const RANKS = "AKQJT98765432";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export type Aiv2Mix = Record<string, number>;
export type Aiv2ComboMix = { combo: string; hand: string; mix: Aiv2Mix; reach_weight: number };

function comboHand(a: string, b: string): string {
  const ai = RANKS.indexOf(a[0]), bi = RANKS.indexOf(b[0]);
  const high = ai <= bi ? a[0] : b[0], low = ai <= bi ? b[0] : a[0];
  if (high === low) return high + low;
  return high + low + (a[1] === b[1] ? "s" : "o");
}

export const CONCRETE_COMBOS: readonly { combo: string; hand: string }[] = Object.freeze((() => {
  const cards = [...RANKS].flatMap(rank => SUITS.map(suit => `${rank}${suit}`));
  const out: { combo: string; hand: string }[] = [];
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++)
    out.push({ combo: cards[i] + cards[j], hand: comboHand(cards[i], cards[j]) });
  return out;
})());

export function concreteComboReachWeights(factors: Array<{ action: string; frequenciesByHand: Record<string, number>; frequenciesByCombo?: Record<string, number> }> = []): Record<string, number> {
  return Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo,
    factors.reduce((weight, factor) => {
      const frequency = factor.frequenciesByCombo?.[combo] ?? factor.frequenciesByHand[hand];
      if (!Number.isFinite(frequency) || frequency < 0 || frequency > 100) throw new Error(`Invalid prior reach frequency for ${hand}`);
      return weight * frequency / 100;
    }, 1),
  ]));
}

// Compress to hand classes only after proving that every physical combo in a
// class has the exact same reach weight. Future blocker-specific inputs remain
// fully combo-addressable and are never silently averaged.
export function encodeComboReachWeights(weightsByCombo: Record<string, number>) {
  const groups = new Map<string, number[]>();
  for (const { combo, hand } of CONCRETE_COMBOS) {
    const weight = weightsByCombo[combo];
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`Invalid concrete reach weight for ${combo}`);
    groups.set(hand, [...(groups.get(hand) ?? []), weight]);
  }
  const weightsByHand: Record<string, number> = {};
  let symmetric = true;
  for (const [hand, weights] of groups) {
    if (weights.some(weight => weight !== weights[0])) symmetric = false;
    weightsByHand[hand] = weights[0];
  }
  return symmetric ? { encoding: "hand-class-exact-suit-symmetry", weights: weightsByHand }
    : { encoding: "concrete-combo-exact", weights: weightsByCombo };
}

function normalizedMix(value: unknown, actions: string[], label: string): Aiv2Mix {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: mix must be an object`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== actions.length || actions.some(action => !Object.hasOwn(row, action))) throw new Error(`${label}: legal action columns do not match`);
  const values = actions.map(action => row[action]);
  if (values.some(value => !Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) ||
      values.reduce<number>((sum, value) => sum + (value as number), 0) !== 100) throw new Error(`${label}: integer frequencies must sum to 100`);
  return Object.fromEntries(actions.map((action, index) => [action, values[index] as number]));
}

export function validateAiv2Policy(raw: unknown, scenarioId: string, actions: string[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AIv2 response must be an object");
  const policy = raw as Record<string, unknown>;
  if (policy.kind !== "aiv2_preflop_combo_policy" || policy.scenario_id !== scenarioId ||
      !Array.isArray(policy.class_mixes) || policy.class_mixes.length !== hands.length) throw new Error("AIv2 response has wrong policy identity or incomplete hand classes");
  const classMixes: Record<string, Aiv2Mix> = {};
  for (let i = 0; i < hands.length; i++) {
    const row = policy.class_mixes[i] as Record<string, unknown>;
    if (row?.hand !== hands[i]) throw new Error(`AIv2 class order mismatch at ${i}`);
    classMixes[hands[i]] = normalizedMix(row.mix, actions, `${scenarioId}/${hands[i]}`);
  }
  const overrides: Record<string, Aiv2Mix> = {};
  if (!Array.isArray(policy.combo_overrides)) throw new Error("AIv2 response must include combo_overrides array");
  for (const item of policy.combo_overrides as Array<Record<string, unknown>>) {
    const combo = item?.combo;
    if (typeof combo !== "string" || !CONCRETE_COMBOS.some(candidate => candidate.combo === combo) || overrides[combo]) throw new Error("AIv2 response contains an invalid or duplicate combo override");
    overrides[combo] = normalizedMix(item.mix, actions, `${scenarioId}/${combo}`);
  }
  return { kind: "aiv2_preflop_combo_policy" as const, scenario_id: scenarioId, actions: [...actions], class_mixes: classMixes, combo_overrides: overrides };
}

export function expandConcretePolicy(policy: ReturnType<typeof validateAiv2Policy>, reachWeights: Record<string, number> = {}) : Aiv2ComboMix[] {
  return CONCRETE_COMBOS.map(({ combo, hand }) => ({
    combo, hand,
    mix: policy.combo_overrides[combo] ?? policy.class_mixes[hand],
    reach_weight: reachWeights[combo] ?? 1,
  }));
}

export function compressConcretePolicy(rows: Aiv2ComboMix[], actions: string[]) {
  const grouped = new Map<string, Aiv2ComboMix[]>();
  for (const row of rows) grouped.set(row.hand, [...(grouped.get(row.hand) ?? []), row]);
  return hands.map(hand => {
    const combos = grouped.get(hand) ?? [];
    if (!combos.length) throw new Error(`No concrete combos for ${hand}`);
    const totalWeight = combos.reduce((sum, row) => sum + row.reach_weight, 0);
    const unreachable = totalWeight === 0;
    // A zero-reach class has no reach-weighted policy average. Keep the
    // model-generated policy as an explicitly unreachable display summary;
    // never invent a fold/open fallback that can violate the 100% contract.
    const weights = unreachable
      ? actions.map(action => combos.reduce((sum, row) => sum + row.mix[action], 0) / combos.length)
      : actions.map(action => combos.reduce((sum, row) => sum + row.reach_weight * row.mix[action], 0) / totalWeight);
    // Largest-remainder rounding keeps the app's integer 169-grid contract intact.
    const rounded = weights.map(Math.floor), remainder = 100 - rounded.reduce((sum, value) => sum + value, 0);
    for (const index of weights.map((value, index) => ({ index, fractional: value - Math.floor(value) })).sort((a,b) => b.fractional - a.fractional).slice(0, remainder)) rounded[index.index]++;
    return { hand, mix: Object.fromEntries(actions.map((action, i) => [action, rounded[i]])), combo_count: combos.length, reach_weight: totalWeight, unreachable };
  });
}

export function rangePrompt({ scenario, actions, context = [], phase = "generate", candidate, analysis }: {
  scenario: Record<string, unknown>; actions: string[]; context?: unknown[]; phase?: "generate" | "reevaluate"; candidate?: unknown; analysis?: unknown;
}) {
  const scenarioId = String(scenario.id ?? "");
  if (!scenarioId || !actions.length) throw new Error("A named scenario and legal actions are required");
  const policyContract = `Return one JSON object only: {"kind":"aiv2_preflop_combo_policy","scenario_id":${JSON.stringify(scenarioId)},"class_mixes":[{"hand":"AA","mix":{"action":integer,...}},...169 canonical hands in this exact order: ${hands.join(",")}],"combo_overrides":[{"combo":"AsKh","mix":{"action":integer,...}}]}. Include exactly the legal actions ${JSON.stringify(actions)} on every mix; integer percentages must sum to 100. Use combo_overrides only for justified card-specific distinctions; otherwise leave it empty. The 169 defaults are compressed suit-symmetry groups, not a limitation: override any of the 1,326 concrete two-card combos independently when a specific card matters.`;
  const sharedContext = `Game: 6-max cash, 100BB effective, no ante, rake 5% capped at 3BB. Use only this spot's actual legal actions and preflop raise-to sizes. Frequencies are conditional on the exact action history; never use postflop bet/pot sizing. This is a range-wide estimated policy, not GTO/solver output. Analyze the full 1,326-combo range as a connected strategy: blockers, value/bluff balance, action coverage, prior player reach, and mutually coherent action frequencies. Existing AI frequencies are not supplied as a target.`;
  return [
    phase === "generate" ? "Generate a new independent AIv2 preflop range-wide strategy." : "Re-evaluate the full provisional AIv2 range-wide strategy for this exact history. Preserve legal sizes/actions; repair strategic incoherence in the complete range. Do not simply approve it: review the full 169 classes and any card-specific exceptions as a policy, then return your corrected final policy.",
    sharedContext,
    `Scenario structure (frequency rows deliberately omitted): ${JSON.stringify(scenario)}`,
    context.length ? `Generated upstream participant/history ranges and their exact per-combo action reach factors: ${JSON.stringify(context)}` : "No prior generated action ranges are required before this decision.",
    analysis ? `Persisted Phase 1 whole-range strategic analysis (must follow and implement): ${JSON.stringify(analysis)}` : "",
    candidate ? `Full provisional policy for strategic reevaluation: ${JSON.stringify(candidate)}` : "",
    policyContract,
  ].filter(Boolean).join("\n\n");
}

export function rangeAnalysisPrompt({ scenario, actions, context = [] }: { scenario: Record<string, unknown>; actions: string[]; context?: unknown[] }) {
  const scenarioId = String(scenario.id ?? "");
  if (!scenarioId || !actions.length) throw new Error("A named scenario and legal actions are required");
  return [
    "Phase 1: analyze the entire preflop strategy range before assigning any action frequencies. Do not output frequencies or a policy. This is an estimated strategy, not GTO or solver output.",
    "Return only compact JSON {kind:'aiv2_preflop_range_analysis',scenario_id,summary,range_themes:[string,...],blocker_notes:[{combo,strategic_note},...]}. Keep summary under 500 characters; at most 8 range_themes (each <=180 chars); at most 12 concrete blocker_notes, using valid physical combos. Cover positional/range-wide value-bluff coverage, legal action roles, and blocker-sensitive exceptions. The next phase will assign every hand-class mix and may add justified exceptions for any of 1,326 physical combos.",
    `Game: 6-max cash, 100BB effective, no ante, rake 5% capped at 3BB. Legal actions/sizes: ${JSON.stringify(actions)} / ${JSON.stringify(scenario)}. Do not introduce postflop bet sizing.`,
    `Scenario (frequency rows omitted): ${JSON.stringify(scenario)}`,
    context.length ? `Prior generated history with exact concrete combo action reach factors: ${JSON.stringify(context)}` : "No generated prerequisite action ranges.",
    "Analyze range interactions jointly: value/bluff coverage, position, pot odds and raise sizing, blockers, and action-history reach. Do not copy legacy AI strategy frequencies.",
  ].join("\n\n");
}

export function validateRangeAnalysis(raw: unknown, scenarioId: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AIv2 range analysis must be an object");
  const analysis = raw as Record<string, unknown>;
  if (analysis.kind !== "aiv2_preflop_range_analysis" || analysis.scenario_id !== scenarioId ||
      typeof analysis.summary !== "string" || !analysis.summary.trim() || analysis.summary.length > 500 ||
      !Array.isArray(analysis.range_themes) || analysis.range_themes.length > 8 || analysis.range_themes.some((item: any) => typeof item !== "string" || !item.trim() || item.length > 180) ||
      !Array.isArray(analysis.blocker_notes) || analysis.blocker_notes.length > 12 || analysis.blocker_notes.some((item: any) =>
        !CONCRETE_COMBOS.some(combo => combo.combo === item?.combo) || typeof item?.strategic_note !== "string" || !item.strategic_note.trim()))
    throw new Error("AIv2 range analysis has wrong identity or incomplete/oversized range-level content");
  return analysis;
}

export async function analyzeRange({ scenario, actions, context = [], generator = runCodex, model = AIV2_MODEL, effort = AIV2_REASONING_EFFORT }: {
  scenario: Record<string, unknown>; actions: string[]; context?: unknown[]; generator?: typeof runCodex; model?: string; effort?: string;
}) {
  const prompt = rangeAnalysisPrompt({ scenario, actions, context });
  const analysis = validateRangeAnalysis(await generator(prompt, { model, effort }), String(scenario.id),);
  return { analysis, provenance: { method: AIV2_PREflop_METHOD, model, reasoning_effort: effort, prompt_hash: sha(prompt), analysis_hash: sha(analysis) } };
}

export async function generateAndReevaluate({ scenario, actions, context = [], generator = runCodex, model = AIV2_MODEL, effort = AIV2_REASONING_EFFORT }: {
  scenario: Record<string, unknown>; actions: string[]; context?: unknown[]; generator?: typeof runCodex; model?: string; effort?: string;
}) {
  const scenarioId = String(scenario.id ?? "");
  const { analysis } = await analyzeRange({ scenario, actions, context, generator, model, effort });
  const firstPrompt = rangePrompt({ scenario, actions, context, analysis });
  const initial = validateAiv2Policy(await generator(firstPrompt, { model, effort }), scenarioId, actions);
  const reviewPrompt = rangePrompt({ scenario, actions, context, phase: "reevaluate", candidate: initial, analysis });
  const finalized = validateAiv2Policy(await generator(reviewPrompt, { model, effort }), scenarioId, actions);
  return { analysis, finalized, provenance: { method: AIV2_PREflop_METHOD, model, reasoning_effort: effort, prompt_hashes: [sha(firstPrompt), sha(reviewPrompt)], candidate_hash: sha(initial), final_hash: sha(finalized), analysis_hash: sha(analysis) } };
}

export function validateFinalReasons(raw: unknown, scenarioId: string, comboExceptions: string[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AIv2 reasons must be an object");
  const value = raw as Record<string, unknown>;
  if (value.scenario_id !== scenarioId || !Array.isArray(value.reasons) || value.reasons.length !== hands.length ||
      value.reasons.some((row: any, index: number) => row?.hand !== hands[index] || typeof row.text !== "string" || !row.text.trim()))
    throw new Error("Post-frequency reason response is incomplete or mismatched");
  const comboReasons = value.combo_reasons;
  if (!Array.isArray(comboReasons) || comboReasons.length !== comboExceptions.length || comboReasons.some((row: any, index: number) =>
      row?.combo !== comboExceptions[index] || typeof row.text !== "string" || !row.text.trim()))
    throw new Error("Post-frequency concrete combo reasons are incomplete or mismatched");
  return { scenario_id: scenarioId, reasons: value.reasons, combo_reasons: comboReasons };
}

export function actionsForSpot(spot: Record<string, unknown>): string[] {
  const row = (spot.hands as Array<Record<string, unknown>> | undefined)?.[0];
  if (!row) throw new Error("Spot has no canonical hand rows");
  const nonActions = new Set(["hand", "raise_to_size_bb", "open_size_bb", "all_in_size_bb", "four_bet_size_bb", "three_bet_size_bb", "raise_size_bb", "equity_vs_shove_pct"]);
  return Object.keys(row).filter(key => !nonActions.has(key) && typeof row[key] === "number");
}

export function scenarioOnly(spot: Record<string, unknown>): Record<string, unknown> {
  const { hands: _oldFrequencies, ...structure } = spot;
  return structure;
}
