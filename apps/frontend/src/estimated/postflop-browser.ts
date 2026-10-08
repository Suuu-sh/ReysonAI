import type { BalancedFlopBase } from "../../scripts/postflop-ai/flop-base-core.ts";
import type { Candidate, InputOptions, LaterPolicy, PostflopDatasets, SourceDataset, MultiwayCatalog } from "../../scripts/postflop-ai/types.ts";
import type { CandidateSource } from "../../scripts/postflop-ai/candidate-source.ts";
import { normalizedInputOptions } from "../../scripts/postflop-ai/input-options.ts";
import { spotById, type Spot } from "../../scripts/postflop-ai/spots.ts";
export type PostflopSource = { kind: string; spot: Spot; candidate: CandidateSource; laterCandidate?: CandidateSource<LaterPolicy> | null;
  report: Record<string, unknown> | null; laterPolicyError?: { error: string; code: string; state: "not_generated" } };
import multiwayCatalog from "../../scripts/data/hu-after-multiway-spots.json" with { type: "json" };
import { dataset, loadDataset } from "./datasets.ts";
import { postflopApiBase, postflopUrl } from "./postflop-api.ts";
import { canonicalFlop } from "../../scripts/postflop-ai/flop-isomorphism.ts";

const spotRequests = new Map<string, { promise: Promise<PostflopSource | null>; settled: boolean }>();
const flopRequests = new Map<string, Promise<BalancedFlopBase | null>>();

export function loadPostflopFlop(spotId: string, board: string, signal?: AbortSignal): Promise<BalancedFlopBase | null> {
  if (signal?.aborted) return Promise.reject(abortError());
  const flop = canonicalFlop(board).key, key = `${spotId}|${flop}`;
  let request = flopRequests.get(key);
  if (!request) {
    // Share the request, not its caller's abort signal: one cancelled view must not
    // cancel another consumer. Failed/missing entries are not cached indefinitely.
    request = fetch(postflopUrl("flop", { spot: spotId, flop }))
      .then(async response => {
        if (!response.ok) return null;
        const data = await response.json() as BalancedFlopBase;
        return data.spot === spotId && data.flop === flop ? data : null;
      }).catch(() => null).then(data => {
        if (!data && flopRequests.get(key) === request) flopRequests.delete(key);
        return data;
      });
    if (flopRequests.size >= 8) flopRequests.delete(flopRequests.keys().next().value!);
    flopRequests.set(key, request);
  }
  return waitForAbort(request, signal);
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}

function hasCandidate(candidate: CandidateSource | CandidateSource<LaterPolicy> | null | undefined): boolean {
  if (!candidate) return false;
  if ("villain" in candidate) return hasCandidate(candidate.villain) && hasCandidate(candidate.exploit);
  return Boolean(candidate.policy && candidate.metadata);
}

function hasProfilePair(candidate: CandidateSource | CandidateSource<LaterPolicy> | null | undefined): boolean {
  if (!candidate) return false;
  const pair = "villain" in candidate ? candidate : (candidate as Candidate & { profileCandidates?: CandidateSource }).profileCandidates;
  return Boolean(pair && "villain" in pair && hasCandidate(pair.villain) && hasCandidate(pair.exploit));
}

type ProfileStage = "flop" | "later";
type ProfileRole = "villain" | "exploit";

