// Exact reviewed source-only overlays retain historical reason identities, not
// stale strategies. Custom caller receipts remain independent of the overlay.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import compatibilityReceipt from "../../../../configs/typescript-policy-source.review.json" with { type: "json" };

const PROJECT = new URL("../../../../", import.meta.url);
const FRONTEND = new URL("../../", import.meta.url);
const PRIOR = "configs/typescript-policy-source.review.json";
const PROPOSAL = "configs/typescript-policy-source-migration-proposal.json";
const REVIEW = "configs/typescript-policy-source-migration.review.json";
const EVIDENCE = "apps/frontend/docs/mw3-source-identity/typescript-policy-source-parity.json";
const ADAPTER = "apps/frontend/scripts/lib/typescript-policy-source.ts";
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const exactKeys = (value: any, keys: string[]) => value && typeof value === "object" && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
const safe = (path: unknown): path is string => typeof path === "string" && /^[A-Za-z0-9_./-]+$/.test(path)
  && !path.startsWith("/") && path.split("/").every(part => part && part !== "." && part !== "..");
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const relocated = (path: string) => path.replace(/\.(?:mjs|js)$/, ".ts");

function approvedOverlay(): Map<string, any> | null {
  try {
    // Read exact current files on every invocation: an ESM cache must not hide
    // later receipt/proposal/evidence/helper changes from the freshness gate.
    const priorBytes = readFileSync(new URL(PRIOR, PROJECT)), proposalBytes = readFileSync(new URL(PROPOSAL, PROJECT));
    const reviewBytes = readFileSync(new URL(REVIEW, PROJECT)), evidenceBytes = readFileSync(new URL(EVIDENCE, PROJECT));
    const prior = JSON.parse(priorBytes.toString()), proposal = JSON.parse(proposalBytes.toString()), review = JSON.parse(reviewBytes.toString());
    if (!same(prior, compatibilityReceipt) || !exactKeys(proposal, ["schema_version", "kind", "status", "baseline_commit", "prior_receipt_sha256", "sources"])
      || proposal.schema_version !== 1 || proposal.kind !== "typescript-policy-source-migration-proposal" || proposal.status !== "unapproved-proposal"
      || !/^[a-f0-9]{40}$/.test(proposal.baseline_commit) || proposal.prior_receipt_sha256 !== digest(priorBytes)) return null;
    if (!exactKeys(review, ["schema_version", "kind", "status", "scope", "reviewer", "reviewer_model", "reviewer_task", "baseline_commit", "prior_receipt_sha256", "proposal_sha256", "adapter_sha256", "evidence_sha256", "sources"])
      || review.schema_version !== 1 || review.kind !== "typescript-policy-source-independent-migration-review" || review.status !== "approved"
      || review.scope !== "source-only-no-strategy-or-runtime-renewal" || review.reviewer_model !== "gpt-6-astra"
      || typeof review.reviewer !== "string" || !review.reviewer.trim() || typeof review.reviewer_task !== "string" || !review.reviewer_task.trim()
      || review.baseline_commit !== proposal.baseline_commit || review.prior_receipt_sha256 !== digest(priorBytes)
      || review.proposal_sha256 !== digest(proposalBytes) || review.adapter_sha256 !== digest(readFileSync(new URL(ADAPTER, PROJECT)))
      || review.evidence_sha256 !== digest(evidenceBytes) || !Array.isArray(proposal.sources) || !proposal.sources.length
      || !Array.isArray(review.sources) || review.sources.length !== proposal.sources.length) return null;
    const sources = new Map<string, any>();
    for (const [index, record] of proposal.sources.entries()) {
      if (!exactKeys(record, ["historical_name", "current_path", "current_sha256", "current_bytes", "baseline_path", "baseline_sha256", "baseline_bytes", "inherited", "legacy_sha256", "legacy_bytes", "legacy_source"])
        || !safe(record.historical_name) || !safe(record.current_path) || !safe(record.baseline_path) || sources.has(record.historical_name)
        || record.current_path !== relocated(record.baseline_path) || !hash(record.current_sha256) || !hash(record.baseline_sha256) || !hash(record.legacy_sha256)
        || ![record.current_bytes, record.baseline_bytes, record.legacy_bytes].every(value => Number.isSafeInteger(value) && value > 0)
        || typeof record.inherited !== "boolean" || typeof record.legacy_source !== "string") return null;
      const { legacy_source, ...binding } = record;
      if (!same(review.sources[index], binding) || digest(legacy_source) !== record.legacy_sha256 || Buffer.byteLength(legacy_source) !== record.legacy_bytes) return null;
      const previous = prior.sources[record.historical_name];
      if (record.inherited ? !previous || record.baseline_path !== previous.path || record.baseline_sha256 !== previous.current_sha256
        || legacy_source !== previous.legacy_source || record.legacy_sha256 !== previous.legacy_sha256
        : previous || record.legacy_sha256 !== record.baseline_sha256 || record.legacy_bytes !== record.baseline_bytes) return null;
      sources.set(record.historical_name, record);
    }
    if (Object.keys(prior.sources).some(name => !sources.get(name)?.inherited)) return null;
    return sources;
  } catch { return null; } // Missing/unapproved/drifted overlay never grants a historical identity.
}

function currentBytes(path: string, root: URL): Buffer {
  const location = new URL(path, root);
  // Location-only migration support is not identity compatibility. The returned
  // bytes are still compared to an exact independently reviewed current SHA.
  return readFileSync(!existsSync(location) && relocated(path) !== path ? new URL(relocated(path), root) : location);
}
export function policySourceBytes(name: string, options: { root?: URL; receipt?: any } = {}): Buffer {
  const { root = FRONTEND, receipt = compatibilityReceipt } = options;
  if (!Object.hasOwn(options, "receipt")) {
    const approved = approvedOverlay()?.get(name);
    if (approved) {
      const current = currentBytes(approved.current_path, root);
      return current.length === approved.current_bytes && digest(current) === approved.current_sha256
        ? Buffer.from(approved.legacy_source, "utf8") : current;
    }
  }
  const record = receipt.schema_version === 1 ? receipt.sources[name] : null;
  const sourcePath = record?.path ?? name;
  // Default known historical records must inspect the live TypeScript source,
  // even if somebody reintroduces a stale file under its old JavaScript name.
  // Explicit fixture receipts retain their original source-location semantics.
  const physicalPath = Object.hasOwn(options, "receipt") ? sourcePath : record ? relocated(sourcePath)
    : existsSync(new URL(relocated(sourcePath), root)) ? relocated(sourcePath) : sourcePath;
  const current = currentBytes(physicalPath, root);
  if (!record || digest(current) !== record.current_sha256) return current;
  const legacy = Buffer.from(record.legacy_source, "utf8");
  return digest(legacy) === record.legacy_sha256 ? legacy : current;
}
