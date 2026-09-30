import { computeFlopHandEv, computeLaterHandEv } from "./postflop-compute.ts";
import { dataset, loadDataset } from "./datasets.ts";
import { postflopUrl } from "./postflop-api.ts";

const spotRequests = new Map<string, { promise: Promise<any>; settled: boolean }>();

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
        const body = await response.json();
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

export function datasetsNeededForSpot(spot: any): string[] {
  switch (spot?.kind) {
    case "srp": return ["opening-ranges", "preflop-ranges"];
    case "3bp": return ["opening-ranges", "preflop-ranges", "three-bet-responses"];
    case "4bp": return ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses"];
    case "limp": return ["opening-ranges", "limp-responses"];
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
    return dataset(name);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("is not loaded")) throw error;
    return waitForAbort(loadDataset(name), signal);
  }
}

export async function loadPostflopDatasets(spot: any, signal?: AbortSignal) {
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

export function computePostflopHandEvInWorker(input: any, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) return Promise.reject(abortError());
  const envelope = (result: any) => ({ spot: input.spotId, hand: input.hand, kind: "ai_estimate_not_gto", ...result });
  const calculate = () => envelope(input.street === "flop" ? computeFlopHandEv(input) : computeLaterHandEv(input));
  if (typeof Worker === "undefined") return deferPostflopCalculation(calculate, signal);

  let worker: Worker;
  try {
    worker = new Worker(new URL("./postflop-compute.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return deferPostflopCalculation(calculate, signal);
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => { cleanup(); reject(abortError()); };
    worker.onmessage = event => {
      cleanup();
      if (event.data?.ok) resolve(envelope(event.data.result));
      else reject(new Error(event.data?.error || "手ごとのEVを計算できませんでした。"));
    };
    worker.onerror = event => {
      cleanup();
      reject(new Error(event.message || "手ごとのEV計算を開始できませんでした。"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    try { worker.postMessage(input); }
    catch (error) { cleanup(); reject(error); }
  });
}

export function computeLaterHandEvInWorker(input: any, signal?: AbortSignal): Promise<any> {
  return computePostflopHandEvInWorker({ ...input, street: input.street ?? (input.river ? "river" : "turn") }, signal);
}
