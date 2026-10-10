import { accountApiBase } from "./config.ts";
import { decodeAgentHistory, encodeAgentHistoryForAccount } from "../agent/agent-history-codec.ts";
// Guest records stay local; account records live in memory and use an HttpOnly cookie.
export const AGENT_HANDS_KEY = "reysonai:agent-hands:v1";
export const LEGACY_AGENT_HANDS_KEY = "evionai:agent-hands:v1";
// Keep imports inside the Worker endpoint's existing request-body limit.
const MAX_ACCOUNT_SNAPSHOT_BYTES = 500_000;
export const accountKeys = ["reysonai:profile:v1", "reysonai:appearance:v1", "reysonai:display-mode:v1", "reysonai:locale:v1", "reysonai.trainer.history.v1", "reysonai.trainer.drills.v1", "reysonai.trainer.drafts.v1", "reysonai.trainer.review-sessions.v1", AGENT_HANDS_KEY];
export interface AccountUser { id: string; email: string; verified: boolean; name?: string; picture?: string }
export interface AccountState { user: AccountUser | null; ready: boolean; available: boolean; error: string }
interface AccountResponses { session: { user: AccountUser | null }; data: { ownerId: string; data?: Record<string, unknown>; version: number }; "google/start": { url: string }; logout: { ok?: boolean } }
type AccountSaveOptions = { importLocal?: boolean; consent?: boolean };
const snapshotRequestBody = (snapshot: Record<string, unknown>, version: number, extra: AccountSaveOptions, expectedOwner: string) => ({ data: snapshot, version, ...extra, expectedOwner });
let user: AccountUser | null = null;
let data: Record<string, unknown> = {};
let version = 0;
let snapshotOwnerId: string | null = null;
let ready = false;
let available = false;
let error = "";
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = Promise.resolve();
let refreshing: Promise<void> | null | undefined;
let dirty = false;
let transitioning = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const accountSnapshot = () => ({ user, ready, available, error });
export const subscribeAccount = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export async function accountRequest<P extends keyof AccountResponses>(path: P, body?: unknown): Promise<AccountResponses[P]> {
  const base = accountApiBase((import.meta as ImportMeta & { env?: Parameters<typeof accountApiBase>[0] }).env ?? {});
  const response = await fetch(`${base}/v1/account/${path}`, { credentials: "include", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json() as AccountResponses[P] & { error?: unknown };
  if (!response.ok) throw new Error(response.status === 503 ? "disabled" : response.status === 409 ? (result?.error === "account_owner_changed" ? "session" : "conflict") : response.status === 401 ? "session" : response.status === 403 ? "verification" : response.status === 413 ? "payload_too_large" : "request");
  return result;
}
// Leaves the app for Google; the callback lands back on the front page.
export async function startGoogleSignIn() {
  const { url } = await accountRequest("google/start", {});
  const target = new URL(url);
  if (target.origin !== "https://accounts.google.com") throw new Error("oauth_url");
  window.location.assign(target.href);
}
export function refreshAccount() {
  // React StrictMode must not start two competing session/data loads.
  if (refreshing) return refreshing;
  refreshing = (async () => {
    transitioning = true; ready = false; emit();
    clearTimeout(timer);
    await pending;
    let nextUser: AccountUser | null = user;
    let identityChanged = false;
    let ownerMismatch = false;
    try {
      const result = await accountRequest("session");
      nextUser = result.user;
      identityChanged = user?.id !== nextUser?.id;
      let saved: AccountResponses["data"] | undefined;
      if (nextUser?.verified) {
        saved = await accountRequest("data");
        if (saved.ownerId !== nextUser.id) { ownerMismatch = true; throw new Error("session"); }
      }
      // Install the snapshot only after /data proves it belongs to the
      // authenticated owner returned by /session.
      if (identityChanged) { data = {}; version = 0; snapshotOwnerId = null; dirty = false; }
      user = nextUser;
      available = true;
      if (user?.verified && saved) {
        data = Object.fromEntries(Object.entries(saved.data ?? {}).filter(([key]) => accountKeys.includes(key)));
        version = saved.version;
        snapshotOwnerId = user.id;
      } else { data = {}; snapshotOwnerId = null; }
      dirty = false; error = "";
    } catch (cause) {
      if (identityChanged && !ownerMismatch) { user = nextUser; data = {}; version = 0; snapshotOwnerId = null; dirty = false; }
      available = ["session", "verification"].includes((cause as Error).message);
      error = (cause as Error).message === "disabled" ? "" : available ? (cause as Error).message : "request";
    }
    ready = true; transitioning = false; emit();
  })().finally(() => { refreshing = null; });
  return refreshing;
}
// Focus checks only the session identity: never replace unsaved in-memory data.
let rechecking: Promise<void> | null | undefined;
export function revalidateAccountSession() {
  if (rechecking) return rechecking;
  if (!ready || refreshing || error) return Promise.resolve();
  rechecking = (async () => {
    try {
      const result = await accountRequest("session");
      if (result.user?.id !== user?.id || (user && result.user?.verified !== true)) {
        error = "session"; available = true; emit();
      }
    } catch (cause) {
      available = ["session", "verification"].includes((cause as Error).message);
      error = available ? (cause as Error).message : "request"; emit();
    }
  })().finally(() => { rechecking = null; });
  return rechecking;
}
export function accountStorage() {
  if (!user) { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
  return {
    get length() { return Object.keys(data).length; },
    key: (index: number) => Object.keys(data)[index] ?? null,
    getItem: (key: string): string | null => accountKeys.includes(key) && key in data ? (typeof data[key] === "string" ? data[key] as string : JSON.stringify(data[key])) : null,
    setItem: (key: string, value: string) => { if (!accountKeys.includes(key) || transitioning) return; try { const parsed = JSON.parse(value); data[key] = key === AGENT_HANDS_KEY ? encodeAgentHistoryForAccount(parsed) : parsed; } catch { data[key] = value; } dirty = true; queueSave(); },
    removeItem: (key: string) => { if (accountKeys.includes(key) && !transitioning) { delete data[key]; dirty = true; queueSave(); } },
  };
}
function queueSave() {
  if (!user?.verified || error) return;
  clearTimeout(timer);
  timer = setTimeout(() => { saveAccountData(); }, 350);
}
export function saveAccountData(extra: AccountSaveOptions = {}, expectedOwnerAtCall?: string) {
  clearTimeout(timer);
  pending = pending.then(async () => {
    // If focus revalidation is in flight, wait for its result before choosing
    // the snapshot to write. The server still checks this owner against the
    // cookie on the same request, closing the cross-tab cookie race.
    if (rechecking) await rechecking;
    if (!user?.verified || error || !dirty) return;
    const expectedOwner = snapshotOwnerId;
    if (!expectedOwner || expectedOwner !== user.id || (expectedOwnerAtCall && expectedOwnerAtCall !== expectedOwner)) { error = "session"; available = true; emit(); return; }
    const snapshot = JSON.parse(JSON.stringify(data));
    dirty = false;
    try { const result = await accountRequest("data", snapshotRequestBody(snapshot, version, extra, expectedOwner)); version = result.version; }
    catch (cause) { dirty = true; error = (cause as Error).message; emit(); }
  });
  return pending;
}
export async function importGuestData(consent = false) {
  if (consent !== true || !user?.verified || error) throw new Error("consent");
  clearTimeout(timer);
  if (rechecking) await rechecking;
  await pending;
  if (error) throw new Error(error);
  const expectedOwner = snapshotOwnerId;
  if (!expectedOwner || expectedOwner !== user.id) throw new Error("session");
  const imported: Record<string, unknown> = {};
  for (const key of accountKeys) {
    const value = window.localStorage.getItem(key) ?? (key === AGENT_HANDS_KEY ? window.localStorage.getItem(LEGACY_AGENT_HANDS_KEY) : null);
    if (value !== null) {
      try { const parsed = JSON.parse(value); imported[key] = key === AGENT_HANDS_KEY ? encodeAgentHistoryForAccount(parsed) : parsed; }
      catch { imported[key] = value; }
    }
  }
  const importOptions = { importLocal: true, consent: true };
  const importBody = snapshotRequestBody(imported, version, importOptions, expectedOwner);
  if (new TextEncoder().encode(JSON.stringify(importBody)).byteLength > MAX_ACCOUNT_SNAPSHOT_BYTES) throw new Error("payload_too_large");
  // Explicit replacement, never an ambiguous history merge.
  data = imported; dirty = true;
  await saveAccountData(importOptions, expectedOwner);
  if (error) throw new Error(error);
  emit();
}
export async function logoutAccount() {
  transitioning = true;
  try {
    await saveAccountData();
    // Do not discard unsaved authenticated records after a save failure.
    if (error && user?.verified && dirty) throw new Error(error);
    await accountRequest("logout", {});
    user = null; data = {}; snapshotOwnerId = null; dirty = false; error = ""; emit();
  } finally { transitioning = false; }
}
export function exportAccountData() {
  const exported = JSON.parse(JSON.stringify(data));
  if (AGENT_HANDS_KEY in exported) exported[AGENT_HANDS_KEY] = decodeAgentHistory(exported[AGENT_HANDS_KEY]);
  return { app: "ReysonAI", exportedAt: new Date().toISOString(), data: exported, rankedAuthoritative: false };
}
