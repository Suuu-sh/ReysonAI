import type { BalancedFlopBase } from "../../scripts/postflop-ai/flop-base-core.ts";
import type { Candidate, LaterPolicy, PostflopDatasets, SourceDataset } from "../../scripts/postflop-ai/types.ts";
import type { Spot } from "../../scripts/postflop-ai/spots.ts";
export type PostflopSource = { kind: string; spot: Spot; candidate: Candidate; laterCandidate?: Candidate<LaterPolicy> | null; report: Record<string, unknown> };
import { dataset, loadDataset } from "./datasets.ts";
import { postflopUrl } from "./postflop-api.ts";
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

export function loadPostflopSpot(spotId: string, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  let entry = spotRequests.get(spotId);
  if (!entry) {
    entry = { promise: Promise.resolve(null), settled: false };
    const current = entry;
    const onAbort = () => {
      if (!current.settled && spotRequests.get(spotId) === current) spotRequests.delete(spotId);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    current.promise = fetch(postflopUrl("spot", { spot: spotId }), { signal })
      .then(async response => {
        const body = await response.json() as PostflopSource & { error?: string };
        if (!response.ok) throw new Error(body.error || "ポストフロップ候補を読み込めませんでした。");
        if (body.kind !== "ai_estimate_not_gto" || body.spot?.id !== spotId ||
            !body.candidate?.policy || !body.candidate?.metadata || !body.report) {
          throw new Error("ポストフロップ候補の局面または形式が一致しません。");
        }
        return body;
      })
      .then(body => {
        current.settled = true;
        signal?.removeEventListener("abort", onAbort);
        return body;
      })
      .catch(error => {
        signal?.removeEventListener("abort", onAbort);
        if (isAbortError(error) && spotRequests.get(spotId) === current) spotRequests.delete(spotId);
        throw error;
      });
    spotRequests.set(spotId, entry);
  }
  return entry.promise;
}

export function datasetsNeededForSpot(spot: Spot): string[] {
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
  try {
    return dataset<SourceDataset>(name);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is not loaded")) throw error;
    return waitForAbort(loadDataset<SourceDataset>(name), signal);
  }
}

export async function loadPostflopDatasets(spot: Spot, signal?: AbortSignal) {
  const names = datasetsNeededForSpot(spot);
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
