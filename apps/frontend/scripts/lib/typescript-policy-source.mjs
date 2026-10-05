// Reviewed type-only migrations keep historical reason identities, not stale
// strategies. The receipt is itself bound by the exact reviewed source graph.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import compatibilityReceipt from "../../../../configs/typescript-policy-source.review.json" with { type: "json" };

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export function policySourceBytes(name, { root = new URL("../../", import.meta.url), receipt = compatibilityReceipt } = {}) {
  const record = receipt.schema_version === 1 ? receipt.sources[name] : null;
  const current = readFileSync(new URL(record?.path ?? name, root));
  if (!record || digest(current) !== record.current_sha256) return current;
  const legacy = Buffer.from(record.legacy_source, "utf8");
  return digest(legacy) === record.legacy_sha256 ? legacy : current;
}
