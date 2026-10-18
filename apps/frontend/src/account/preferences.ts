import { accountStorage } from "./session.ts";
// Local appearance preferences, applied to <html> data attributes so any page can style from them.
import { displayModeKey } from "../profile.ts";

const KEY = "reysonai:appearance:v1";
export const RANGE_SOURCE_CHANGED = "reysonai:range-source-changed";
export type RangeSource = "ai" | "aiv2" | "gto";
export const DEFAULT_APPEARANCE = Object.freeze({ cards: "four", motion: "standard" });

const storage = () => { try { return typeof window === "undefined" ? null : accountStorage(); } catch { return null; } };
const appearanceRecord = (): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    delete record.matrix;
    return record;
  } catch { return {}; }
};
const sourceOf = (record: Record<string, unknown>): RangeSource => record.rangeSource === "gto" || record.rangeSource === "aiv2" ? record.rangeSource : "ai";

export function loadAppearance() {
  const saved = appearanceRecord();
  return {
    cards: saved.cards === "two" ? "two" : "four",
    motion: saved.motion === "reduce" ? "reduce" : "standard",
  };
}

export function applyAppearance(appearance = loadAppearance()) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.cards = appearance.cards;
  document.documentElement.dataset.motion = appearance.motion;
  delete document.documentElement.dataset.matrix;
}

export function saveAppearance(appearance: ReturnType<typeof loadAppearance>) {
  const previous = appearanceRecord();
  const next = {
    cards: appearance.cards === "two" ? "two" : "four",
    motion: appearance.motion === "reduce" ? "reduce" : "standard",
  };
  try { storage()?.setItem(KEY, JSON.stringify({ ...previous, ...next, rangeSource: sourceOf(previous) })); } catch {}
  applyAppearance(next);
}

export function loadDisplayMode() {
  return storage()?.getItem(displayModeKey) === "simple" ? "simple" : "standard";
}

export function saveDisplayMode(mode: string) {
  try { storage()?.setItem(displayModeKey, mode === "simple" ? "simple" : "standard"); } catch {}
}

export function loadRangeSource(): RangeSource {
  return sourceOf(appearanceRecord());
}

export function saveRangeSource(source: RangeSource) {
  try { storage()?.setItem(KEY, JSON.stringify({ ...appearanceRecord(), rangeSource: sourceOf({ rangeSource: source }) })); } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RANGE_SOURCE_CHANGED));
}

// Practice data lives under one prefix; guest logout can optionally clear it.
const PRACTICE_PREFIX = "reysonai.trainer.";

export function practiceKeys() {
  const store = storage();
  if (!store) return [];
  return Array.from({ length: store.length }, (_, index) => store.key(index)).filter(key => key?.startsWith(PRACTICE_PREFIX)) as string[];
}

export function clearPracticeData() {
  for (const key of practiceKeys()) { try { storage()?.removeItem(key); } catch {} }
}

applyAppearance();
