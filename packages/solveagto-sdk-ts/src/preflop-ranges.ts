import { BTN_OPEN_AI_RESPONSES } from "./preflop-ai-responses.js";

export const AI_RANGE_SPOTS = ["btn_open", "bb_vs_btn_open"] as const;
export type AiRangeSpotId = (typeof AI_RANGE_SPOTS)[number];

export type AiRangeAction = "open" | "fold" | "call" | "three_bet";

export type AiRangeHand = {
  hand: string;
  frequencies: Partial<Record<AiRangeAction, number>>;
};

export type AiRangeSpot = {
  id: AiRangeSpotId;
  label: string;
  opener: "BTN";
  defender?: "BB";
  openSizeBb: 2.5;
  threeBetSizeBb?: 10;
};

export type AiRangeProviderMetadata = {
  kind: "deterministic_seed";
  name: "ai-knowledge-response";
  version: "v0.2";
  seed: string;
};

export type AiPreflopRange = {
  schemaVersion: "solveagto.ai-preflop-range.v1";
  status: "ai_estimated";
  gtoVerified: false;
  disclaimer: "AI推定レンジ。GTO計算結果ではありません。";
  game: "Cash";
  players: 6;
  effectiveStackBb: 100;
  spot: AiRangeSpot;
  actions: AiRangeAction[];
  provider: AiRangeProviderMetadata;
  hands: AiRangeHand[];
};

export type AiRangeRequest = {
  spot: AiRangeSpotId;
  effectiveStackBb?: 100;
  openSizeBb?: 2.5;
};

export type AiRangeValidation = {
  valid: boolean;
  errors: string[];
};

export interface PreflopRangeProvider {
  generate(request: AiRangeRequest): AiPreflopRange;
}

const RANKS = [..."AKQJT98765432"];

export const STARTING_HANDS = RANKS.flatMap((high, highIndex) =>
  RANKS.map((low, lowIndex) => {
    if (highIndex === lowIndex) return high + low;
    return highIndex < lowIndex ? `${high}${low}s` : `${low}${high}o`;
  }),
);

const RANK_VALUE: Record<string, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, 14 - index]),
);

