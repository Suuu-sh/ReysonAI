export const POSTFLOP_SIZINGS = ["multi", "single"] as const;
export type PostflopSizing = typeof POSTFLOP_SIZINGS[number];

export function normalizeSizing(value: unknown): PostflopSizing {
  if (value === undefined || value === null) return "multi";
  if (value === "multi" || value === "single") return value;
  throw new Error("Invalid postflop sizing");
}
