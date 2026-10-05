import config from "../../../../configs/cash-6max-100bb.json" with { type: "json" };

export const rakeConfig = Object.freeze({ ...config.rake });
export const rakeMetadata = Object.freeze({
  rate: rakeConfig.rate,
  cap_bb: rakeConfig.cap_bb,
  no_flop_no_drop: rakeConfig.no_flop_no_drop,
  calibrated: true,
});

export function rake(potBb: number) {
  if (!Number.isFinite(potBb) || potBb < 0) throw new Error("ポット額は0以上の有限値である必要があります。");
  return Math.min(potBb * rakeConfig.rate, rakeConfig.cap_bb);
}

export function raked(potBb: number) {
  return potBb - rake(potBb);
}

export function hasConfiguredRake(metadata: { rake?: { rate?: number; cap_bb?: number; no_flop_no_drop?: boolean; calibrated?: boolean } } | null | undefined) {
  return Boolean(metadata?.rake &&
    metadata.rake.rate === rakeMetadata.rate &&
    metadata.rake.cap_bb === rakeMetadata.cap_bb &&
    metadata.rake.no_flop_no_drop === rakeMetadata.no_flop_no_drop &&
    metadata.rake.calibrated === rakeMetadata.calibrated);
}
