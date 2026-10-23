// Saved exact-combo decisions. No legacy rule/defence/reference-policy fallback.
import { createHash } from "node:crypto";
import { hands } from "../src/data.ts";
import { CONCRETE_COMBOS, AIV2_MODEL, AIV2_REASONING_EFFORT } from "./aiv2-preflop.ts";
import { decodeCompactPolicy } from "./aiv2-preflop-codec.ts";
import { cardIds } from "./postflop-ai/flop-isomorphism.ts";
export const POSTFLOP_METHOD = "llm-postflop-ondemand-v2";
export const POSTFLOP_VERSION = "exact-combo-bilingual-srp33-66-125-3bp25-50-100-raise2p5-v2";
export const POSTFLOP_BETS = [33, 66, 125] as const;
export const postflopHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type Street = "flop" | "turn" | "river";
export type Seat = "BTN" | "BB";
export type Weights = Record<string, number>;
export type ActionOption = { action: string; paid_bb: number; to_bb: number; all_in: boolean };
export type History = { street: Street; board: string; seat: Seat; action: string; paid_bb: number; to_bb: number; decision_id?: string; policy_hash?: string; assumption?: string };
export type DecisionInput = {
  pot_type: "SRP" | "3BP+"; spot_id: "BTN_open_BB_call"; street: Street; board: string; actor: Seat; ip: "BTN"; oop: "BB";
  pot_bb: number; stacks_bb: Record<Seat, number>; committed_bb: Record<Seat, number>;
  last_full_raise_bb: number; raises_this_street: number; raise_reopened: boolean;
  history: History[]; ranges: Record<Seat, Weights>;
  upstream: Array<{ key: string; sha256: string; policy_hash: string }>;
  assumptions: string[]; preflop_history: unknown[];
};
export type DecisionArtifact = ReturnType<typeof buildPostflopArtifact>;
const seats: Seat[] = ["BTN", "BB"];
const other = (seat: Seat): Seat => seat === "BTN" ? "BB" : "BTN";
const round = (value: number) => Math.round(value * 100) / 100;
const index = new Map(CONCRETE_COMBOS.map(row => [row.combo, row]));
const cardTexts = (board: string) => board.match(/../g)!;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
function exact(value: unknown, keys: string[], label: string): asserts value is Record<string, any> {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error(label + ": exact keys required");
}
function assertInput(input: DecisionInput) {
  const count = ({ flop: 3, turn: 4, river: 5 } as const)[input.street];
  if (!count) throw new Error("Invalid street"); cardIds(input.board, count);
  if (!["SRP", "3BP+"].includes(input.pot_type) || input.spot_id !== "BTN_open_BB_call" || input.ip !== "BTN" || input.oop !== "BB" || !seats.includes(input.actor) || !positive(input.pot_bb)) throw new Error("Unsupported HU geometry");
  if (!Number.isInteger(input.raises_this_street) || input.raises_this_street < 0 || input.raises_this_street > 4 || !positive(input.last_full_raise_bb) || typeof input.raise_reopened !== "boolean") throw new Error("Invalid raise state");
  const blocked = new Set(cardTexts(input.board));
  for (const seat of seats) {
    if (!Number.isFinite(input.stacks_bb[seat]) || input.stacks_bb[seat] < 0 || !Number.isFinite(input.committed_bb[seat]) || input.committed_bb[seat] < 0) throw new Error("Invalid chips");
    const weights = input.ranges[seat];
    if (!record(weights) || Object.keys(weights).length !== 1326 || CONCRETE_COMBOS.some(({ combo }) => !Number.isFinite(weights[combo]) || weights[combo] < 0 || weights[combo] > 1 || (blocked.has(combo.slice(0, 2)) || blocked.has(combo.slice(2))) && weights[combo] !== 0)) throw new Error("Ranges must include all exact physical combos, zero board-blocked weights");
    if (!Object.values(weights).some(weight => weight > 0)) throw new Error("Empty player range");
  }
  if (!Array.isArray(input.history) || !Array.isArray(input.upstream) || input.upstream.some(p => !p.key || !/^[a-f0-9]{64}$/.test(p.sha256) || !/^[a-f0-9]{64}$/.test(p.policy_hash)) || !Array.isArray(input.assumptions) || !Array.isArray(input.preflop_history)) throw new Error("Invalid provenance");
  for (const step of input.history) {
    if (!seats.includes(step.seat) || !["flop", "turn", "river"].includes(step.street) || !Number.isFinite(step.paid_bb) || step.paid_bb < 0 || !Number.isFinite(step.to_bb) || step.to_bb < 0 || typeof step.action !== "string") throw new Error("Invalid public history");
    cardIds(step.board, ({ flop: 3, turn: 4, river: 5 } as const)[step.street]);
    if (!input.board.startsWith(step.board)) throw new Error("History board is not a prefix");
    if ((!step.decision_id || !step.policy_hash) && !step.assumption) throw new Error("Unconditioned history requires explicit assumption");
  }
}
/** Same HU chip semantics as hu-v7: effective stack cap, 2.5x raise-to, 67% merge,
 * max four raises. Bet sizes are NEW exact user choices; never legacy bet75.
 * last_full_raise_bb additionally enforces legal minimum raises/reopening.
 */
