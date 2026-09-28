import { label } from "../data.ts";

export const displayModes = [
  { value: "simple", label: "シンプル" },
  { value: "standard", label: "スタンダード" },
];

// Maps a future sign-up skill level to its default display mode.
export const defaultModeForLevel = level => level === "beginner" ? "simple" : "standard";

export function dominantAction(aggregate, actions) {
  return actions.reduce((best, action) => (aggregate.actions[action] ?? 0) > (aggregate.actions[best] ?? 0) ? action : best, actions[0]);
}

// One-line plain-language summary of a mixed strategy, e.g. 「基本はコール、ときどきレイズ 12BB」.
export function summarizeMix(aggregate, actions, labels = {}) {
  const name = action => labels[action] ?? label(action);
  const [first, second] = [...actions].sort((a, b) => (aggregate.actions[b] ?? 0) - (aggregate.actions[a] ?? 0));
  const top = aggregate.actions[first] ?? 0;
  const next = aggregate.actions[second] ?? 0;
  if (top >= 0.9 || next < 0.1) return `${name(first)}`;
  if (top >= 0.6) return `基本は${name(first)}、ときどき${name(second)}`;
  return `${name(first)}と${name(second)}を混ぜる`;
}
