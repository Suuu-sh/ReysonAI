// Runtime-only concurrency change. No prompt, schema, model, graph or artifact migration.
import { createHash } from "node:crypto";
export const SINGLE_PASS_MAX_CONCURRENCY = 10;
export function singlePassConcurrency(argv: string[]) {
  const value = Number(argv.find(arg => arg.startsWith("--concurrency="))?.split("=")[1] ?? "4");
  if (!Number.isInteger(value) || value < 1 || value > SINGLE_PASS_MAX_CONCURRENCY) throw new Error("Concurrency must be 1..10");
  return value;
}
// Explicit reviewed whole-file byte identities; not a general old-hash adoption bypass.
export const runtimeCompatibilityReceipt = {
  "id": "single-pass-runtime-cap-4-to-10-v1",
  "oldRunnerSha256": "ef541f6b0aa57078c4fc141f9ff3d829ea9924dcc341dc0f6d7b80f9830eaef1",
  "newRunnerSha256": "671877fb2451ab5b7e49d8a139a8dfd957ca6aabd17e7dcaf946395283499905",
  "changes": [
    {
      "before": "import { createAiv2SessionProvider } from \"./lib/aiv2-provider-session.ts\";",
      "after": "import { createAiv2SessionProvider } from \"./lib/aiv2-provider-session.ts\";\nimport { singlePassConcurrency, runtimeCompatibleSource } from \"./aiv2-single-pass-runtime.ts\";"
    },
    {
      "before": ".map(file => readFileSync(join(root, \"scripts\", file), \"utf8\")))",
      "after": ".map(file => runtimeCompatibleSource(file, readFileSync(join(root, \"scripts\", file), \"utf8\"))))"
    },
    {
      "before": "const concurrency = Number(argv.find(value => value.startsWith(\"--concurrency=\"))?.split(\"=\")[1] ?? \"4\");",
      "after": "const concurrency = singlePassConcurrency(argv);"
    },
    {
      "before": "if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isInteger(limit)",
      "after": "if (!Number.isInteger(limit)"
    }
  ]
} as const;
export const scopeCompatibilityReceipt = {
  "id": "single-pass-basic-hu-scheduling-v1",
  "oldRunnerSha256": "671877fb2451ab5b7e49d8a139a8dfd957ca6aabd17e7dcaf946395283499905",
  "newRunnerSha256": "9da58cab010319f303b232de4eb82780a7ca9d82bbfa300a1f05d3e5a20fb411",
  "changes": [
    {
      "before": "import { singlePassConcurrency, runtimeCompatibleSource } from \"./aiv2-single-pass-runtime.ts\";",
      "after": "import { singlePassConcurrency, runtimeCompatibleSource, singlePassScope, singlePassScopeProgress } from \"./aiv2-single-pass-runtime.ts\";"
    },
    {
      "before": "const graph = buildGraph(join(root, \"src/estimated\")), consistency = consistencyPlan(graph.nodes);",
      "after": "const graph = buildGraph(join(root, \"src/estimated\")), consistency = consistencyPlan(graph.nodes);\n  const scope = singlePassScope(argv, graph.nodes);"
    },
    {
      "before": "let stop = false, stopped: string | null = null, finished = false;",
      "after": "let stop = false, stopped: string | null = null, finished = false, scopeAudit: unknown = null;"
    },
    {
      "before": "updated_at: new Date().toISOString(), status: stopped ? \"blocked-resumable\" : stop ? \"controlled-draining\" : finished ? counts().generated_completed === 2100 && counts().placeholders_completed === 16 ? \"complete-audited-candidate-not-selectable\" : \"limit-reached-not-complete\" : \"running\", ...counts(), stopped_reason: stopped, nodes: states,",
      "after": "updated_at: new Date().toISOString(), status: stopped ? \"blocked-resumable\" : stop ? \"controlled-draining\" : finished ? scope && scopeAudit ? \"scope-complete-audited-candidate-not-selectable\" : counts().generated_completed === 2100 && counts().placeholders_completed === 16 ? \"complete-audited-candidate-not-selectable\" : \"limit-reached-not-complete\" : \"running\", ...counts(), ...singlePassScopeProgress(scope, states),\n    ...(scope ? { scoped_status: scopeAudit ? \"complete-audited-candidate-not-selectable\" : stopped ? \"blocked-resumable\" : stop ? \"controlled-draining\" : finished ? \"incomplete\" : \"running\", scope_audit: scopeAudit } : {}), stopped_reason: stopped, nodes: states,"
    },
    {
      "before": "const ready = graph.nodes.filter(node => pending.has(node.key) && node.dependencies.every(key => outputs.has(key)))",
      "after": "const ready = graph.nodes.filter(node => (!scope || scope.allowedKeys.has(node.key)) && pending.has(node.key) && node.dependencies.every(key => outputs.has(key)))"
    },
    {
      "before": "  if (counts().generated_completed === 2100 && counts().placeholders_completed === 16) { const audit = auditGlobal(graph.nodes, outputs, consistency.identities); save(join(directory, \"global-audit.json\"), audit); }",
      "after": "  if (scope && singlePassScopeProgress(scope, states).scoped_remaining === 0) {\n    try {\n      scopeAudit = auditGlobal(graph.nodes.filter(node => scope.allowedKeys.has(node.key)), outputs, consistency.identities);\n      save(join(directory, \"basic-hu-audit.json\"), { scope: scope.name, ...singlePassScopeProgress(scope, states), audit: scopeAudit });\n    } catch (error) {\n      stopped = \"Scoped audit failed: \" + (error instanceof Error ? error.message : \"unknown audit error\");\n      save(join(directory, \"basic-hu-audit.json\"), { scope: scope.name, status: \"failed\", error: stopped });\n    }\n  }\n  if (counts().generated_completed === 2100 && counts().placeholders_completed === 16) { const audit = auditGlobal(graph.nodes, outputs, consistency.identities); save(join(directory, \"global-audit.json\"), audit); }"
    },
    {
      "before": "finished = true; persist(); console.log(JSON.stringify({ ...counts(), stopped_reason: stopped }));",
      "after": "finished = true; persist(); console.log(JSON.stringify({ ...counts(), ...singlePassScopeProgress(scope, states), stopped_reason: stopped }));"
    }
  ]
} as const;
const digest = (source: string) => createHash("sha256").update(source).digest("hex");
export function runtimeCompatibleSource(file: string, source: string) {
  if (file !== "aiv2-single-pass-runner.ts") return source;
  let actual = digest(source);
  if (actual === scopeCompatibilityReceipt.newRunnerSha256) {
    for (const { before, after } of [...scopeCompatibilityReceipt.changes].reverse()) {
      if (source.split(after).length !== 2) throw new Error("Scope compatibility patch occurrence mismatch");
      source = source.replace(after, before);
    }
    if (digest(source) !== scopeCompatibilityReceipt.oldRunnerSha256) throw new Error("Scope compatibility original source mismatch");
    actual = digest(source);
  }
  const receipt = runtimeCompatibilityReceipt;
  if (actual === receipt.oldRunnerSha256) return source;
  if (actual !== receipt.newRunnerSha256) throw new Error("Unreviewed single-pass runner implementation; runtime compatibility refused");
  let original = source;
  for (const { before, after } of [...receipt.changes].reverse()) {
    if (original.split(after).length !== 2) throw new Error("Runtime compatibility patch occurrence mismatch");
    original = original.replace(after, before);
  }
  if (digest(original) !== receipt.oldRunnerSha256) throw new Error("Runtime compatibility original source mismatch");
  return original;
}

