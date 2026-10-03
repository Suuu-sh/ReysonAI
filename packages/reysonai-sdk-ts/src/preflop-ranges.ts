import { BB_VS_BTN_OPEN_AI_RESPONSES, BTN_OPEN_AI_RESPONSES } from "./preflop-ai-responses.js";
import { BB_VS_BTN_OPEN_AI_REASONS, BTN_OPEN_AI_REASONS } from "./preflop-ai-reasons.js";

export const AI_RANGE_SPOTS = ["btn_open", "bb_vs_btn_open"] as const;
export type AiRangeSpotId = (typeof AI_RANGE_SPOTS)[number];

export type AiRangeAction = "open" | "fold" | "call" | "three_bet";

export type AiRangeHand = {
  hand: string;
  frequencies: Partial<Record<AiRangeAction, number>>;
  raiseSizeBb?: number;
  reason?: string;
};

export type AiRangeSpot = {
  id: AiRangeSpotId;
  label: string;
  opener: "BTN";
  defender?: "BB";
  openSizeBb: 2.5;
  raiseSizesBb?: number[];
};

export type AiRangeProviderMetadata = {
  kind: "deterministic_seed";
  name: "ai-knowledge-response";
  version: "v0.3";
  seed: string;
};

export type AiPreflopRange = {
  schemaVersion: "reysonai.ai-preflop-range.v1";
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

function makeRange(request: AiRangeRequest, seed: string): AiPreflopRange {
  const spot = request.spot === "btn_open"
    ? {
        id: "btn_open" as const,
        label: "BTN Open 2.5BB",
        opener: "BTN" as const,
        openSizeBb: 2.5 as const,
        raiseSizesBb: [2.5],
      }
    : {
        id: "bb_vs_btn_open" as const,
        label: "BB vs BTN Open 2.5BB",
        opener: "BTN" as const,
        defender: "BB" as const,
        openSizeBb: 2.5 as const,
        raiseSizesBb: [9, 9.5, 10, 10.5, 11],
      };
  const isBtnOpen = request.spot === "btn_open";
  const responses = isBtnOpen ? BTN_OPEN_AI_RESPONSES : BB_VS_BTN_OPEN_AI_RESPONSES;
  const reasons = isBtnOpen ? BTN_OPEN_AI_REASONS : BB_VS_BTN_OPEN_AI_REASONS;
  const hands = STARTING_HANDS.map(hand => {
    const response = responses[hand]!;
    const { three_bet_size_bb: raiseSizeBb, ...frequencies } = response;
    return {
      hand,
      frequencies,
      ...(raiseSizeBb === undefined ? {} : { raiseSizeBb }),
      reason: reasons[hand]!,
    };
  });
  return {
    schemaVersion: "reysonai.ai-preflop-range.v1",
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
      version: "v0.3",
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
    if (item.frequencies.three_bet && (!Number.isFinite(item.raiseSizeBb) || (item.raiseSizeBb ?? 0) <= 0)) {
      errors.push(`${item.hand} has 3bet frequency but no AI-selected raise size`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidAiRange(range: AiPreflopRange) {
  const validation = validateAiRange(range);
  if (!validation.valid) throw new Error(`Invalid AI range: ${validation.errors.join("; ")}`);
  return range;
}

export class DeterministicPreflopRangeProvider implements PreflopRangeProvider {
  constructor(private readonly seed = "reysonai-ai-knowledge-response-v0.3") {}

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
