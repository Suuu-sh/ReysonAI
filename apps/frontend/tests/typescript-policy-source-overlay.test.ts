// Independent synthetic contract fixtures only. No fixture review is installed
// in the repository, and none grants strategy, runtime, or release approval.
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Proposal = typeof import("../../../configs/typescript-policy-source-migration-proposal.json");
type Binding = Omit<Proposal["sources"][number], "legacy_source">;
type PolicyApi = { policySourceBytes(name: string, options?: { receipt?: unknown }): Buffer };
type SyntheticReview = {
  schema_version: number; kind: string; status: string; scope: string;
  reviewer: string; reviewer_model: string; reviewer_task: string; baseline_commit: string;
  prior_receipt_sha256: string; proposal_sha256: string; adapter_sha256: string; evidence_sha256: string;
  sources: Binding[]; approve_all?: boolean;
};
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const ADAPTER = "apps/frontend/scripts/lib/typescript-policy-source.ts";
const PRIOR = "configs/typescript-policy-source.review.json";
const PROPOSAL = "configs/typescript-policy-source-migration-proposal.json";
const REVIEW = "configs/typescript-policy-source-migration.review.json";
const EVIDENCE = "apps/frontend/docs/mw3-source-identity/typescript-policy-source-parity.json";
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8"));

async function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(tmpdir(), "policy-overlay-SYNTHETIC-review-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative: string, body: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), body);
  };
  for (const file of [ADAPTER, PRIOR, PROPOSAL, EVIDENCE]) put(file, fs.readFileSync(path.join(repository, file)));
  const proposal = readJson<Proposal>(path.join(root, PROPOSAL));
  for (const source of proposal.sources) {
    const file = `apps/frontend/${source.current_path}`;
    put(file, fs.readFileSync(path.join(repository, file)));
  }
  const review: SyntheticReview = {
    schema_version: 1, kind: "typescript-policy-source-independent-migration-review", status: "approved",
    scope: "source-only-no-strategy-or-runtime-renewal", reviewer: "SYNTHETIC TEST FIXTURE ONLY NOT REAL APPROVAL",
    reviewer_model: "gpt-6-astra", reviewer_task: "synthetic-contract-fixture-not-real-review",
    baseline_commit: proposal.baseline_commit,
    prior_receipt_sha256: sha(fs.readFileSync(path.join(root, PRIOR))),
    proposal_sha256: sha(fs.readFileSync(path.join(root, PROPOSAL))),
    adapter_sha256: sha(fs.readFileSync(path.join(root, ADAPTER))),
    evidence_sha256: sha(fs.readFileSync(path.join(root, EVIDENCE))),
    sources: proposal.sources.map(({ legacy_source, ...binding }) => binding),
  };
  const saveReview = () => put(REVIEW, JSON.stringify(review));
  saveReview();
  const api: PolicyApi = await import(pathToFileURL(path.join(root, ADAPTER)).href);
  const chosen = proposal.sources.find(source => source.historical_name === "scripts/generate-continuation-responses.mjs");
  assert.ok(chosen);
  const raw = fs.readFileSync(path.join(root, "apps/frontend", chosen.current_path));
  assert.notEqual(sha(raw), chosen.legacy_sha256);
  return { root, put, proposal, review, saveReview, api, chosen, raw, output: () => api.policySourceBytes(chosen.historical_name) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

test("synthetic reviewed default maps all 34 exact pairs including 5 previously raw sources", async t => {
  const f = await fixture(t);
  assert.equal(f.proposal.sources.length, 34);
  assert.equal(f.proposal.sources.filter(source => !source.inherited).length, 5);
  for (const source of f.proposal.sources) assert.equal(sha(f.api.policySourceBytes(source.historical_name)), source.legacy_sha256);
});
const mutations: [string, (f: Fixture) => void][] = [
  ["missing review", f => fs.unlinkSync(path.join(f.root, REVIEW))],
  ["pending status", f => { f.review.status = "pending"; f.saveReview(); }],
  ["wrong model", f => { f.review.reviewer_model = "other"; f.saveReview(); }],
  ["wrong raw adapter binding", f => { f.review.adapter_sha256 = "0".repeat(64); f.saveReview(); }],
  ["unknown review field", f => { f.review.approve_all = true; f.saveReview(); }],
  ["dropped accepted source", f => { f.review.sources.pop(); f.saveReview(); }],
  ["unmatched source binding", f => { f.review.sources[0].current_sha256 = "0".repeat(64); f.saveReview(); }],
  ["evidence drift", f => f.put(EVIDENCE, "{}\n")],
  ["proposal drift", f => f.put(PROPOSAL, JSON.stringify({ ...f.proposal, status: "approved" }))],
  ["prior receipt drift", f => f.put(PRIOR, "{}\n")],
  ["adapter drift after cached import", f => f.put(ADAPTER, fs.readFileSync(path.join(f.root, ADAPTER), "utf8") + "\n")],
];
for (const [name, mutate] of mutations) test(`default overlay rejects ${name} and returns actual current bytes`, async t => {
  const f = await fixture(t);
  assert.equal(sha(f.output()), f.chosen.legacy_sha256);
  mutate(f);
  assert.deepEqual(f.output(), f.raw);
});
test("current source drift is returned raw, never historical", async t => {
  const f = await fixture(t), changed = Buffer.concat([f.raw, Buffer.from("\n// unreviewed")]);
  f.put(`apps/frontend/${f.chosen.current_path}`, changed);
  assert.deepEqual(f.output(), changed);
});
test("custom supplied receipt is not silently overlaid", async t => {
  const f = await fixture(t);
  assert.deepEqual(f.api.policySourceBytes(f.chosen.historical_name, { receipt: { schema_version: 1, sources: {} } }), f.raw);
});
for (const missingReview of [true, false]) test(`ghost old JavaScript cannot hide changed live TypeScript ${missingReview ? "when overlay is missing" : "under valid overlay"}`, async t => {
  const f = await fixture(t);
  const prior = readJson<{ sources: Record<string, { path: string; current_sha256: string }> }>(path.join(f.root, PRIOR));
  const old = prior.sources[f.chosen.historical_name];
  const ghost = execFileSync("git", ["show", `${f.proposal.baseline_commit}:apps/frontend/${old.path}`], { cwd: repository });
  assert.equal(sha(ghost), old.current_sha256);
  f.put(`apps/frontend/${old.path}`, ghost);
  const changed = Buffer.concat([f.raw, Buffer.from("\n// changed live typed source")]);
  f.put(`apps/frontend/${f.chosen.current_path}`, changed);
  if (missingReview) fs.unlinkSync(path.join(f.root, REVIEW));
  assert.deepEqual(f.output(), changed);
});
