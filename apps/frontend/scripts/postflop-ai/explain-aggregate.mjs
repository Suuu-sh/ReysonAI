// Aggregate exact-combo explanations into a reach-weighted hand-class average.
// The output never chooses an arbitrary representative combo.
function averageValue(values, weights) {
  let total = 0, weight = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || !(weights[index] > 0)) return;
    total += value * weights[index];
    weight += weights[index];
  });
  return weight > 0 ? total / weight : null;
}

function mergeValues(values, weights, key = "") {
  if (key === "hands") return [];
  if (values.every(value => typeof value === "number" || value == null)) return averageValue(values, weights);
  if (values.every(value => Array.isArray(value))) {
    const size = Math.max(0, ...values.map(value => value.length));
    return Array.from({ length: size }, (_, index) => mergeValues(values.map(value => value[index]), weights));
  }
  if (values.every(value => value && typeof value === "object" && !Array.isArray(value))) {
    const keys = [...new Set(values.flatMap(value => Object.keys(value)))];
    return Object.fromEntries(keys.map(name => [name,
      mergeValues(values.map(value => value[name]), weights, name)]));
  }
  const first = values.find(value => value !== undefined);
  return values.every(value => value === first || value === undefined) ? first ?? null : null;
}

export function averageExplanationFacts(entries) {
  const usable = (entries ?? []).filter(item => item?.facts && Number.isFinite(item.weight) && item.weight > 0);
  if (!usable.length) throw new Error("A reachable combo is required for a hand-class explanation.");
  const weights = usable.map(item => item.weight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const facts = mergeValues(usable.map(item => item.facts), weights);
  return { ...facts, cards: null,
    aggregate: { kind: "hand_class_average", combo_count: usable.length, reach_weight: totalWeight } };
}
