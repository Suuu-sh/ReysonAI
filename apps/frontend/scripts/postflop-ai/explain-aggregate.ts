export type Averaged<T> = T extends number ? number | null : T extends readonly (infer E)[] ? Averaged<E>[] : T extends object ? { [K in keyof T]: Averaged<T[K]> } : T | null;
export type AverageFacts<T> = Omit<Averaged<T>, "cards"> & { cards: null; aggregate: { kind: "hand_class_average"; combo_count: number; reach_weight: number } };
// Aggregate exact-combo explanations into a reach-weighted hand-class average.
// The output never chooses an arbitrary representative combo.
function averageValue(values: readonly (number | null | undefined)[], weights: readonly number[]): number | null {
  let total = 0, weight = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || !(weights[index] > 0)) return;
    total += value! * weights[index];
    weight += weights[index];
  });
  return weight > 0 ? total / weight : null;
}

function mergeValues(values: readonly unknown[], weights: readonly number[], key = ""): unknown {
  if (key === "hands") return [];
  if (values.every(value => typeof value === "number" || value == null)) return averageValue(values as (number | null | undefined)[], weights);
  if (values.every(value => Array.isArray(value))) {
    const size = Math.max(0, ...values.map(value => value.length));
    return Array.from({ length: size }, (_, index) => mergeValues(values.map(value => value[index]), weights));
  }
  if (values.every(value => value && typeof value === "object" && !Array.isArray(value))) {
    const keys = [...new Set(values.flatMap(value => Object.keys(value as object)))];
    return Object.fromEntries(keys.map(name => [name,
      mergeValues(values.map(value => (value as Record<string, unknown>)[name]), weights, name)]));
  }
  const first = values.find(value => value !== undefined);
  return values.every(value => value === first || value === undefined) ? first ?? null : null;
}

export function averageExplanationFacts<T extends object>(entries: readonly { facts: T | null | undefined; weight: number }[] | null | undefined): AverageFacts<T> {
  const usable = (entries ?? []).filter(item => item?.facts && Number.isFinite(item.weight) && item.weight > 0);
  if (!usable.length) throw new Error("A reachable combo is required for a hand-class explanation.");
  const weights = usable.map(item => item.weight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const facts = mergeValues(usable.map(item => item.facts), weights) as Averaged<T>;
  return { ...facts, cards: null,
    aggregate: { kind: "hand_class_average", combo_count: usable.length, reach_weight: totalWeight } } as AverageFacts<T>;
}
