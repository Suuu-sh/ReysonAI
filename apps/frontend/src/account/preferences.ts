import { accountStorage, accountSnapshot, exportAccountData } from "./session.ts";
// Local appearance preferences, applied to <html> data attributes so any page can style from them.
import { displayModeKey } from "../profile.ts";

const KEY = "reysonai:appearance:v1";
export const DEFAULT_APPEARANCE = Object.freeze({ cards: "four", motion: "standard", matrix: "classic" });

const storage = () => { try { return typeof window === "undefined" ? null : accountStorage(); } catch { return null; } };

export function loadAppearance() {
  try {
    const saved = JSON.parse(storage()?.getItem(KEY) ?? "null") ?? {};
    return {
      cards: saved.cards === "two" ? "two" : "four",
      motion: saved.motion === "reduce" ? "reduce" : "standard",
      matrix: saved.matrix === "wizard" ? "wizard" : "classic",
    };
  } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function applyAppearance(appearance = loadAppearance()) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.cards = appearance.cards;
  document.documentElement.dataset.motion = appearance.motion;
  document.documentElement.dataset.matrix = appearance.matrix;
}

export function saveAppearance(appearance: ReturnType<typeof loadAppearance>) {
  try { storage()?.setItem(KEY, JSON.stringify(appearance)); } catch {}
  applyAppearance(appearance);
}

export function loadDisplayMode() {
  return storage()?.getItem(displayModeKey) === "simple" ? "simple" : "standard";
}

export function saveDisplayMode(mode: string) {
  try { storage()?.setItem(displayModeKey, mode === "simple" ? "simple" : "standard"); } catch {}
}

// Practice data lives under one prefix; used by data export and by log-out cleanup.
const PRACTICE_PREFIX = "reysonai.trainer.";

export function practiceKeys() {
  const store = storage();
  if (!store) return [];
  return Array.from({ length: store.length }, (_, index) => store.key(index)).filter(key => key?.startsWith(PRACTICE_PREFIX)) as string[];
}

export function exportLocalData() {
  if (accountSnapshot().user) return exportAccountData();
  const store = storage();
  const data: Record<string, unknown> = {};
  for (const key of practiceKeys()) { try { data[key] = JSON.parse(store!.getItem(key)!); } catch { data[key] = store!.getItem(key)!; } }
  return { app: "ReysonAI", exportedAt: new Date().toISOString(), data };
}

export function clearPracticeData() {
  for (const key of practiceKeys()) { try { storage()?.removeItem(key); } catch {} }
}

applyAppearance();