async function publishedProfileCandidate<P>(spot: Spot, profile: string, role: ProfileRole, stage: ProfileStage,
  base: string, signal: AbortSignal): Promise<Candidate<P>> {
  const response = await fetch(postflopUrl("profile-policy", { profile, spot: spot.id, role, stage }, base), { signal });
  const body = await response.json();
  if (!response.ok) {
    const missing = response.status === 404;
    throw Object.assign(new Error(body.error || "Opponent-profile policy could not be loaded."),
      { code: missing ? "PROFILE_POLICY_MISSING" : body.code, state: missing ? "not_generated" : body.state });
  }
  const metadata = body.metadata;
  if (body.kind !== "ai_estimate_not_gto" || body.profile !== profile || body.spot !== spot.id ||
      body.role !== role || body.stage !== stage || !metadata ||
      metadata.profile !== profile || metadata.role !== role || metadata.spot !== spot.id ||
      metadata.tree !== undefined && metadata.tree !== spot.tree ||
      metadata.stage !== undefined && metadata.stage !== stage ||
      typeof metadata.source_hash !== "string" || !metadata.source_hash ||
      typeof metadata.policy_hash !== "string" || !metadata.policy_hash ||
      !body.policy || body.policy.kind !== "ai_estimate_not_gto" ||
      stage === "flop" && !Array.isArray(body.policy.rules) ||
      stage === "later" && (!body.policy.streets?.turn || !body.policy.streets?.river)) {
    throw new Error(`Profile policy identity or format mismatch: ${profile}/${spot.id}/${role}/${stage}`);
  }
  return { metadata, policy: body.policy };
}

async function loadPublishedProfileSpot(spotId: string, profile: string, base: string): Promise<PostflopSource> {
  // Geometry comes from the bundled registry, not from a standard-policy request.
  // Profile publication can therefore stand alone and never substitute standard data.
  const spot = spotById(spotId), signal = new AbortController().signal;
  const pair = async <P>(stage: ProfileStage) => {
    const [villain, exploit] = await Promise.all((["villain", "exploit"] as const)
      .map(role => publishedProfileCandidate<P>(spot, profile, role, stage, base, signal)));
    return { villain, exploit };
  };
  const candidate = await pair<Candidate["policy"]>("flop");
  let laterCandidate: CandidateSource<LaterPolicy> | null = null;
  let laterPolicyError: PostflopSource["laterPolicyError"];
  try { laterCandidate = await pair<LaterPolicy>("later"); }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "PROFILE_POLICY_MISSING" ||
        !("state" in error) || error.state !== "not_generated") throw error;
    laterPolicyError = { error: error.message, code: "PROFILE_POLICY_MISSING", state: "not_generated" };
  }
  return { kind: "ai_estimate_not_gto", spot, candidate, laterCandidate, report: null,
    ...(laterPolicyError ? { laterPolicyError } : {}) };
}

export function loadPostflopSpot(spotId: string, signal?: AbortSignal, options: InputOptions = {},
  apiBase = postflopApiBase()): Promise<PostflopSource | null> {
  if (signal?.aborted) return Promise.reject(abortError());
  let normalized: ReturnType<typeof normalizedInputOptions>;
  let params: Record<string, string>;
  try {
    normalized = normalizedInputOptions(options);
    params = { spot: spotId };
    // Table-only changes reuse the saved standard policies. The compute input
    // options adjust their reach ranges, not their artifact identity.
    if (normalized.opponentProfile !== "standard") {
      params.opponentProfile = normalized.opponentProfile;
      params.opponentSeat = normalized.opponentSeat!;
      params.tableProfile = JSON.stringify(normalized.tableProfile);
    }
  } catch (error) { return Promise.reject(error); }
  const key = `${apiBase ?? ""}|${spotId}|${JSON.stringify(normalized)}`;
  let entry = spotRequests.get(key);
  if (!entry) {
    entry = { promise: Promise.resolve(null), settled: false };
    const current = entry;
    // A shared request has its own signal, so cancelling one view cannot cancel
    // another consumer of the same profile/seat.
    const publishedProfile = Boolean(apiBase && normalized.opponentProfile !== "standard");
    const loadLocalOrStandard = () => fetch(postflopUrl("spot", params, apiBase), { signal: new AbortController().signal })
      .then(async response => {
        const body = await response.json() as PostflopSource & { error?: string; code?: string; state?: string };
        if (!response.ok) throw Object.assign(new Error(body.error || "ポストフロップ候補を読み込めませんでした。"),
          { code: body.code ?? (normalized.opponentProfile !== "standard" && response.status === 404 ? "PROFILE_POLICY_MISSING" : undefined),
            state: body.state ?? (normalized.opponentProfile !== "standard" && response.status === 404 ? "not_generated" : undefined) });
        if (body.kind !== "ai_estimate_not_gto" || body.spot?.id !== spotId ||
            !hasCandidate(body.candidate) || normalized.opponentProfile === "standard" && !body.report) {
          throw new Error("ポストフロップ候補の局面または形式が一致しません。");
        }
        if (normalized.opponentProfile !== "standard" && (!hasProfilePair(body.candidate) ||
            body.laterCandidate && !hasProfilePair(body.laterCandidate))) {
          throw Object.assign(new Error("Opponent-profile policies are not generated; standard policies cannot be substituted."),
            { code: "PROFILE_POLICY_MISSING", state: "not_generated" });
        }
        return body;
      });
    current.promise = Promise.resolve().then(() => publishedProfile
      ? loadPublishedProfileSpot(spotId, normalized.opponentProfile, apiBase!) : loadLocalOrStandard())
      .then(body => {
        current.settled = true;
        // A missing later pair may become available after authoring/publication.
        if ((body.laterPolicyError || normalized.opponentProfile !== "standard" && !body.laterCandidate) &&
            spotRequests.get(key) === current) spotRequests.delete(key);
        return body;
      })
      .catch(error => {
        if (spotRequests.get(key) === current) spotRequests.delete(key);
        throw error;
      });
    spotRequests.set(key, entry);
  }
  return waitForAbort(entry.promise, signal);
}

