import { MW3_APPROVED_POLICIES, type Mw3ApprovedPolicy } from "../../../shared/mw3-approved.ts";
import { buildMw3BrowserInputs, verifyMw3BrowserCandidate } from "../../scripts/postflop-ai/mw3-browser-inputs.mjs";
import { mw3TextSha } from "../../scripts/postflop-ai/mw3-delivery.mjs";
import { loadDataset } from "./datasets.ts";

export type Mw3Kit = { kind: "mw3_srp"; spotId: string; inputs: any; policies: { flop: any; later: any } };
export type Mw3Availability = "unapproved" | "unavailable" | "stale";
export class Mw3UnavailableError extends Error {
  reason: Mw3Availability;
  constructor(reason: Mw3Availability, message = "Saved three-player strategy is unavailable") { super(message); this.reason = reason; }
}
const verifiedKits = new WeakSet<object>();
function freezeVerified(value: any, seen = new WeakSet<object>()): any {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) freezeVerified(item, seen);
  return Object.freeze(value);
}
export function isVerifiedMw3Kit(value: unknown): value is Mw3Kit {
  return Boolean(value && typeof value === "object" && verifiedKits.has(value as object));
}
const HASH = /^[a-f0-9]{64}$/;
const names = ["opening-ranges", "preflop-ranges", "multiway-responses"];
export function mw3DeliveryUrl(route: "manifest" | "part", params: Record<string, string>, base = (import.meta as any).env?.VITE_API_BASE): string {
  return `${String(base ?? "").replace(/\/$/, "")}/v1/mw3/${route}?${new URLSearchParams(params)}`;
}
export async function readMw3ResponseText(response: Response, limit = 200_000): Promise<string> {
  if (!response.ok || !response.body || !Number.isInteger(limit) || limit < 1) {
    await response.body?.cancel();
    throw new Mw3UnavailableError("unavailable");
  }
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > limit) {
    await response.body.cancel();
    throw new Mw3UnavailableError("unavailable");
  }
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const text: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Mw3UnavailableError("unavailable");
      }
      text.push(decoder.decode(value, { stream: true }));
    }
    text.push(decoder.decode());
    return text.join("");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
async function readText(url: string): Promise<string> {
  return readMw3ResponseText(await fetch(url, { signal: AbortSignal.timeout(30_000) }));
}
export type Mw3DeliveryClient = {
  supportsSpot(spotId: string): boolean;
  touchSpot?(spotId: string): void;
  load(spotId: string, signal?: AbortSignal): Promise<Mw3Kit>;
};
function abortError() { return new DOMException("The operation was aborted", "AbortError"); }
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

