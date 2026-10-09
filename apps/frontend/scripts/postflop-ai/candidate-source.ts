import type { Candidate, FlopPolicy, Inputs, LaterPolicy } from "./types.ts";
import { sha } from "./browser-inputs.ts";
import { nodeRole, validatePolicy } from "./policy.ts";
import { laterNodeRole } from "./later-tree.ts";
import { validateLaterPolicy } from "./later-policy.ts";

export type ProfileCandidates<P = FlopPolicy> = { villain: Candidate<P>; exploit: Candidate<P> };
export type CandidateSource<P = FlopPolicy> = Candidate<P> | ProfileCandidates<P>;
export type ResolvedCandidate<P = FlopPolicy> = Candidate<P> & { profileCandidates?: ProfileCandidates<P> };
export type ProfileRole = keyof ProfileCandidates;

export const isOpponentMode = (inputs: Inputs): boolean => Boolean(inputs.opponentProfile && inputs.opponentProfile !== "standard");

// A legacy candidate has no structural hash. Only a matching full fingerprint can
// prove which geometry it came from: never bless an arbitrary old source hash with
// the current geometry. This compatibility check does not rewrite saved artifacts.
export function matchesCandidateSource(inputs: Inputs, candidate: Candidate<unknown>): boolean {
  const metadata = candidate?.metadata;
  if (!metadata || typeof metadata.source_hash !== "string" || !metadata.source_hash) return false;
  if (!inputs.adjusted) return metadata.source_hash === inputs.fingerprint;
  const savedStructure = metadata.structure_hash ??
    (metadata.source_hash === inputs.fingerprint || typeof inputs.baselineFingerprint === "string" && metadata.source_hash === inputs.baselineFingerprint ? inputs.structure_hash : null);
  return savedStructure === inputs.structure_hash;
}

export function validateFlopCandidate(inputs: Inputs, candidate: Candidate): Candidate {
  if (!matchesCandidateSource(inputs, candidate) ||
      (candidate.metadata.spot ?? inputs.spot.id) !== inputs.spot.id ||
      (candidate.metadata.tree ?? inputs.spot.tree) !== inputs.spot.tree) throw new Error("ローカル候補の入力または方針ハッシュが一致しません。 AI policy source is stale");
  const policy = validatePolicy(candidate.policy, inputs.spot.tree);
  if (candidate.metadata.policy_hash !== sha(policy)) throw new Error("ローカル候補の入力または方針ハッシュが一致しません。 Saved AI policy hash does not match its content");
  return candidate;
}

export function validateLaterCandidate(inputs: Inputs, candidate: Candidate<LaterPolicy>, flopCandidate: Candidate): Candidate<LaterPolicy> {
  if (!matchesCandidateSource(inputs, candidate) || !matchesCandidateSource(inputs, flopCandidate) ||
      flopCandidate.metadata.policy_hash !== sha(flopCandidate.policy) ||
      candidate.metadata.flop_policy_hash !== flopCandidate.metadata.policy_hash ||
      (candidate.metadata.spot ?? inputs.spot.id) !== inputs.spot.id) throw new Error("Later AI policy source or flop policy is stale");
  const policy = validateLaterPolicy(candidate.policy);
  if (candidate.metadata.policy_hash !== sha(policy)) throw new Error("Saved later AI policy hash does not match its content");
  return candidate;
}

function profileError(inputs: Inputs, stage: string, role?: ProfileRole): Error & { code: string } {
  return Object.assign(new Error(`${inputs.opponentProfile}/${inputs.spot.slug}: ${role ? `${role} ` : ""}${stage} profile policy is not generated`),
    { code: "PROFILE_POLICY_MISSING", state: "not_generated" });
}

function profilePair<P>(inputs: Inputs, candidate: CandidateSource<P> | null | undefined, stage: string): ProfileCandidates<P> {
  const pair = candidate && "villain" in candidate ? candidate : (candidate as ResolvedCandidate<P> | null | undefined)?.profileCandidates;
  if (!pair) throw profileError(inputs, stage);
  for (const role of ["villain", "exploit"] as const) {
    if (!pair[role]) throw profileError(inputs, stage, role);
    const metadata = pair[role].metadata;
    if (metadata?.source_hash !== inputs.profileSourceHash ||
        metadata?.opponent_seat !== undefined && metadata.opponent_seat !== inputs.opponentSeat ||
        metadata?.opponentSeat !== undefined && metadata.opponentSeat !== inputs.opponentSeat) {
      throw profileError(inputs, stage, role);
    }
    if (metadata?.profile !== undefined && metadata.profile !== inputs.opponentProfile ||
        metadata?.role !== undefined && metadata.role !== role) throw new Error(`Profile policy identity mismatch: ${stage}/${role}`);
  }
  if (!inputs.opponentSeat) throw new Error("An opponent profile requires opponentSeat (ip or oop)");
  return pair;
}

