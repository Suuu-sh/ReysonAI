// Table profile: how the players behind the opener deviate from the saved
// response ranges. Deterministic and explainable; an LLM may later produce the
// same profile shape from free text, but the range math always happens here.

export const PROFILE_LEVELS = Object.freeze(["low", "normal", "high"]);

// Multipliers applied to each responder's per-hand frequencies.
export const PROFILE_MULTIPLIERS = Object.freeze({
  call: Object.freeze({ low: 0.6, normal: 1, high: 1.6 }),
  three_bet: Object.freeze({ low: 0.4, normal: 1, high: 1.5 }),
});

export const DEFAULT_PROFILE = Object.freeze({ call: "normal", three_bet: "normal" });

const LABELS = { call: "コール頻度", three_bet: "3bet頻度" };
const LEVEL_LABELS = { low: "少ない", normal: "標準", high: "多い" };

export function normalizeProfile(profile = {}) {
  const result = { ...DEFAULT_PROFILE };
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    const value = profile[key] ?? DEFAULT_PROFILE[key];
    if (!PROFILE_LEVELS.includes(value)) throw new Error(`${key} must be one of ${PROFILE_LEVELS.join(", ")}`);
    result[key] = value;
  }
  return result;
}

export const isDefaultProfile = profile =>
  Object.keys(DEFAULT_PROFILE).every(key => normalizeProfile(profile)[key] === DEFAULT_PROFILE[key]);

export const describeProfile = profile =>
  Object.entries(normalizeProfile(profile)).map(([key, level]) => `${LABELS[key]}: ${LEVEL_LABELS[level]}`).join(" / ");

const round1 = value => Math.round(value * 10) / 10;

// Adjust one response row (fold/call/three_bet in %). Fewer 3bets turn into
// flats (passive players call instead of raising); extra 3bets come out of
// calls first, then folds. Call scaling then trades only with folds.
export function adjustResponseRow(row, profile) {
  const { call: callLevel, three_bet: threeBetLevel } = normalizeProfile(profile);
  let fold = Number(row.fold) || 0;
  let call = Number(row.call) || 0;
  let threeBet = Number(row.three_bet) || 0;

  const targetThreeBet = Math.min(100, threeBet * PROFILE_MULTIPLIERS.three_bet[threeBetLevel]);
  if (targetThreeBet < threeBet) {
    call += threeBet - targetThreeBet;
  } else {
    let need = targetThreeBet - threeBet;
    const fromCall = Math.min(call, need);
    call -= fromCall;
    need -= fromCall;
    fold -= Math.min(fold, need);
  }
  threeBet = targetThreeBet;

  const targetCall = Math.min(call + fold, call * PROFILE_MULTIPLIERS.call[callLevel]);
  fold += call - targetCall;
  call = targetCall;

  return { ...row, fold: round1(Math.max(0, fold)), call: round1(call), three_bet: round1(threeBet) };
}

// Returns a copy of a preflop-ranges dataset with every response row adjusted.
export function applyTableProfile(dataset, profile) {
  const normalized = normalizeProfile(profile);
  return {
    ...dataset,
    metadata: { ...dataset.metadata, table_profile: normalized },
    spots: dataset.spots.map(spot => ({ ...spot, hands: spot.hands.map(row => adjustResponseRow(row, normalized)) })),
  };
}

// Keyword rules for turning a table description into a profile. This is the
// offline fallback for the future LLM step and doubles as its test oracle.
const RULES = [
  { key: "three_bet", level: "low", pattern: /3\s*bet[^。、,.]*?(少な|しない|してこない|ない|稀|まれ)|パッシブ|passive/i },
  { key: "three_bet", level: "high", pattern: /3\s*bet[^。、,.]*?(多|よく|頻繁)|アグレッシブ|aggressive/i },
  { key: "call", level: "high", pattern: /コール[^。、,.]*?(され|多|よく)|降りない|ルース|コーリングステーション|calling station|loose|multiway|マルチウェイ/i },
  { key: "call", level: "low", pattern: /すぐ降り|フォールド[^。、,.]*?多|降り(がち|る人が多)|タイト|tight|nit/i },
];

export function parseTableDescription(text = "") {
  const profile = { ...DEFAULT_PROFILE };
  const matched = [];
  for (const rule of RULES) {
    if (profile[rule.key] !== DEFAULT_PROFILE[rule.key]) continue;
    const hit = text.match(rule.pattern);
    if (!hit) continue;
    profile[rule.key] = rule.level;
    matched.push({ key: rule.key, level: rule.level, text: hit[0] });
  }
  return { profile, matched };
}
