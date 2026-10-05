import type { Drill, PracticeSession } from "./types.ts";
import { accountStorage } from "../account/session.ts";
// Saved drills (named settings) and their session records, kept in this browser only.
import { POSITIONS, normalizeSettings } from "./trainer-data.ts";
import { validSession } from "./practice-sessions.ts";
import { localized, productLocale } from "../locale.ts";

const KEY = "reysonai.trainer.drills.v1";
const SESSION_LIMIT = 50;

export const PRESET_DRILLS = Object.freeze([
  { id: "preset-mixed", name: "全局面ミックス", settings: { kinds: ["open", "response"], positions: [...POSITIONS], count: 20, difficulty: "standard" } },
  { id: "preset-open", name: "オープンレンジ", settings: { kinds: ["open"], positions: ["UTG", "HJ", "CO", "BTN", "SB"], count: 20, difficulty: "standard" } },
  { id: "preset-bb-defense", name: "BBディフェンス", settings: { kinds: ["response"], positions: ["BB"], count: 20, difficulty: "standard" } },
  { id: "preset-blinds", name: "SB・BBの攻防", settings: { kinds: ["response"], positions: ["SB", "BB"], count: 20, difficulty: "standard" } },
  { id: "preset-mixed-hands", name: "混合ハンド集中", settings: { kinds: ["open", "response"], positions: [...POSITIONS], count: 20, difficulty: "hard" } },
]);

const ENGLISH_PRESET_NAMES: Record<string, string> = {
  "preset-mixed": "All-spot mix", "preset-open": "Opening range", "preset-bb-defense": "BB defense",
  "preset-blinds": "SB · BB blind battle", "preset-mixed-hands": "Mixed-hand focus",
};

// Keep the persisted name untouched; only a stock preset gets a localized view.
export function displayDrillName(drill: { id?: string; name: string }) {
  if (productLocale() === "ja") return drill.name;
  const preset = PRESET_DRILLS.find(item => item.id === drill.id);
  return preset && preset.name === drill.name ? localized(ENGLISH_PRESET_NAMES[drill.id!], preset.name) : drill.name;
}

function presetDrills(level: string | null): Drill[] {
  return PRESET_DRILLS.map(drill => ({ ...drill, settings: normalizeSettings(drill.settings, level), preset: true, sessions: [], createdAt: 0 }));
}

function validDrill(drill: Drill | null, level: string | null): Drill | null {
  if (!drill || typeof drill.id !== "string" || typeof drill.name !== "string") return null;
  const sessions = Array.isArray(drill.sessions) ? drill.sessions.map(validSession).filter<PracticeSession>(Boolean as typeof Boolean & { <T>(value: T): value is NonNullable<T> }) : [];
  return { id: drill.id, name: drill.name.slice(0, 40) || "無題のドリル", settings: normalizeSettings(drill.settings, level),
    preset: Boolean(drill.preset), createdAt: Number(drill.createdAt) || 0, sessions: sessions.slice(-SESSION_LIMIT) };
}

export function loadDrills(level: string | null = null): Drill[] {
  try {
    const saved = JSON.parse(accountStorage()!.getItem(KEY) ?? "null");
    if (Array.isArray(saved)) return saved.map(drill => validDrill(drill, level)).filter<Drill>(Boolean as typeof Boolean & { <T>(value: T): value is NonNullable<T> });
  } catch {}
  return presetDrills(level);
}

export function saveDrills(drills: Drill[]) {
  try { accountStorage()!.setItem(KEY, JSON.stringify(drills)); } catch {}
}

export function newDrillId() {
  return `drill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function upsertDrill(drills: Drill[], drill: Drill) {
  return drills.some(item => item.id === drill.id) ? drills.map(item => item.id === drill.id ? { ...item, ...drill } : item) : [...drills, drill];
}

export function recordSession(drills: Drill[], drillId: string, session: PracticeSession) {
  return drills.map(drill => drill.id === drillId ? { ...drill, sessions: [...drill.sessions, session].slice(-SESSION_LIMIT) } : drill);
}

// session: { at, answered, score, best, mixed, miss, durationMs, hands? }
export function drillStats(drill?: Drill | null) {
  const sessions = drill?.sessions ?? [];
  const rates = sessions.map(item => item.score / item.answered);
  const attempts = sessions.length;
  return {
    attempts,
    best: attempts ? Math.max(...rates) : null,
    average: attempts ? rates.reduce((sum, rate) => sum + rate, 0) / attempts : null,
    last: attempts ? rates.at(-1)! : null,
    previous: attempts > 1 ? rates.at(-2)! : null,
    answered: sessions.reduce((sum, item) => sum + item.answered, 0),
    trend: rates.slice(-12),
    lastAt: attempts ? sessions.at(-1)!.at : null,
  };
}