function composed<P>(inputs: Inputs, pair: ProfileCandidates<P>, policy: P, extra: Record<string, unknown> = {}): ResolvedCandidate<P> {
  return { policy, profileCandidates: pair, metadata: {
    source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash, policy_hash: sha(policy),
    spot: inputs.spot.id, tree: inputs.spot.tree, config_version: inputs.config.version,
    profile: inputs.opponentProfile, opponentSeat: inputs.opponentSeat,
    role_policy_hashes: { villain: pair.villain.metadata.policy_hash, exploit: pair.exploit.metadata.policy_hash }, ...extra,
  } };
}

// Each role file uses the ordinary complete policy schema. Selecting rules by
// node role keeps existing engine/view APIs unchanged and never borrows a missing
// role's strategy from standard (or from the other role).
export function resolveFlopCandidate(inputs: Inputs, candidate: CandidateSource): ResolvedCandidate {
  if (!isOpponentMode(inputs)) return validateFlopCandidate(inputs, candidate as Candidate);
  const pair = profilePair(inputs, candidate, "flop");
  for (const role of ["villain", "exploit"] as const) validateFlopCandidate(inputs, pair[role]);
  const policy: FlopPolicy = { version: 1, kind: "ai_estimate_not_gto", rules: [
    ...pair.villain.policy.rules.filter(rule => nodeRole(rule.node) === inputs.opponentSeat),
    ...pair.exploit.policy.rules.filter(rule => nodeRole(rule.node) !== inputs.opponentSeat),
  ] };
  validatePolicy(policy, inputs.spot.tree);
  return composed(inputs, pair, policy);
}

export function resolveLaterCandidate(inputs: Inputs, candidate: CandidateSource<LaterPolicy> | null | undefined,
  flopCandidate: ResolvedCandidate): ResolvedCandidate<LaterPolicy> {
  if (!isOpponentMode(inputs)) {
    if (!candidate) throw Object.assign(new Error("ターン・リバーのAI方針がありません。"), { code: "LATER_POLICY_MISSING" });
    return validateLaterCandidate(inputs, candidate as Candidate<LaterPolicy>, flopCandidate);
  }
  const pair = profilePair(inputs, candidate, "turn/river");
  const flopPair = profilePair(inputs, flopCandidate, "flop");
  for (const role of ["villain", "exploit"] as const) validateLaterCandidate(inputs, pair[role], flopPair[role]);
  const streets = Object.fromEntries((["turn", "river"] as const).map(street => [street, { rules: [
    ...pair.villain.policy.streets[street].rules.filter(rule => laterNodeRole(rule.node) === inputs.opponentSeat),
    ...pair.exploit.policy.streets[street].rules.filter(rule => laterNodeRole(rule.node) !== inputs.opponentSeat),
  ] }])) as LaterPolicy["streets"];
  const policy: LaterPolicy = { version: 1, kind: "ai_estimate_not_gto", streets };
  validateLaterPolicy(policy);
  return composed(inputs, pair, policy, { flop_policy_hash: flopCandidate.metadata.policy_hash });
}

// Transport/storage key, also suitable for a future D1 artifact_key. Standard
// publication and the current D1 (spot_id, stage) table are deliberately unchanged.
export function profileArtifactKey(spot: { slug: string }, kind: "candidate" | "laterCandidate",
  profile: string, role: ProfileRole): string {
  if (!["nit", "station", "lag", "maniac"].includes(profile) || !["villain", "exploit"].includes(role)) throw new Error("Invalid profile policy key");
  if (!/^[a-zA-Z0-9_-]+$/.test(spot.slug)) throw new Error("Invalid profile policy slug");
  return `profiles/${profile}/${spot.slug}-${role}-${kind === "candidate" ? "policy" : "later-policy"}`;
}
