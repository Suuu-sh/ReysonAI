import { CONCRETE_COMBOS } from "./aiv2-preflop.ts";
import type { Node } from "./aiv2-preflop-graph.ts";

export function generationCounts(nodes: Node[], states: Record<string, any>) {
  const generated = nodes.filter(node => !node.spot.unreachable);
  const placeholders = nodes.filter(node => node.spot.unreachable);
  const count = (list: Node[], status: string) => list.filter(node => states[node.key]?.status === status).length;
  const completed = count(generated, "complete");
  return {
    generated_total: generated.length,
    generated_completed: completed,
    compatible_migrated_completed: generated.filter(node => states[node.key]?.status === "complete" && states[node.key]?.compatible_migrated).length,
    native_generated_completed: generated.filter(node => states[node.key]?.status === "complete" && !states[node.key]?.compatible_migrated).length,
    remaining_actionable: generated.length - completed,
    placeholders_total: placeholders.length,
    placeholders_completed: count(placeholders, "complete"),
    completed: count(nodes, "complete"), // backward-compatible table count, not generated policies
    failed: count(generated, "failed"),
    running: count(generated, "running"),
    pending: generated.filter(node => !states[node.key]).length,
    pending_actionable: generated.filter(node => !states[node.key]).length,
    ready_queued: generated.filter(node => !states[node.key] && node.dependencies.every(key => states[key]?.status === "complete")).length,
  };
}

export function analysisOutputSchema(scenarioId: string): Record<string, unknown> {
  return {
    type: "object", additionalProperties: false,
    required: ["kind", "scenario_id", "summary", "range_themes", "blocker_notes"],
    properties: {
      kind: { type: "string", const: "aiv2_preflop_range_analysis" },
      scenario_id: { type: "string", const: scenarioId },
      summary: { type: "string", minLength: 1, maxLength: 500 },
      range_themes: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1, maxLength: 180 } },
      blocker_notes: { type: "array", maxItems: 12, items: {
        type: "object", additionalProperties: false, required: ["combo", "strategic_note"],
        properties: {
          combo: { type: "string", pattern: "^[AKQJT98765432][shdc][AKQJT98765432][shdc]$" },
          strategic_note: { type: "string", minLength: 1, maxLength: 500 },
        },
      } },
    },
  };
}

// Persist only structural diagnostics, never raw model responses or secrets.
export function analysisDiagnostics(raw: unknown, scenarioId: string): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["root must be an object"];
  const value = raw as Record<string, any>, issues: string[] = [];
  if (value.kind !== "aiv2_preflop_range_analysis") issues.push("kind mismatch");
  if (value.scenario_id !== scenarioId) issues.push("scenario_id mismatch");
  const stringIssue = (text: unknown, max: number, label: string) => {
    if (typeof text !== "string") issues.push(label + " must be a string");
    else if (!text.trim()) issues.push(label + " must be nonempty");
    else if (text.length > max) issues.push(label + " length=" + text.length + " exceeds " + max + " characters");
  };
  stringIssue(value.summary, 500, "summary");
  if (!Array.isArray(value.range_themes)) issues.push("range_themes must be an array");
  else {
    if (!value.range_themes.length || value.range_themes.length > 8) issues.push("range_themes count=" + value.range_themes.length + " must be 1..8");
    value.range_themes.forEach((theme: unknown, index: number) => stringIssue(theme, 180, "range_themes[" + index + "]"));
  }
  if (!Array.isArray(value.blocker_notes)) issues.push("blocker_notes must be an array");
  else {
    if (value.blocker_notes.length > 12) issues.push("blocker_notes count=" + value.blocker_notes.length + " exceeds 12");
    const combos = new Set(CONCRETE_COMBOS.map(row => row.combo)), seen = new Set<string>();
    value.blocker_notes.forEach((note: any, index: number) => {
      if (!note || !combos.has(note.combo)) issues.push("blocker_notes[" + index + "] invalid canonical physical combo");
      else if (seen.has(note.combo)) issues.push("blocker_notes[" + index + "] duplicate combo");
      if (note && typeof note.combo === "string") seen.add(note.combo);
      stringIssue(note?.strategic_note, 500, "blocker_notes[" + index + "].strategic_note");
    });
  }
  return issues;
}