function parseHand(hand: string) {
  return {
    high: RANK_VALUE[hand.charAt(0)] ?? 0,
    low: RANK_VALUE[hand.charAt(1)] ?? 0,
    kind: hand.length === 2 ? "p" : hand.charAt(2) === "s" ? "s" : "o",
  } as { high: number; low: number; kind: "p" | "s" | "o" };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hashSeed(seed: string, hand: string) {
  let hash = 2166136261;
  for (const character of `${seed}:${hand}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededFrequency(value: number, seed: string, hand: string) {
  if (value === 0 || value === 100) return value;
  const adjustment = [-5, 0, 5][hashSeed(seed, hand) % 3] ?? 0;
  return clamp(value + adjustment);
}

function pairThreeBetFrequency(rank: number) {
  return ({ 14: 100, 13: 100, 12: 85, 11: 50, 10: 25, 9: 12, 8: 6, 7: 3 }[rank] ?? 0);
}

function suitedThreeBetFrequency(high: number, low: number) {
  if (high === 14) {
    return ({ 13: 80, 12: 65, 11: 50, 10: 35, 9: 28, 8: 24, 7: 28, 6: 32, 5: 45, 4: 40, 3: 32, 2: 25 }[low] ?? 0);
  }
  if (high === 13) return ({ 12: 35, 11: 30, 10: 25, 9: 15, 8: 10, 7: 8, 6: 5, 5: 8, 4: 5 }[low] ?? 0);
  if (high === 12) return ({ 11: 25, 10: 18, 9: 10, 8: 8, 7: 6, 6: 4, 5: 4 }[low] ?? 0);
  if (high === 11) return ({ 10: 20, 9: 10, 8: 6, 7: 4, 6: 3 }[low] ?? 0);
  if (high === 10) return ({ 9: 12, 8: 6, 7: 4 }[low] ?? 0);
  if (high === 9) return ({ 8: 8, 7: 4 }[low] ?? 0);
  return 0;
}

function offsuitThreeBetFrequency(high: number, low: number) {
  if (high === 14) return ({ 13: 45, 12: 28, 11: 18, 10: 10, 9: 5 }[low] ?? 0);
  if (high === 13) return ({ 12: 15, 11: 10, 10: 7, 9: 3 }[low] ?? 0);
  if (high === 12) return ({ 11: 8, 10: 5 }[low] ?? 0);
  if (high === 11) return ({ 10: 4 }[low] ?? 0);
  return 0;
}

function pairCallFrequency(rank: number) {
  return ({ 14: 0, 13: 0, 12: 8, 11: 35, 10: 55, 9: 70, 8: 75, 7: 75, 6: 70, 5: 60, 4: 50, 3: 45, 2: 40 }[rank] ?? 0);
}

function suitedCallFrequency(high: number, low: number) {
  if (high === 14) return ({ 13: 10, 12: 25, 11: 35, 10: 45, 9: 52, 8: 50, 7: 45, 6: 42, 5: 35, 4: 38, 3: 42, 2: 45 }[low] ?? 0);
  if (high === 13) return ({ 12: 45, 11: 50, 10: 52, 9: 55, 8: 52, 7: 48, 6: 42, 5: 40, 4: 35, 3: 30, 2: 25 }[low] ?? 0);
  if (high === 12) return ({ 11: 48, 10: 52, 9: 55, 8: 50, 7: 45, 6: 40, 5: 35, 4: 30, 3: 25, 2: 20 }[low] ?? 0);
  if (high === 11) return ({ 10: 50, 9: 52, 8: 48, 7: 42, 6: 35, 5: 30, 4: 25, 3: 20, 2: 15 }[low] ?? 0);
  if (high === 10) return ({ 9: 48, 8: 45, 7: 40, 6: 35, 5: 30, 4: 25, 3: 20, 2: 15 }[low] ?? 0);
  if (high === 9) return ({ 8: 45, 7: 40, 6: 35, 5: 30, 4: 25, 3: 20, 2: 15 }[low] ?? 0);
  if (high === 8) return ({ 7: 40, 6: 35, 5: 30, 4: 25, 3: 20, 2: 15 }[low] ?? 0);
  if (high === 7) return ({ 6: 35, 5: 30, 4: 25, 3: 20, 2: 15 }[low] ?? 0);
  return 0;
}

function offsuitCallFrequency(high: number, low: number) {
  if (high === 14) return ({ 13: 18, 12: 25, 11: 30, 10: 26, 9: 20, 8: 15, 7: 10, 6: 8, 5: 6 }[low] ?? 0);
  if (high === 13) return ({ 12: 30, 11: 25, 10: 18, 9: 12, 8: 8, 7: 5 }[low] ?? 0);
  if (high === 12) return ({ 11: 24, 10: 16, 9: 10, 8: 6 }[low] ?? 0);
  if (high === 11) return ({ 10: 15, 9: 8 }[low] ?? 0);
  if (high === 10) return ({ 9: 8 }[low] ?? 0);
  return 0;
}

function bbResponse(hand: string, seed: string) {
  const { high, low, kind } = parseHand(hand);
  const threeBetBase = kind === "p"
    ? pairThreeBetFrequency(high)
    : kind === "s"
      ? suitedThreeBetFrequency(high, low)
      : offsuitThreeBetFrequency(high, low);
  const callBase = kind === "p"
    ? pairCallFrequency(high)
    : kind === "s"
      ? suitedCallFrequency(high, low)
      : offsuitCallFrequency(high, low);
  const threeBet = seededFrequency(threeBetBase, seed, `${hand}:3bet`);
  const call = Math.min(100 - threeBet, seededFrequency(callBase, seed, `${hand}:call`));
  return { fold: 100 - threeBet - call, call, three_bet: threeBet };
}

function makeRange(request: AiRangeRequest, seed: string): AiPreflopRange {
  const spot = request.spot === "btn_open"
    ? {
        id: "btn_open" as const,
        label: "BTN Open 2.5BB",
        opener: "BTN" as const,
        openSizeBb: 2.5 as const,
      }
    : {
        id: "bb_vs_btn_open" as const,
        label: "BB vs BTN Open 2.5BB",
        opener: "BTN" as const,
        defender: "BB" as const,
        openSizeBb: 2.5 as const,
        threeBetSizeBb: 10 as const,
      };
  const hands = STARTING_HANDS.map(hand => ({
    hand,
    frequencies: request.spot === "btn_open"
      ? BTN_OPEN_AI_RESPONSES[hand]!
      : bbResponse(hand, seed),
  }));
  return {
    schemaVersion: "solveagto.ai-preflop-range.v1",
    status: "ai_estimated",
    gtoVerified: false,
    disclaimer: "AI推定レンジ。GTO計算結果ではありません。",
    game: "Cash",
    players: 6,
    effectiveStackBb: request.effectiveStackBb ?? 100,
    spot,
    actions: request.spot === "btn_open" ? ["open", "fold"] : ["fold", "call", "three_bet"],
    provider: {
      kind: "deterministic_seed",
      name: "ai-knowledge-response",
      version: "v0.2",
      seed,
    },
    hands,
  };
}

export function validateAiRange(range: AiPreflopRange): AiRangeValidation {
  const errors: string[] = [];
  if (range.hands.length !== 169) errors.push(`expected 169 hands, found ${range.hands.length}`);
  if (new Set(range.hands.map(item => item.hand)).size !== 169) errors.push("hands must be unique");
  if (!STARTING_HANDS.every(hand => range.hands.some(item => item.hand === hand))) {
    errors.push("hands must contain every canonical starting hand");
  }
  for (const item of range.hands) {
    const values = range.actions.map(action => item.frequencies[action]);
    const numericValues = values.filter((value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100,
    );
    if (numericValues.length !== values.length) {
      errors.push(`${item.hand} contains a frequency outside 0..100`);
      continue;
    }
    const total = numericValues.reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 1e-6) errors.push(`${item.hand} frequencies sum to ${total}`);
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidAiRange(range: AiPreflopRange) {
  const validation = validateAiRange(range);
  if (!validation.valid) throw new Error(`Invalid AI range: ${validation.errors.join("; ")}`);
  return range;
}

export class DeterministicPreflopRangeProvider implements PreflopRangeProvider {
  constructor(private readonly seed = "solveagto-knowledge-base-v0.1") {}

  generate(request: AiRangeRequest): AiPreflopRange {
    if (request.effectiveStackBb !== undefined && request.effectiveStackBb !== 100) {
      throw new Error("Only 100BB is supported by the initial AI range provider.");
    }
    if (request.openSizeBb !== undefined && request.openSizeBb !== 2.5) {
      throw new Error("Only a 2.5BB open is supported by the initial AI range provider.");
    }
    return assertValidAiRange(makeRange(request, this.seed));
  }
}

export function createDefaultAiPreflopRanges() {
  const provider = new DeterministicPreflopRangeProvider();
  return {
    btn_open: provider.generate({ spot: "btn_open" }),
    bb_vs_btn_open: provider.generate({ spot: "bb_vs_btn_open" }),
  } satisfies Record<AiRangeSpotId, AiPreflopRange>;
}