// Injection is a trusted build/test boundary, never a query-string, candidate
// metadata, localStorage or a server-provided approval registry. Readers return
// raw manifest text so the delivery hash covers the exact transported bytes.
export function createMw3DeliveryClient({
  registry = MW3_APPROVED_POLICIES,
  readManifest = (hash: string) => readText(mw3DeliveryUrl("manifest", { delivery: hash })),
  readPart = async (hash: string, part: number) => JSON.parse(await readText(mw3DeliveryUrl("part", { delivery: hash, part: String(part) }))),
  readDataset = loadDataset,
}: {
  registry?: readonly Mw3ApprovedPolicy[];
  readManifest?: (hash: string) => Promise<string>;
  readPart?: (hash: string, part: number) => Promise<{ part: number; body: string }>;
  readDataset?: (name: string) => Promise<any>;
} = {}): Mw3DeliveryClient {
  const pins = Object.freeze(registry.map(pin => Object.freeze({ ...pin })));
  if (pins.some(pin => !/^[A-Za-z0-9_-]{1,100}$/.test(pin.spotId) || !["flop", "later"].includes(pin.stage)
    || [pin.deliveryHash, pin.sourceHash, pin.implementationHash, pin.policyHash].some(hash => !HASH.test(hash)))
    || new Set(pins.map(pin => `${pin.spotId}/${pin.stage}`)).size !== pins.length) throw new Error("Invalid trusted mw3 approval pins");
  const approved = (id: string, stage: string) => pins.find(pin => pin.spotId === id && pin.stage === stage);
  const supportsSpot = (id: string) => Boolean(approved(id, "flop") && approved(id, "later"));
  type RequestEntry = { promise: Promise<Mw3Kit>; settled: boolean; lastUsed: number };
  const requests = new Map<string, RequestEntry>();
  let sequence = 0;
  const trim = () => {
    const settled = [...requests].filter(([, entry]) => entry.settled).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, entry] of settled.slice(0, Math.max(0, settled.length - 2))) {
      if (requests.get(id) === entry) requests.delete(id);
    }
  };
  async function stage(inputs: any, pin: Mw3ApprovedPolicy) {
    const text = await readManifest(pin.deliveryHash);
    if (typeof text !== "string" || new TextEncoder().encode(text).length > 200_000 || await mw3TextSha(text) !== pin.deliveryHash) throw new Mw3UnavailableError("stale");
    const header = JSON.parse(text), manifest = header.manifest;
    const stages = pin.stage === "flop" ? ["flop"] : ["turn", "river"];
    if (header.version !== 1 || header.kind !== "ai_estimate_not_gto" || header.stage !== pin.stage
      || manifest?.version !== 1 || manifest.spotId !== pin.spotId || JSON.stringify(manifest.stages) !== JSON.stringify(stages)
      || !Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > 2000
      || !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 20_000_000
      || !HASH.test(manifest.payloadHash) || manifest.policyHash !== pin.policyHash
      || !Array.isArray(header.partHashes) || header.partHashes.length !== manifest.parts || header.partHashes.some((hash: any) => !HASH.test(hash))) throw new Mw3UnavailableError("stale");
    const parts = [];
    // Bounded sequential reads avoid a hundred requests/large responses in flight.
    for (let index = 0; index < manifest.parts; index++) {
      const part = await readPart(pin.deliveryHash, index);
      if (part?.part !== index || typeof part.body !== "string" || part.body.length > 16000 || await mw3TextSha(part.body) !== header.partHashes[index]) throw new Mw3UnavailableError("stale");
      parts.push({ part: index, body: part.body });
    }
    return verifyMw3BrowserCandidate(inputs, { metadata: header.metadata, manifest, parts }, {
      stage: pin.stage, expectedImplementationHash: pin.implementationHash, expectedPolicyHash: pin.policyHash,
    });
  }
  return {
    supportsSpot,
    touchSpot(id) { const entry = requests.get(id); if (entry) entry.lastUsed = ++sequence; },
    load(id, signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      if (!supportsSpot(id)) return Promise.reject(new Mw3UnavailableError("unapproved"));
      let entry = requests.get(id);
      if (!entry) {
        const current: RequestEntry = { promise: Promise.resolve(null as unknown as Mw3Kit), settled: false, lastUsed: ++sequence };
        current.promise = (async () => {
          const datasets = Object.fromEntries(await Promise.all(names.map(async name => [name, await readDataset(name)])));
          const inputs = await buildMw3BrowserInputs(id, datasets);
          const flopPin = approved(id, "flop")!, laterPin = approved(id, "later")!;
          if (inputs.fingerprint !== flopPin.sourceHash || inputs.fingerprint !== laterPin.sourceHash
            || flopPin.implementationHash !== laterPin.implementationHash) throw new Mw3UnavailableError("stale");
          // The saved MW3 schema has no later.flop_policy_hash field. Its trusted
          // same-spot stage pair and matching source/implementation pins bind it.
          const flop = await stage(inputs, flopPin), later = await stage(inputs, laterPin);
          const kit: Mw3Kit = { kind: "mw3_srp", spotId: id, inputs, policies: { flop: flop.policy, later: later.policy } };
          freezeVerified(kit);
          verifiedKits.add(kit);
          return kit;
        })().then(kit => {
          current.settled = true;
          if (requests.get(id) === current) trim();
          return kit;
        }).catch(error => {
          if (requests.get(id) === current) requests.delete(id);
          if (error instanceof Mw3UnavailableError) throw error;
          throw new Mw3UnavailableError("unavailable");
        });
        // Shared requests do not inherit a view's abort signal. Success cache
        // is bounded to two spots; active consumers retain their own kit refs.
        entry = current;
        requests.set(id, current);
      } else entry.lastUsed = ++sequence;
      return waitFor(entry.promise, signal);
    },
  };
}
export const mw3DeliveryClient = createMw3DeliveryClient();