export function postflopLegalActions(input: DecisionInput): ActionOption[] {
  assertInput(input); return structuralLegalActions(input);
}
export function structuralLegalActions(input: Pick<DecisionInput,"actor"|"committed_bb"|"stacks_bb"|"raise_reopened"|"raises_this_street"|"last_full_raise_bb"|"pot_bb"|"pot_type">): ActionOption[] {
  const me = input.actor, villain = other(me), mine = input.committed_bb[me], theirs = input.committed_bb[villain];
  if (input.stacks_bb[me] <= 0 || theirs < mine) throw new Error("No legal actor decision");
  const cap = round(Math.min(input.stacks_bb[me], input.stacks_bb[villain] + theirs - mine));
  const facing = round(theirs - mine);
  const wager = (amount: number): { paid: number; allIn: boolean } => amount >= cap * .67 ? { paid: cap, allIn: true } : { paid: round(Math.min(amount, cap)), allIn: amount >= cap };
  const option = (action: string, paid: number, allIn = false): ActionOption => ({ action, paid_bb: paid, to_bb: round(mine + paid), all_in: allIn });
  if (facing > 0) {
    const paid = round(Math.min(facing, input.stacks_bb[me]));
    const out = [option("fold", 0), option("call", paid, paid >= input.stacks_bb[me])];
    if (input.raise_reopened && input.raises_this_street < 4 && input.stacks_bb[villain] > 0 && cap > facing) {
      const minimum = theirs + input.last_full_raise_bb;
      const { paid: raisePaid, allIn } = wager(round(Math.max(theirs * 2.5, minimum) - mine));
      out.push(option("raise", raisePaid, allIn));
    }
    return out;
  }
  const out = [option("check", 0)];
  if (cap <= 0) return out;
  let merged = false;
  for (const percentage of input.pot_type === "3BP+" ? [25, 50, 100] : POSTFLOP_BETS) {
    const { paid, allIn } = wager(Math.max(1, round(input.pot_bb * percentage / 100)));
    if (allIn && merged) continue;
    if (allIn) merged = true;
    out.push(option(allIn ? "allin" : `bet${percentage}`, paid, allIn));
  }
  return out;
}
function boardFilter(weights: Weights, board: string): Weights {
  const blocked = new Set(cardTexts(board));
  return Object.fromEntries(CONCRETE_COMBOS.map(({ combo }) => [combo, blocked.has(combo.slice(0, 2)) || blocked.has(combo.slice(2)) ? 0 : weights[combo]]));
}
export function initialBtnBbInput(opening: any, response: any, board = "As7d2c"): DecisionInput {
  for (const [artifact, id, hero] of [[opening, "BTN_open", "BTN"], [response, "BB_vs_BTN", "BB"]]) {
    if (artifact?.spot?.id !== id || artifact.spot.hero !== hero || artifact.metadata?.method !== "llm-range-single-response-v6" || artifact.metadata?.model !== AIV2_MODEL || artifact.metadata?.reasoning_effort !== AIV2_REASONING_EFFORT || artifact.metadata?.status !== "complete" || artifact.spot.context_kind !== "base" || artifact.spot.effective_stack_bb !== 100 || artifact.spot.open_size_bb !== 2.5) throw new Error("Frozen base v6 preflop source mismatch");
    if (artifact.metadata.final_hash !== postflopHash(decodeCompactPolicy(artifact.spot, artifact.spot.class_default_actions))) throw new Error("Frozen preflop policy hash mismatch");
  }
  const openPolicy = decodeCompactPolicy(opening.spot, opening.spot.class_default_actions), callPolicy = decodeCompactPolicy(response.spot, response.spot.class_default_actions);
  if (!openPolicy.actions.includes("open") || !callPolicy.actions.includes("call")) throw new Error("Missing source action");
  const own = (policy: typeof openPolicy, action: string) => Object.fromEntries(CONCRETE_COMBOS.map(({ combo, hand }) => [combo, (policy.combo_overrides[combo] ?? policy.class_mixes[hand])[action] / 100]));
  cardIds(board, 3);
  const input: DecisionInput = { pot_type: "SRP", spot_id: "BTN_open_BB_call", street: "flop", board, actor: "BB", ip: "BTN", oop: "BB", pot_bb: 5.5,
    stacks_bb: { BTN: 97.5, BB: 97.5 }, committed_bb: { BTN: 0, BB: 0 }, last_full_raise_bb: 1, raises_this_street: 0, raise_reopened: true,
    ranges: { BTN: boardFilter(own(openPolicy, "open"), board), BB: boardFilter(own(callPolicy, "call"), board) },
    history: [], assumptions: [],
    upstream: [{ key: "base/opening-ranges/BTN_open", sha256: postflopHash(opening), policy_hash: opening.metadata.final_hash }, { key: "base/preflop-ranges/BB_vs_BTN", sha256: postflopHash(response), policy_hash: response.metadata.final_hash }],
    preflop_history: [...(response.spot.history ?? []), { seat: "BB", action: "call", to_size_bb: 2.5 }] };
  assertInput(input); return input;
}
export function decisionIdentity(input: DecisionInput, implementationHash: string) {
  assertInput(input);
  if (!/^[a-f0-9]{64}$/.test(implementationHash)) throw new Error("Missing implementation identity");
  return postflopHash({ method: POSTFLOP_METHOD, version: POSTFLOP_VERSION, model: AIV2_MODEL, effort: AIV2_REASONING_EFFORT, implementation_hash: implementationHash, input, legal_actions: postflopLegalActions(input) });
}
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export function postflopResponseSchema(input: DecisionInput, id: string) {
  const actions = postflopLegalActions(input).map(a => a.action);
  const prose = { type: "string", minLength: 1, maxLength: 1800 };
  return object({ decision_id: { type: "string", const: id }, range_summary: object({ text: prose, text_ja: prose }), groups: { type: "array", minItems: 1, maxItems: 1326, items: object({ combos: { type: "array", minItems: 1, maxItems: 1326, items: { type: "string", pattern: "^([AKQJT98765432][shdc]){2}$" } }, mix: object(Object.fromEntries(actions.map(a => [a, { type: "integer", minimum: 0, maximum: 100 }]))), text: prose, text_ja: prose }) } });
}
export function postflopPrompt(input: DecisionInput, id: string) {
  assertInput(input);
  const ranges = Object.fromEntries(seats.map(seat => {
    const groups = new Map<number, string[]>();
    for (const { combo } of CONCRETE_COMBOS) if (input.ranges[seat][combo] > 0) groups.set(input.ranges[seat][combo], [...(groups.get(input.ranges[seat][combo]) ?? []), combo]);
    return [seat, [...groups].map(([weight, combos]) => ({ weight, combos }))];
  }));
  const { ranges: _ranges, ...state } = input;
  return ["Generate ONE exact public HU poker decision in ONE JSON response, frequencies AND faithful English/Japanese reasons together. AI estimate, not GTO/solver. Do not use tools, files, legacy charts or invent numerical EV/equity.",
    "Game:6-max cash100BB no ante rake5% cap3BB. The two named live ranges are exact physical-combo reach weights, not an independent card-removal-conditioned joint deal distribution. Board-blocked and zero-own-reach combos are excluded. Never multiply the opponent's same-combo reach into actor reach. Do not assume unavailable previous actions have generated policies; explicit assumptions remain limitations.",
    "Consider both complete live ranges jointly: range/nut advantage, value-bluff coverage, blockers, showdown protection and coherent size allocation. Do not solve hands independently. Prefer concise faithful EN/JA reasons and lossless groups of explicitly chosen combos sharing both an exact mix and strategic rationale; never merge genuine physical-card exceptions merely to shorten output. Aim for short reasons (about160characters each) while retaining necessary specificity.",
    "Return decision_id, range_summary:{text,text_ja}, groups:[{combos:[canonical exact card strings],mix:{every legal action:integer0..100 summing100},text,text_ja}]. Cover EVERY positive-reach actor combo exactly once, no blocked/zero/unlisted combos. You may group ONLY combos you explicitly decide have exactly the SAME full mix AND SAME valid bilingual reason; expand any physical-card/blocker exception into its own group. This is lossless output compression, not a hand-tier or suit-symmetry frequency template. Give specific reasons consistent with those saved frequencies and this exact public history; English and Japanese must express the same strategy. A range-wide strategic explanation belongs in range_summary in THIS response, not a separate call.",
    "Requested decision_id:" + id, "Common context:" + JSON.stringify({ ...state, ranges, legal_actions: postflopLegalActions(input) })].join("\n");
}
export function effectivePostflopPrompt(input: DecisionInput, id: string, issue: string | null = null) {
  const base=postflopPrompt(input,id);
  return issue===null?base:base+'\nCorrect ONLY prior numerical/schema/coverage invalidity: '+issue+'. Return COMPLETE JSON. No semantic-review regeneration.';
}
export function validatePostflopResponse(raw: unknown, input: DecisionInput, id: string) {
  exact(raw, ["decision_id", "range_summary", "groups"], "response");
  if (raw.decision_id !== id || !Array.isArray(raw.groups) || !raw.groups.length || raw.groups.length > 1326) throw new Error("Wrong decision identity or groups");
  exact(raw.range_summary, ["text", "text_ja"], "summary");
  const text = (row: any) => { if ([row.text, row.text_ja].some(v => typeof v !== "string" || !v.trim() || v.length > 1800)) throw new Error("Missing/oversized bilingual reason"); };
  text(raw.range_summary);
  const actions = postflopLegalActions(input).map(a => a.action), seen = new Set<string>();
  const combos: Array<{ combo: string; hand: string; reach_weight: number; mix: Record<string, number>; text: string; text_ja: string }> = [];
  for (const group of raw.groups) {
    exact(group, ["combos", "mix", "text", "text_ja"], "group"); text(group); exact(group.mix, actions, "mix");
    if (!Array.isArray(group.combos) || !group.combos.length || Object.values(group.mix).some(value => !Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) || Object.values<number>(group.mix).reduce((sum, value) => sum + value, 0) !== 100) throw new Error("Invalid complete integer mix");
    for (const combo of group.combos) {
      const entry = index.get(combo);
      if (!entry || seen.has(combo) || !(input.ranges[input.actor][combo] > 0)) throw new Error("Duplicate/blocked/zero-reach/unknown combo");
      seen.add(combo); combos.push({ combo, hand: entry.hand, reach_weight: input.ranges[input.actor][combo], mix: { ...group.mix }, text: group.text, text_ja: group.text_ja });
    }
  }
  const expected = CONCRETE_COMBOS.filter(row => input.ranges[input.actor][row.combo] > 0);
  if (seen.size !== expected.length || expected.some(row => !seen.has(row.combo))) throw new Error("Incomplete positive physical-combo coverage");
  const byCombo = new Map(combos.map(row => [row.combo, row]));
  return { summary: { ...raw.range_summary } as {text: string; text_ja: string}, combos: expected.map(({combo}) => byCombo.get(combo)!) };
}
export function buildPostflopArtifact(input: DecisionInput, raw: unknown, implementationHash: string) {
  const decision_id = decisionIdentity(input, implementationHash), validated = validatePostflopResponse(raw, input, decision_id);
  const blocked = new Set(cardTexts(input.board)), actions = postflopLegalActions(input);
  const rows = hands.map(hand => {
    const physical = CONCRETE_COMBOS.filter(row => row.hand === hand && !blocked.has(row.combo.slice(0, 2)) && !blocked.has(row.combo.slice(2)));
    const reached = validated.combos.filter(row => row.hand === hand), reach_weight = reached.reduce((sum, row) => sum + row.reach_weight, 0);
    return { hand, combo_count: physical.length, reached_combo_count: reached.length, reach_weight, unreachable: reach_weight === 0,
      frequencies: reach_weight === 0 ? {} : Object.fromEntries(actions.map(({action}) => [action, reached.reduce((sum, row) => sum + row.reach_weight * row.mix[action], 0) / reach_weight])) };
  });
  return { kind: "aiv2_saved_postflop_decision" as const, schema_version: "aiv2-postflop-ondemand-decision-v2" as const, decision_id, input,
    legal_actions: actions, source_response: raw, summary: validated.summary, combos: validated.combos, hands: rows,
    metadata: { method: POSTFLOP_METHOD, version: POSTFLOP_VERSION, model: AIV2_MODEL, reasoning_effort: AIV2_REASONING_EFFORT,
      implementation_hash: implementationHash, input_hash: postflopHash(input), response_hash: postflopHash(raw), policy_hash: postflopHash(validated.combos),
      reached_combo_count: validated.combos.length, reasons_generated_with_frequencies: true, publication_status: "candidate-not-selectable", coverage: "one-exact-board-public-history-actor-only" } };
}
export function validatePostflopArtifact(artifact: DecisionArtifact) {
  const rebuilt = buildPostflopArtifact(artifact.input, artifact.source_response, artifact.metadata.implementation_hash);
  if (postflopHash(rebuilt) !== postflopHash(artifact)) throw new Error("Saved postflop artifact content/identity changed");
  return artifact;
}
/** Only this actor's observed action conditions its range. No new generation here. */
export function advancePostflopDecision(artifact: DecisionArtifact, action: string, nextCard?: string): {status: "decision"; input: DecisionInput} | {status: "terminal" | "next-street-card-required"} {
  validatePostflopArtifact(artifact);
  const input = artifact.input, implementation = artifact.metadata.implementation_hash;
  if (artifact.decision_id !== decisionIdentity(input, implementation) || artifact.metadata.policy_hash !== postflopHash(artifact.combos)) throw new Error("Saved decision identity changed");
  const option = postflopLegalActions(input).find(a => a.action === action); if (!option) throw new Error("Illegal saved action");
  const actor = input.actor, opponent = other(actor), step: History = { street: input.street, board: input.board, seat: actor, action, paid_bb: option.paid_bb, to_bb: option.to_bb, decision_id: artifact.decision_id, policy_hash: artifact.metadata.policy_hash };
  if (action === "fold") return { status: "terminal" };
  const conditioned = { ...input.ranges[actor] };
  const mixes = new Map(artifact.combos.map(row => [row.combo, row.mix]));
  for (const {combo} of CONCRETE_COMBOS) conditioned[combo] *= (mixes.get(combo)?.[action] ?? 0) / 100;
  if (!Object.values(conditioned).some(w => w > 0)) throw new Error("zero-reach");
  const stacks = { ...input.stacks_bb, [actor]: round(input.stacks_bb[actor] - option.paid_bb) };
  const committed = { ...input.committed_bb, [actor]: option.to_bb }, pot = round(input.pot_bb + option.paid_bb);
  const previous = input.history.at(-1), ended = action === "call" || action === "check" && previous?.street === input.street && previous.seat === opponent && previous.action === "check";
  if (ended && (input.street === "river" || stacks.BTN <= 0 || stacks.BB <= 0)) return { status: "terminal" };
  if (ended && !nextCard) return { status: "next-street-card-required" };
  if (!ended && nextCard) throw new Error("Cannot deal before betting closes");
  const street: Street = ended ? input.street === "flop" ? "turn" : "river" : input.street;
  const board = ended ? input.board + nextCard : input.board;
  cardIds(board, ({ flop: 3, turn: 4, river: 5 } as const)[street]);
  const raiseIncrement = option.to_bb - input.committed_bb[opponent];
  const next: DecisionInput = { ...input, actor: ended ? "BB" : opponent, street, board, pot_bb: pot, stacks_bb: stacks, committed_bb: ended ? { BTN: 0, BB: 0 } : committed,
    last_full_raise_bb: ended ? 1 : action === "raise" ? Math.max(input.last_full_raise_bb, raiseIncrement) : action.startsWith("bet") || action === "allin" ? option.paid_bb : input.last_full_raise_bb,
    raises_this_street: ended ? 0 : input.raises_this_street + Number(action === "raise"), raise_reopened: ended || action !== "raise" || raiseIncrement >= input.last_full_raise_bb,
    history: [...input.history, step], ranges: { [actor]: boardFilter(conditioned, board), [opponent]: boardFilter(input.ranges[opponent], board) } as Record<Seat, Weights> };
  if (Object.values(next.ranges).some(range => !Object.values(range).some(w => w > 0))) throw new Error("zero-reach");
  assertInput(next); return {status: "decision", input: next};
}
