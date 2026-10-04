// Build-owned approval pins. Artifact metadata, URLs and database rows cannot
// authorize a policy. This intentionally empty list does not activate MW3.
export type Mw3ApprovedPolicy = {
  spotId: string;
  stage: "flop" | "later";
  deliveryHash: string;
  implementationHash: string;
  policyHash: string;
  sourceHash: string;
};
export const MW3_APPROVED_POLICIES: readonly Mw3ApprovedPolicy[] = Object.freeze([]);
