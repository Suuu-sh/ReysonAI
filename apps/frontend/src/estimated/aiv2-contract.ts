export const AIV2_METHOD = "llm-range-wide-combo-v3";
export const AIV2_PRE_FLOP_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses",
  "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "limp-deep-responses",
  "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses", "continuation-responses"] as const;
export const AIV2_PROFILES = ["nit", "station", "lag", "maniac"] as const;
export const AIV2_PROFILE_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses",
  "five-bet-responses", "limp-responses", "limp-deep-responses"] as const;

const requiredFiles = [
  ...AIV2_PRE_FLOP_DATASETS.map(name => `${name}.json`),
  ...AIV2_PROFILES.flatMap(profile => AIV2_PROFILE_DATASETS.map(name => `profiles/${profile}/villain/${name}.json`)),
  ...AIV2_PROFILES.map(profile => `profiles/${profile}/villain/meta.json`),
];

export function isCompleteAiv2Manifest(value: any): boolean {
  return value?.source === "AIv2" && value?.status === "complete" && value?.method === AIV2_METHOD &&
    value?.coverage?.scope === "preflop" && value.coverage.spots === 2116 && value.coverage.actionable_spots === 2100 &&
    value.coverage.hand_classes === 357604 && value.coverage.concrete_combo_instances === 2784600 &&
    Array.isArray(value.coverage.reasons) && value.coverage.reasons.length === 2100 &&
    new Set(value.coverage.reasons).size === 2100 && requiredFiles.every(path =>
      value.coverage.datasets?.includes(path) || value.coverage.profiles?.includes(path)) &&
    [...requiredFiles, ...value.coverage.reasons.map((name: string) => `reasons/${name}`)].every(path =>
      /^[a-f0-9]{64}$/.test(value.sha256?.[path] ?? ""));
}
