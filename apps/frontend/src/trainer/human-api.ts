import { accountApiBase } from "../account/config.ts";
import { FastFoldError, type FastFoldPosition, type FastFoldState, type FastFoldResult } from "./fastfold-api.ts";
export type HumanPublicPlayer = { id: string; name: string; hands: number | null; rating: number | null; style: string; unavailable?: boolean };
export type HumanOpponent = HumanPublicPlayer & { stats?: { hands: number; vpip?: { percent: number | null }; pfr?: { percent: number | null } }; tendencyScope?: "observed_only"; confidence?: "insufficient" | "sampled" };
export type HumanHand = { id: string; status: "playing" | "done"; street: string; board: string[]; holeCards: Partial<Record<FastFoldPosition, string[]>>; seats: { position: FastFoldPosition; stack: number; committed: number; bet: number; folded: boolean; allIn: boolean; departed: boolean }[]; pending?: { seat: number; position: FastFoldPosition; street: string; pot: number; toCall: number; options: { key: string; to?: number }[] } | null; log: { seat: number; street: string; action: string; to?: number; pot: number }[]; result?: unknown };
export type HumanMatch = { id: string; version: number; hero: number; hand: HumanHand; participants: { seat: number; position: FastFoldPosition; player: HumanPublicPlayer }[]; turnExpiresAt: number };
export type HumanState = { phase: "out" | "queued" | "reserved" | "hand" | "break"; version: number; rating: number; peak: number; hands: number; netBb: number; bbPer100: number | null; provisional: boolean; uncertainty: null; recent: FastFoldResult[]; leaseExpiresAt: number; breakExpiresAt?: number; queue: { humans: number; required: 6 }; reservation?: { id: string; expiresAt: number; accepted: boolean; acceptedHumans: number }; match?: HumanMatch };
export type HumanProfile = { enabled: boolean; season: "human-fastfold-v1"; serverNow: number; publicName?: string | null; state: HumanState };
export async function humanRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${accountApiBase(import.meta.env ?? {})}/v1/fastfold/human/${path}`, { credentials: "include", cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  let data: any;
  try { data = await response.json(); } catch { throw new FastFoldError("service_unavailable", response.status); }
  if (!response.ok) throw new FastFoldError(data.error ?? "service_unavailable", response.status);
  return data as T;
}
export function validHumanProfile(profile: HumanProfile): boolean {
  const s = profile?.state;
  return Boolean(profile?.enabled === true && profile.season === "human-fastfold-v1" && Number.isFinite(profile.serverNow) && s && ["out", "queued", "reserved", "hand", "break"].includes(s.phase) && Number.isSafeInteger(s.version) && Number.isFinite(s.rating) && Number.isFinite(s.peak) && Number.isSafeInteger(s.hands) && s.hands >= 0 && Number.isFinite(s.netBb) && Array.isArray(s.recent) && s.queue?.required === 6 && Number.isSafeInteger(s.queue.humans) && s.queue.humans >= 0 && (s.phase !== "break" || Number.isFinite(s.breakExpiresAt)) && (s.phase !== "reserved" || s.reservation && typeof s.reservation.id === "string" && Number.isFinite(s.reservation.expiresAt)) && (s.phase !== "hand" || s.match && s.match.participants?.length === 6 && s.match.hand?.seats?.length === 6 && Array.isArray(s.match.hand.board) && s.match.hand.holeCards && Number.isSafeInteger(s.match.hero)));
}
export async function humanProfile(): Promise<HumanProfile> {
  const status = await humanRequest<{ enabled: boolean; season: string; mode: string; requiredHumans: number; comparisonMode: string; appliedPenalty: boolean }>("status");
  if (!status.enabled || status.season !== "human-fastfold-v1" || status.mode !== "six_verified_humans" || status.requiredHumans !== 6 || status.comparisonMode !== "shadow" || status.appliedPenalty !== false) throw new FastFoldError("not_ready", 503);
  const profile = await humanRequest<HumanProfile>("profile");
  if (!validHumanProfile(profile)) throw new FastFoldError("invalid_state", 503);
  return profile;
}
// Display adapter only: ranked values originate exclusively in the new human server season.
export function humanRankState(s: HumanState): FastFoldState {
  return { rating: s.rating, peak: s.peak, hands: s.hands, netBb: s.netBb, bbPer100: s.bbPer100, provisional: s.provisional, uncertainty: s.uncertainty, active: null, recent: s.recent };
}
