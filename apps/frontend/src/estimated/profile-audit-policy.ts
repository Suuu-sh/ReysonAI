// The existing Stage 2 audit policy remains unchanged. Behavioral profile
// strength-order warnings are advisory; errors always remain blocking.
import { isBlockingAuditFinding as balancedFinding } from "./audit-policy.ts";
export { BALANCE_CHECKS } from "./audit-policy.ts";
export const isBlockingAuditFinding = finding => finding.severity === "error" ||
  (finding.check !== "profile-strength-order" && balancedFinding(finding));
