// One explicitly selected existing decision/request. No implicit three-job loop.
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { postflopHash } from "./aiv2-postflop.ts";
import { createAiv2SessionProvider } from "./lib/aiv2-provider-session.ts";
import type { SessionMetric } from "./lib/aiv2-provider-session.ts";
import { AMENDMENT_TARGETS, AMENDMENT_METHOD, prepareReasonAmendment, validateReasonAmendmentResponse, buildReasonAmendment, validateReasonAmendment, rawSha256 } from "./aiv2-postflop-reason-amendments.ts";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const frontend = join(root, "apps/frontend");
export async function runReasonAmendment(argv: string[]) {
  const decision = argv.find(arg => arg.startsWith("--decision="))?.slice("--decision=".length);
  if (!decision) {
    if (argv.includes("--generate")) throw new Error("An exact allowlisted --decision is required");
    console.log(JSON.stringify({ status: "dry-no-generation", targets: AMENDMENT_TARGETS.map(t => ({ decision_id: t.decision_id, finding_id: t.finding_id, scope: t.kind, combos: t.combos })) })); return;
  }
  if (!AMENDMENT_TARGETS.some(t => t.decision_id === decision)) throw new Error("Decision is outside the three reviewed amendment targets");
  const implementation = postflopHash(["aiv2-postflop-reason-amendments.ts", "aiv2-postflop-amend-cli.ts"].map(f => readFileSync(join(frontend, "scripts", f), "utf8")));
  const candidate = join(frontend, "candidates/aiv2-postflop/llm-postflop-single-response-v1");
  const originalPath = join(candidate, "decisions", decision + ".json"), reportPath = join(root, "docs/qa/aiv2-postflop-checkthrough-review.json");
  const context = prepareReasonAmendment(readFileSync(originalPath, "utf8"), readFileSync(reportPath, "utf8"), implementation);
  const directory = join(candidate, "reason-amendments");
  // Cache is content-addressed and pending review. A diagnostic is NOT an overlay.
  const saved: Array<{path:string; revision:any}> = [];
  for (const kind of ["revisions", "diagnostics"]) {
    const folder = join(directory, kind); if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter(f => /^[a-f0-9]{64}\.json$/.test(f))) {
      const path = join(folder, file), revision = JSON.parse(readFileSync(path, "utf8"));
      if (revision.base?.decision_id !== decision) continue;
      if (revision.request_id !== context.request_id) throw new Error("Existing amendment identity changed; no implicit regeneration");
      validateReasonAmendment(revision, context);
      if (file !== revision.revision_id + ".json") throw new Error("Amendment cache filename/content mismatch");
      saved.push({ path, revision });
    }
  }
  if (saved.length > 1) throw new Error("Ambiguous immutable amendment cache");
  if (saved.length) {
    const { path, revision } = saved[0];
    console.log(JSON.stringify({ status: revision.approval_status, request_id: context.request_id, revision_id: revision.revision_id, path, raw_file_sha256: rawSha256(readFileSync(path)), cached: true }));
    if (revision.approval_status === "requires-policy-regeneration") process.exitCode = 2;
    return;
  }
  const info = { status: "not-generated", request_id: context.request_id, decision_id: decision, finding_id: context.target.finding_id, scope: context.scope, implementation_hash: implementation, prompt_bytes: Buffer.byteLength(context.prompt), schema_hash: postflopHash(context.schema), model: "gpt-6.1-sol", effort: "medium" };
  if (!argv.includes("--generate")) { console.log(JSON.stringify({ ...info, ...(argv.includes("--prompt") ? { prompt: context.prompt, schema: context.schema } : {}) })); return; }
  if (!argv.includes("--confirm-one-decision-amendment")) throw new Error("Use --generate --confirm-one-decision-amendment for exactly one selected decision");
  let stop = false, effectivePrompt = context.prompt;
  const drain = () => { stop = true; }; process.once("SIGTERM", drain);
  const metrics: SessionMetric[] = [], provider = createAiv2SessionProvider({ concurrency: 1, timeoutMs: 600_000, onMetric: metric => metrics.push(metric) });
  try {
    const raw = await provider.withSession(async session => {
      let issue = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        if (stop) throw new Error("controlled_stop_requested");
        effectivePrompt = context.prompt + (attempt ? "\nThe previous response was structurally invalid: " + issue + ". Correct the JSON/allowed patch shape only. BOTH assessments remain valid; do NOT convert a policy-change-required assessment into unchanged frequencies to satisfy validation." : "");
        let value: unknown;
        try { value = await session.run(effectivePrompt, { model: "gpt-6.1-sol", effort: "medium", outputSchema: context.schema }); }
        catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "invalid_json") throw error; issue = "invalid JSON"; continue; }
        try { return validateReasonAmendmentResponse(value, context); }
        catch (error) { issue = error instanceof Error ? error.message : "invalid response"; }
      }
      throw new Error("Bounded reason-amendment validation failed: " + issue);
    });
    const fresh = prepareReasonAmendment(readFileSync(originalPath, "utf8"), readFileSync(reportPath, "utf8"), implementation);
    if (fresh.request_id !== context.request_id) throw new Error("Original/report changed during amendment request");
    const metric = metrics.at(-1); if (!metric) throw new Error("No actual provider attestation");
    const revision = buildReasonAmendment(raw, context, metric, effectivePrompt);
    validateReasonAmendment(revision, context);
    const folder = join(directory, revision.approval_status === "requires-policy-regeneration" ? "diagnostics" : "revisions");
    mkdirSync(folder, { recursive: true }); const path = join(folder, revision.revision_id + ".json");
    const serialized = JSON.stringify(revision) + "\n";
    writeFileSync(path, serialized, { flag: "wx" });
    console.log(JSON.stringify({ ...info, status: revision.approval_status, assessment: revision.source_response.assessment, revision_id: revision.revision_id, path, raw_file_sha256: rawSha256(serialized), metrics }));
    if (revision.approval_status === "requires-policy-regeneration") process.exitCode = 2;
  } finally { await provider.drain(); process.removeListener("SIGTERM", drain); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runReasonAmendment(process.argv.slice(2));
