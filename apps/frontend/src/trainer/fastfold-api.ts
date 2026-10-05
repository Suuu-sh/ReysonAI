import { accountApiBase } from '../account/config.ts';
import { productLocale } from '../locale.ts';

export const ffCopy = (en: string, ja: string, zh: string, es: string): string => ({ en, ja, 'zh-CN': zh, es })[productLocale()];
export type FastFoldPosition = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export type FastFoldOpponent = { position: FastFoldPosition; type: string; label: string; policyVersion: string; tendencyScope?: 'preflop'; postflopType?: 'balanced'; description?: { en: string; ja: string } };
export type FastFoldLog = { street: string; pos: FastFoldPosition; action: string; to?: number; pot: number };
export type FastFoldSession = {
  id: string; version: number; status: 'active' | 'paused'; breakExpiresAt?: number;
  hand: { id: string; hero: FastFoldPosition; number: number; holeCards: Partial<Record<FastFoldPosition, string[]>>; board: string[]; log: FastFoldLog[]; pot: number; status: 'awaiting' | 'done'; opponents: FastFoldOpponent[]; policyVersion: string; policyMissing?: boolean;
    pending?: { street: string; pos: FastFoldPosition; options: { key: string; to?: number }[]; pot: number; board: string[]; toCall: number; notice?: string };
  };
};
export type FastFoldResult = { id: string; hero: FastFoldPosition; netBb: number; beforeRating: number; afterRating: number; showdown: boolean; board: string[]; holeCards: Partial<Record<FastFoldPosition, string[]>>; winners: FastFoldPosition[]; termination?: 'exit' | 'expired'; shadow: { mode: 'shadow'; appliedPenalty: 0; baselineDeviation: number | null; opponentAdjustedDeviation: number | null; support: string } };
export type FastFoldActionStat = { opportunities: number; taken: number; percent: number | null };
export type FastFoldActionStats = { hands: number; window: 'recent_100'; coverage: { postflop: 'partial' }; vpip: FastFoldActionStat; pfr: FastFoldActionStat; threeBet: FastFoldActionStat; foldToThreeBet: FastFoldActionStat };
export type FastFoldState = { rating: number; peak: number; hands: number; netBb: number; bbPer100: number | null; provisional: boolean; uncertainty: number | null; active: FastFoldSession | null; recent: FastFoldResult[]; actionStats?: FastFoldActionStats };
export type FastFoldProfile = { enabled: boolean; season: string; publicName: string | null; serverNow: number; state: FastFoldState };
export type FastFoldResponse = { session: FastFoldSession | null; state: FastFoldState; serverNow: number; lastResult?: FastFoldResult };
export type FastFoldRow = { id: string; name: string; rating: number; hands: number; bbPer100: number | null; place: number | null; self: boolean; provisional: boolean };
export class FastFoldError extends Error { constructor(public code: string, public status: number) { super(code); } }
export async function fastFoldRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${accountApiBase(import.meta.env ?? {})}/v1/fastfold/${path}`, { credentials: 'include', cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  let result: any;
  try { result = await response.json(); } catch { throw new FastFoldError('service_unavailable', response.status); }
  if (!response.ok) throw new FastFoldError(result.error ?? 'service_unavailable', response.status);
  return result as T;
}
export async function fastFoldProfile(): Promise<FastFoldProfile> {
  const status = await fastFoldRequest<{ enabled: boolean; season: string; comparisonMode: string; appliedPenalty: boolean }>('status');
  if (status.enabled !== true || status.season !== 'fastfold-v1' || status.comparisonMode !== 'shadow' || status.appliedPenalty !== false) throw new FastFoldError('not_ready', 503);
  const profile = await fastFoldRequest<FastFoldProfile>('profile');
  if (profile.enabled !== true || profile.season !== status.season || !Number.isFinite(profile.serverNow) || !validFastFoldState(profile.state)) throw new FastFoldError('invalid_state', 503);
  return profile;
}
export function validFastFoldState(state: FastFoldState): boolean {
  return Boolean(state && Number.isFinite(state.rating) && Number.isFinite(state.peak) && Number.isSafeInteger(state.hands) && state.hands >= 0 && Number.isFinite(state.netBb) && Array.isArray(state.recent) && (state.active == null || validFastFoldSession(state.active)));
}
export function validFastFoldSession(session: FastFoldSession): boolean {
  const hand = session?.hand;
  return Boolean(session && typeof session.id === 'string' && Number.isSafeInteger(session.version) && ['active', 'paused'].includes(session.status) && (session.breakExpiresAt == null || Number.isFinite(session.breakExpiresAt)) && hand && typeof hand.id === 'string' && Array.isArray(hand.board) && Array.isArray(hand.log) && Array.isArray(hand.opponents) && hand.holeCards?.[hand.hero]?.length === 2 && (session.status === 'paused' || (hand.pending?.pos === hand.hero && hand.pending.options?.length)));
}
export const ffNumber = (value: number | null | undefined, signed = false): string => value == null || !Number.isFinite(value) ? '—' : `${signed && value >= 0 ? '+' : ''}${Number(value.toFixed(2)).toLocaleString()}`;

// Elapsed time is monotonic. The browser wall clock never controls a server break.
export function ffBreakRemaining(expiresAt: number, serverNow: number, elapsedMs: number): number {
  return Math.max(0, Math.min(900_000, expiresAt - serverNow - Math.max(0, elapsedMs)));
}
