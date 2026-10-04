// Small shared policy: orchestration must not retain the full range catalog
// while child authoring/audit processes hold their own large datasets.
export const BALANCE_CHECKS = Object.freeze(["range-capped", "over-segregated"]);
const ADVISORY_CHECKS = [...BALANCE_CHECKS, "cross-strength-inversion", "negative-ev-call", "ev-capacity-conflict"];
export const isBlockingAuditFinding = finding => finding.severity === "error" || !ADVISORY_CHECKS.includes(finding.check);
