import { hands } from "../data.ts";

export type GtoAction = { id: "check" | "bet"; kind: "check" | "bet"; amountBb: number; potFraction?: number | null };
export type GtoCombo = { combo: string; handClass: string; reachWeight: number; frequencies: Record<"check" | "bet", number> };
export type GtoClass = { handClass: string; comboCount: number; reachWeight: number; frequencies: Record<"check" | "bet", number> };
export type GtoNode = { id: "bb-root" | "btn-after-check"; position: "BB" | "BTN"; history: { position: string; action: string }[]; actions: GtoAction[]; combos: GtoCombo[]; classes: GtoClass[] };
export type GtoBenchmark = {
  schemaVersion: 1;
  id: string;
  metadata: {
    board: ["Qs", "Jh", "2h"];
    startingStackBb: number; effectiveStackBb: number; potBb: number; openSizeBb: number;
    betPotFraction: number; raiseMultiplier: number; raiseLimit: null; rakePercent: number; rakeCapBb: number;
    exploitabilityPotFraction: number;
    upstream: { url: string; sha: string };
    inputs: Record<string, unknown>;
    measured: { solveSeconds: number; peakRssBytes: number };
    coverage: "flop-two-decisions";
  };
  nodes: GtoNode[];
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const fail = (message: string): never => { throw new Error(`Invalid saved GTO calculation: ${message}`); };
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-8;
const ranks = "AKQJT98765432";
const card = (value: string) => /^[AKQJT98765432][cdhs]$/.test(value);
// This view is for one reviewed export, not an open-ended solver-data importer.
const SOURCE = {
  engineSha: "9d1509fe5077d019825f833eed04b16d342dfda1",
  btnFileSha: "236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b",
  btnRangeSha: "30090fc2ccdeee4191298115c571defa147e8ae7f70a28dd0e21a984aab36a60",
  bbFileSha: "9cd797c296e59565dc1317e2b7e3db9dcfcd9c88f4fe6c5e1b38b036593bee2b",
  bbRangeSha: "402b5c3ee030ca2144d7013c8490c9c7e9c0635c3724d5ce6377e11fd07981e5",
  resultSha: "07d44934f72a1063c858c51c69a73da53c53a5130695e4e1569c846dc5a14a94",
} as const;

function classOf(combo: string): string {
  const a = combo.slice(0, 2), b = combo.slice(2, 4);
  if (!card(a) || !card(b) || a === b) fail(`invalid combo ${combo}`);
  const first = ranks.indexOf(a[0]), second = ranks.indexOf(b[0]);
  if (first === second) return a[0] + b[0];
  return (first < second ? a[0] + b[0] : b[0] + a[0]) + (a[1] === b[1] ? "s" : "o");
}
function frequencies(value: unknown, where: string): asserts value is Record<"check" | "bet", number> {
  if (!isObject(value) || Object.keys(value).sort().join() !== "bet,check" ||
    !finite(value.check) || !finite(value.bet) || value.check < 0 || value.bet < 0 ||
    value.check > 1 || value.bet > 1 || Math.abs(value.check + value.bet - 1) > 1e-7) fail(`${where} frequencies`);
}

export function validateGtoBenchmark(input: unknown): GtoBenchmark {
  if (!isObject(input)) throw new Error("Invalid saved GTO calculation: envelope");
  if (!isObject(input.metadata) || !Array.isArray(input.nodes)) throw new Error("Invalid saved GTO calculation: envelope");
  if (input.schemaVersion !== 1 || input.id !== "btn-bb-100bb-qsjh2h-single-size") fail("envelope");
  const meta = input.metadata;
  if (!isObject(meta.inputs)) throw new Error("Invalid saved GTO calculation: input provenance");
  if (!Array.isArray(meta.board) || meta.board.join() !== "Qs,Jh,2h" ||
    meta.startingStackBb !== 100 || meta.effectiveStackBb !== 97.5 || meta.potBb !== 5.5 ||
    meta.openSizeBb !== 2.5 || meta.betPotFraction !== 0.5 || meta.raiseMultiplier !== 2.5 ||
    meta.raiseLimit !== null || meta.rakePercent !== 0 || meta.rakeCapBb !== 0 ||
    !finite(meta.exploitabilityPotFraction) || !near(meta.exploitabilityPotFraction, 0.00272675) ||
    meta.coverage !== "flop-two-decisions" || !isObject(meta.upstream) ||
    meta.upstream.url !== "https://github.com/b-inary/postflop-solver" || meta.upstream.sha !== SOURCE.engineSha ||
    !isObject(meta.measured) ||
    !finite(meta.measured.solveSeconds) || meta.measured.solveSeconds <= 0 ||
    !finite(meta.measured.peakRssBytes) || meta.measured.peakRssBytes <= 0) fail("fixed conditions or provenance");
  if (!isObject(meta.inputs.BTN_open) || !isObject(meta.inputs.BB_call) ||
    meta.inputs.BTN_open.sourcePath !== "apps/frontend/src/estimated/opening-ranges.json" ||
    meta.inputs.BTN_open.sourceId !== "BTN_open" ||
    meta.inputs.BTN_open.fileSha256 !== SOURCE.btnFileSha ||
    meta.inputs.BTN_open.rangeSha256 !== SOURCE.btnRangeSha ||
    meta.inputs.BB_call.sourcePath !== "solutions/cash-6max-100bb-v1.json" ||
    meta.inputs.BB_call.nodeId !== "node-72f98d904c1d2d17" ||
    meta.inputs.BB_call.fileSha256 !== SOURCE.bbFileSha ||
    meta.inputs.BB_call.rangeSha256 !== SOURCE.bbRangeSha ||
    meta.inputs.benchmarkResultsSha256 !== SOURCE.resultSha) fail("input provenance");
  if (input.nodes.length !== 2) fail("decision count");
  const ids = new Set<string>();
  for (const raw of input.nodes) {
    if (!isObject(raw) || !["bb-root", "btn-after-check"].includes(raw.id as string) || ids.has(raw.id as string) ||
      !Array.isArray(raw.actions) || !Array.isArray(raw.combos) || !Array.isArray(raw.classes) || !Array.isArray(raw.history)) fail("node structure");
    ids.add(raw.id as string);
    const root = raw.id === "bb-root";
    if (raw.combos.length !== (root ? 1176 : 690) || raw.classes.length !== (root ? 169 : 119)) fail("incomplete saved decision");
    if (raw.position !== (root ? "BB" : "BTN") || JSON.stringify(raw.history) !== (root ? "[]" : '[{"position":"BB","action":"check"}]')) fail("decision history");
    if (raw.actions.length !== 2 || raw.actions[0]?.id !== "check" || raw.actions[0]?.kind !== "check" || raw.actions[0]?.amountBb !== 0 ||
      raw.actions[1]?.id !== "bet" || raw.actions[1]?.kind !== "bet" || raw.actions[1]?.amountBb !== 2.75 || raw.actions[1]?.potFraction !== 0.5) fail("node actions");
    const comboKeys = new Set<string>();
    const totals = new Map<string, { count: number; reach: number; check: number; bet: number }>();
    for (const value of raw.combos) {
      if (!isObject(value) || typeof value.combo !== "string" || value.combo.length !== 4 ||
        !finite(value.reachWeight) || value.reachWeight <= 0 || typeof value.handClass !== "string") fail("combo data");
      const handClass = classOf(value.combo);
      if (handClass !== value.handClass || !hands.includes(handClass) ||
        ["Qs", "Jh", "2h"].some(boardCard => value.combo.includes(boardCard)) ||
        comboKeys.has([value.combo.slice(0, 2), value.combo.slice(2, 4)].sort().join(""))) fail("combo identity or board collision");
      comboKeys.add([value.combo.slice(0, 2), value.combo.slice(2, 4)].sort().join(""));
      frequencies(value.frequencies, value.combo);
      const total = totals.get(handClass) ?? { count: 0, reach: 0, check: 0, bet: 0 };
      total.count++; total.reach += value.reachWeight;
      total.check += value.reachWeight * value.frequencies.check;
      total.bet += value.reachWeight * value.frequencies.bet;
      totals.set(handClass, total);
    }
    const classKeys = new Set<string>();
    for (const value of raw.classes) {
      if (!isObject(value) || typeof value.handClass !== "string" || classKeys.has(value.handClass) ||
        !hands.includes(value.handClass) || !Number.isInteger(value.comboCount) || !finite(value.reachWeight) || value.reachWeight <= 0) fail("class data");
      classKeys.add(value.handClass);
      frequencies(value.frequencies, value.handClass);
      const total = totals.get(value.handClass);
      if (!total || total.reach <= 0 || value.comboCount !== total.count || !near(value.reachWeight, total.reach) ||
        !near(value.frequencies.check, total.check / total.reach) || !near(value.frequencies.bet, total.bet / total.reach)) fail("class weighted aggregation");
    }
    if (classKeys.size !== totals.size) fail("missing class");
  }
  if (!ids.has("bb-root") || !ids.has("btn-after-check")) fail("decision identities");
  return input as GtoBenchmark;
}
