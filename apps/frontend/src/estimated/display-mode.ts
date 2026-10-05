import type { HandAggregate } from "../data.ts";
import { label } from "../data.ts";

export const displayModes = [
  { value: "simple", label: "シンプル" },
  { value: "standard", label: "スタンダード" },
];

// Maps a future sign-up skill level to its default display mode.
export const defaultModeForLevel = (level: string) => level === "beginner" ? "simple" : "standard";

export function dominantAction(aggregate: Pick<HandAggregate, "actions">, actions: readonly string[]) {
  return actions.reduce((best, action) => (aggregate.actions[action] ?? 0) > (aggregate.actions[best] ?? 0) ? action : best, actions[0]);
}

// One-line plain-language summary of a mixed strategy, e.g. 「基本はコール、ときどきレイズ 12BB」.
export function summarizeMix(aggregate: Pick<HandAggregate, "actions">, actions: readonly string[], labels: Readonly<Record<string, string>> = {}) {
  const name = (action: string) => labels[action] ?? label(action);
  const [first, second] = [...actions].sort((a, b) => (aggregate.actions[b] ?? 0) - (aggregate.actions[a] ?? 0));
  const top = aggregate.actions[first] ?? 0;
  const next = aggregate.actions[second] ?? 0;
  if (top >= 0.9 || next < 0.1) return `${name(first)}`;
  if (top >= 0.6) return `基本は${name(first)}、ときどき${name(second)}`;
  return `${name(first)}と${name(second)}を混ぜる`;
}
