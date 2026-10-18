import test from "node:test";
import assert from "node:assert/strict";
import { generationCounts, analysisDiagnostics, analysisOutputSchema } from "../scripts/aiv2-preflop-run-state.ts";
import type { Node } from "../scripts/aiv2-preflop-graph.ts";
test("generated completion excludes unreachable placeholders and remaining includes failures/inflight", () => {
  const nodes = ["done", "failed", "running", "pending", "placeholder"].map(key => ({
    key, dependencies: [], spot: { unreachable: key === "placeholder" },
  })) as unknown as Node[];
  const stats = generationCounts(nodes, { done: { status: "complete" }, failed: { status: "failed" }, running: { status: "running" }, placeholder: { status: "complete" } });
  assert.equal(stats.completed, 2); assert.equal(stats.generated_completed, 1);
  assert.equal(stats.generated_total, 4); assert.equal(stats.remaining_actionable, 3);
  assert.equal(stats.placeholders_completed, 1); assert.equal(stats.failed, 1); assert.equal(stats.running, 1); assert.equal(stats.pending_actionable, 1);
});
test("analysis schema retains exact validator limits and excludes policy fields", () => {
  const schema: any = analysisOutputSchema("HJ_open");
  assert.equal(schema.properties.summary.maxLength, 500);
  assert.equal(schema.properties.range_themes.maxItems, 8);
  assert.equal(schema.properties.range_themes.items.maxLength, 180);
  assert.equal(schema.properties.blocker_notes.maxItems, 12);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.scenario_id.const, "HJ_open");
});
test("analysis diagnostics identify exact oversized field without retaining prose", () => {
  const issues = analysisDiagnostics({ kind: "aiv2_preflop_range_analysis", scenario_id: "HJ_open", summary: "x".repeat(501), range_themes: ["secret-text".repeat(20)], blocker_notes: [] }, "HJ_open");
  assert.ok(issues.some(issue => issue.includes("summary length=501")));
  assert.ok(issues.some(issue => issue.includes("range_themes[0] length=220")));
  assert.ok(issues.every(issue => !issue.includes("secret-text")));
});