export function datasetsNeededForSpot(spot: Spot): string[] {
  if ("history" in spot) return ["hu-after-multiway-spots", ...new Set(Object.values(spot.ranges).flatMap(factors => factors.map(([file]) => file)))];
  switch (spot?.kind) {
    case "srp": return ["opening-ranges", "preflop-ranges"];
    case "3bp": return ["opening-ranges", "preflop-ranges", "three-bet-responses"];
    case "4bp": return ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses"];
    case "limp": return spot.responseId === "SB_vs_BB_limp_four_bet"
      ? ["opening-ranges", "limp-responses", "limp-deep-responses"] : ["opening-ranges", "limp-responses"];
    default: throw new Error("このポストフロップ局面に必要なデータセットを特定できません。");
  }
}

function waitForAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(value => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

async function readDataset(name: string, signal?: AbortSignal) {
  if (name === "hu-after-multiway-spots") return multiwayCatalog as unknown as MultiwayCatalog;
  try {
    return dataset<SourceDataset | MultiwayCatalog>(name);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is not loaded")) throw error;
    return waitForAbort(loadDataset<SourceDataset | MultiwayCatalog>(name), signal);
  }
}

export async function loadPostflopDatasets(spot: Spot, signal?: AbortSignal, options: InputOptions = {}): Promise<PostflopDatasets> {
  if (signal?.aborted) throw abortError();
  const normalized = normalizedInputOptions(options);
  const names = datasetsNeededForSpot(spot);
  if (normalized.opponentProfile !== "standard") {
    const opponent = spot[normalized.opponentSeat!];
    // Only the opponent's observed preflop factors use profile datasets. Requiring
    // unused profile files would incorrectly block supported history-type spots.
    const profileNames = "ranges" in spot ? [...new Set(spot.ranges[opponent].map(([file]) => file))]
      : opponent === spot.opener ? ["opening-ranges", ...(spot.kind === "srp" ? [] : ["three-bet-responses"])]
      : ["preflop-ranges", ...(spot.kind === "4bp" ? ["four-bet-responses"] : [])];
    names.push(...profileNames.map(name => `profiles/${normalized.opponentProfile}/villain/${name}`));
  }
  const values = await Promise.all(names.map(async name => [name, await readDataset(name, signal)] as const));
  if (signal?.aborted) throw abortError();
  return Object.fromEntries(values);
}

export function deferPostflopCalculation<T>(calculate: () => T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) { reject(abortError()); return; }
      try { resolve(calculate()); } catch (error) { reject(error); }
    }, 0);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
