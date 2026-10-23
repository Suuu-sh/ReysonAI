import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildGraph } from "../scripts/aiv2-preflop-graph.ts";
import { auditGlobal, consistencyPlan } from "../scripts/aiv2-preflop-consistency.ts";
import { singlePassScope, singlePassScopeProgress, runtimeCompatibleSource, runtimeCompatibilityReceipt, scopeCompatibilityReceipt } from "../scripts/aiv2-single-pass-runtime.ts";
const graph = buildGraph(new URL("../src/estimated/", import.meta.url).pathname);
const digest = (source: string) => createHash("sha256").update(source).digest("hex");
const sha = (value: unknown) => digest(JSON.stringify(value));
test("basic-hu exact target325 +20 base cold3bet prerequisite closed domain; no other dispatch", () => {
  const scope = singlePassScope(["--scope=basic-hu"], graph.nodes)!;
  assert.equal(scope.targetKeys.size, 325); assert.equal(scope.prerequisiteKeys.size, 20); assert.equal(scope.allowedKeys.size, 345);
  const profiles = new Set([...scope.targetKeys].map(key => key.startsWith("base/") ? "base" : key.split("/")[1]));
  assert.deepEqual([...profiles].sort(), ["base", "lag", "maniac", "nit", "station"]);
  for (const node of graph.nodes.filter(node => scope.allowedKeys.has(node.key))) {
    assert.ok(node.dependencies.every(key => scope.allowedKeys.has(key)));
    assert.ok(!node.spot.unreachable);
    if (scope.prerequisiteKeys.has(node.key)) { assert.equal(node.dataset, "cold-three-bet-responses"); assert.ok(!node.profile); }
  }
  assert.ok(![...scope.allowedKeys].some(key => /multiway|squeeze|limp|continuation|cold-four/.test(key)));
  assert.equal(singlePassScope([], graph.nodes), null);
  assert.throws(() => singlePassScope(["--scope=unknown"], graph.nodes), /Unknown/);
  const corrupt = graph.nodes.map(n => ({ ...n, dependencies: [...n.dependencies] }));
  corrupt.find(n => scope.targetKeys.has(n.key))!.dependencies.push("absent/source");
  assert.throws(() => singlePassScope(["--scope=basic-hu"], corrupt), /Missing scoped dependency/);
});
test("scoped progress/completion preserves global/outside completions, counts prerequisites separately", () => {
  const scope = singlePassScope(["--scope=basic-hu"], graph.nodes)!;
  const outside = graph.nodes.find(node => !scope.allowedKeys.has(node.key))!;
  const states: Record<string, {status: string}> = { [outside.key]: { status: "complete" } };
  for (const key of scope.targetKeys) states[key] = { status: "complete" };
  const incomplete = singlePassScopeProgress(scope, states);
  assert.equal(incomplete.scoped_target_completed, 325); assert.equal(incomplete.scoped_remaining, 20);
  const prerequisite = [...scope.prerequisiteKeys][0]; states[prerequisite] = { status: "running" };
  assert.equal(singlePassScopeProgress(scope, states).scoped_running, 1);
  for (const key of scope.prerequisiteKeys) states[key] = { status: "complete" };
  const complete = singlePassScopeProgress(scope, states);
  assert.equal(complete.scoped_completed, 345); assert.equal(complete.scoped_remaining, 0); assert.equal(complete.scoped_target_completed, 325);
  assert.equal(states[outside.key].status, "complete"); assert.equal(Object.keys(states).length, 346);
  assert.deepEqual(singlePassScopeProgress(null, states), {});
});
test("closed scoped global audit checks coverage/dependency fingerprints without requiring outside nodes", () => {
  const scope = singlePassScope(["--scope=basic-hu"], graph.nodes)!;
  const nodes = graph.nodes.filter(node => scope.allowedKeys.has(node.key));
  const identities = consistencyPlan(graph.nodes).identities;
  const outputs = new Map(nodes.map(node => [node.key, { spot: { hands: [], combo_overrides: [] }, metadata: { final_hash: "fixture", semantic_identity: identities.get(node.key), upstream_fingerprint: sha(node.dependencies.map(() => "fixture")) } }]));
  assert.equal(auditGlobal(nodes, outputs, identities).nodes, 345);
  outputs.delete([...scope.prerequisiteKeys][0]);
  assert.throws(() => auditGlobal(nodes, outputs, identities), /missing/);
});
test("exact reviewed scope scheduling patch canonicalizes to original cache identity only", () => {
  const file = "aiv2-single-pass-runner.ts";
  const runner = readFileSync(new URL("../scripts/" + file, import.meta.url), "utf8");
  const original = runtimeCompatibleSource(file, runner);
  let concurrent = original;
  for (const {before, after} of runtimeCompatibilityReceipt.changes) concurrent = concurrent.replace(before, after);
  let scoped = concurrent;
  for (const {before, after} of scopeCompatibilityReceipt.changes) scoped = scoped.replace(before, after);
  assert.equal(digest(concurrent), scopeCompatibilityReceipt.oldRunnerSha256);
  assert.equal(digest(scoped), scopeCompatibilityReceipt.newRunnerSha256);
  assert.equal(runtimeCompatibleSource(file, scoped), original);
  assert.equal(digest(original), runtimeCompatibilityReceipt.oldRunnerSha256);
  for (const unexpected of [scoped + "\n", scoped.replace("scope.allowedKeys.has(node.key)", "true"), scoped.replace("upstream_fingerprint", "altered_fingerprint")]) assert.throws(() => runtimeCompatibleSource(file, unexpected), /compatibility refused/);
  assert.ok(scoped.includes("(!scope || scope.allowedKeys.has(node.key)) && pending.has(node.key)"));
  assert.ok(scoped.includes("scope-complete-audited-candidate-not-selectable"));
  assert.ok(scoped.includes("generated_total: 2100"));
  assert.ok(scoped.includes('stopped = "Scoped audit failed: "'));
});
