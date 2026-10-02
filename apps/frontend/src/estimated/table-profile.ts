// Table profile: how the players behind the opener deviate from the saved
// response ranges. Deterministic and explainable; an LLM may later produce the
// same profile shape from free text, but the range math always happens here.
import { productLocale } from "../i18n.ts";

export const PROFILE_LEVELS = Object.freeze(["low", "normal", "high"]);

// Multipliers applied to each responder's per-hand frequencies.
export const PROFILE_MULTIPLIERS = Object.freeze({
  call: Object.freeze({ low: 0.6, normal: 1, high: 1.6 }),
  three_bet: Object.freeze({ low: 0.4, normal: 1, high: 1.5 }),
});

export const DEFAULT_PROFILE = Object.freeze({ call: "normal", three_bet: "normal" });

export const PROFILE_LABELS = { call: "コール頻度", three_bet: "3bet頻度" };
export const LEVEL_LABELS = { low: "少ない", normal: "標準", high: "多い" };

export function normalizeProfile(profile = {}) {
  const result = { ...DEFAULT_PROFILE };
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    const value = profile[key] ?? DEFAULT_PROFILE[key];
    if (!PROFILE_LEVELS.includes(value)) throw new Error(`${key} must be one of ${PROFILE_LEVELS.join(", ")}`);
    result[key] = value;
  }
  return result;
}

export const profileKey = profile => {
  const { call, three_bet } = normalizeProfile(profile);
  return `call_${call}__three_bet_${three_bet}`;
};

export const isDefaultProfile = profile =>
  Object.keys(DEFAULT_PROFILE).every(key => normalizeProfile(profile)[key] === DEFAULT_PROFILE[key]);

export const describeProfile = profile =>
  Object.entries(normalizeProfile(profile)).map(([key, level]) => `${PROFILE_LABELS[key]}: ${LEVEL_LABELS[level]}`).join(" / ");

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

// Applies precomputed open adjustments (table-profile-adjustments.json) to a
// saved opening spot. Added hands open at 100%, dropped hands fold at 100%;
// each changed row carries `adjusted` and `shift_bb` for the UI to explain.
export function adjustOpeningSpot(spot, adjustments, profile) {
  if (!spot || !adjustments || isDefaultProfile(profile)) return spot;
  const byPosition = adjustments.profiles?.[profileKey(profile)]?.[spot.hero];
  if (!byPosition) return spot;
  const changes = new Map([
    ...byPosition.add.map(([hand, shift]) => [hand, { adjusted: "add", shift_bb: shift }]),
    ...byPosition.drop.map(([hand, shift]) => [hand, { adjusted: "drop", shift_bb: shift }]),
  ]);
  if (!changes.size) return { ...spot, table_profile: normalizeProfile(profile) };
  return {
    ...spot,
    table_profile: normalizeProfile(profile),
    hands: spot.hands.map(row => {
      const change = changes.get(row.hand);
      if (!change) return row;
      const opens = change.adjusted === "add";
      const next = { ...row, ...change, saved_open: row.open, open: opens ? 100 : 0, fold: opens ? 0 : 100, open_size_bb: opens ? spot.open_size_bb : null };
      if (Object.hasOwn(row, "limp")) Object.assign(next, { limp: 0, limp_size_bb: null });
      return next;
    }),
  };
}

// Why the profile changed this hand, in one sentence for the hand detail.
export function adjustmentReason(row, profile) {
  if (!row?.adjusted) return null;
  const { call, three_bet } = normalizeProfile(profile);
  const adds = row.adjusted === "add";
  if (productLocale() === "en") {
    const causes = [
      three_bet === "low" && adds && "fewer opponents 3-bet",
      three_bet === "high" && !adds && "more opponents 3-bet",
      call === "low" && adds && "the blinds fold more often",
      call === "high" && !adds && "calls more often create unfavorable pots",
    ].filter(Boolean);
    return `With this table profile, ${causes.length ? causes.join(" and ") : "opponent responses change"}. The approximation changes EV by ${row.shift_bb > 0 ? "+" : ""}${row.shift_bb.toFixed(2)} BB, so this hand is ${adds ? "added to" : "removed from"} the opening range (saved baseline: ${row.saved_open}% open).`;
  }
  // Only the tendencies that push in this hand's direction explain it.
  const causes = [
    three_bet === "low" && adds && "3betで降ろされることが減る",
    three_bet === "high" && !adds && "3betで降ろされることが増える",
    call === "low" && adds && "ブラインドを取れることが増える",
    call === "high" && !adds && "コールされて不利なポットになりやすい",
  ].filter(Boolean);
  if (!causes.length) causes.push("相手の応答が変わる");
  const verb = adds ? "オープンに追加" : "オープンから除外";
  const shift = `${row.shift_bb > 0 ? "+" : ""}${row.shift_bb.toFixed(2)}BB`;
  return `この卓では${causes.join("・")}ため、期待値が ${shift} 変わると見積もり、${verb}しました（保存済みレンジでは ${row.saved_open}%）。`;
}

// Copies adjusted/shift_bb from spot rows onto a matrix model's aggregates.
export function markAdjustedModel(model, spot) {
  if (!model || !spot?.table_profile) return model;
  const rows = new Map(spot.hands.filter(row => row.adjusted).map(row => [row.hand, row]));
  if (!rows.size) return model;
  return { ...model, aggregates: new Map([...model.aggregates].map(([hand, aggregate]) => [hand, rows.has(hand) ? { ...aggregate, adjusted: rows.get(hand).adjusted } : aggregate])) };
}
