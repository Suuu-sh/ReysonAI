import type { RangeFacts } from "../../scripts/postflop-ai/range-facts.ts";
export type DefenceFacts = {
  node?: string | null; street?: string | null; role?: string | null;
  pot_before_bb: number | null; bet_bb: number | null; call_bb: number | null; rake_bb: number | null;
  required_equity: number | null; equity: number | null; realization: number | null; realized_equity: number | null;
  percentile: number | null; defence_frequency: number | null; mdf: number | null;
  bettor_range?: { value_pct?: number | null; bluff_pct?: number | null } | null;
  blockers?: { value_removed_pct?: number | null; bluff_removed_pct?: number | null } | null;
  faced_action?: { aliases?: (string | null)[] | null; allIn?: boolean | null; wasReduced?: boolean | null; action?: string | null; capped?: boolean | null; alpha?: number | null; bluff_share_after_pct?: number | null } | null;
};
export type ExplanationFacts = {
  kind?: string | null; spot?: string | null; board?: string | null; node?: string | null; street?: string | null; line?: string | null; cards?: string | null;
  equity?: number | null; aggregate?: { kind: string; combo_count: number; reach_weight: number };
  actions?: Record<string, { foldShare?: number | null; required?: number | null; groups?: { key: string | null; share: number | null }[] }>;
  defence?: DefenceFacts | null; betting?: { equity_vs_defender?: number | null; actions?: { action: string | null; alpha?: number | null; bluffs_per_100_value?: number | null; capped?: boolean | null }[] } | null;
  bet_table?: { actions?: Record<string, { calledEquity?: number | null }> } | null;
  range_facts?: RangeFacts | null;
};