// Scheduling only: retain complete global state, restrict new work to this closed domain.
export type ScopeNode = { key: string; dataset: string; dependencies: string[]; profile?: unknown; spot: { unreachable?: boolean } };
export function singlePassScope(argv: string[], nodes: ScopeNode[]) {
  const name = argv.find(arg => arg.startsWith("--scope="))?.slice("--scope=".length);
  if (name === undefined) return null;
  if (name !== "basic-hu") throw new Error("Unknown single-pass scope: " + name);
  const families = new Set(["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses"]);
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const targets = nodes.filter(node => families.has(node.dataset) && !node.spot.unreachable);
  if (!targets.length) throw new Error("Empty basic-hu target inventory");
  const targetKeys = new Set(targets.map(node => node.key)), allowedKeys = new Set(targetKeys);
  const pending = [...targetKeys];
  while (pending.length) {
    const key = pending.pop()!, node = byKey.get(key);
    if (!node) throw new Error("Missing scoped dependency: " + key);
    for (const dependency of node.dependencies) if (!allowedKeys.has(dependency)) { allowedKeys.add(dependency); pending.push(dependency); }
  }
  const prerequisites = nodes.filter(node => allowedKeys.has(node.key) && !targetKeys.has(node.key));
  if (prerequisites.some(node => node.dataset !== "cold-three-bet-responses" || node.profile || node.spot.unreachable)) throw new Error("Unreviewed basic-hu prerequisite family");
  return { name, targetKeys, allowedKeys, prerequisiteKeys: new Set(prerequisites.map(node => node.key)) };
}
export function singlePassScopeProgress(scope: ReturnType<typeof singlePassScope>, states: Record<string, { status: string }>) {
  if (!scope) return {};
  const count = (keys: Set<string>, status: string) => [...keys].filter(key => states[key]?.status === status).length;
  const completed = count(scope.allowedKeys, "complete");
  return { scope: scope.name, scoped_target_count: scope.targetKeys.size, scoped_target_completed: count(scope.targetKeys, "complete"),
    scoped_prerequisite_count: scope.prerequisiteKeys.size, scoped_prerequisite_completed: count(scope.prerequisiteKeys, "complete"),
    scoped_total_count: scope.allowedKeys.size, scoped_completed: completed, scoped_remaining: scope.allowedKeys.size - completed,
    scoped_running: count(scope.allowedKeys, "running"), scoped_failed: count(scope.allowedKeys, "failed") };
}
