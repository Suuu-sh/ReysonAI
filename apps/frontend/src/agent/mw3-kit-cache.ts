// A table needs only its active hand's kit and one recent spot. Eviction drops
// the cache reference; it never invalidates a hand already using the same kit.
export function rememberMw3AgentKit<T>(current: ReadonlyMap<string, T>, id: string, value: T): Map<string, T> {
  const next = new Map(current);
  next.delete(id); next.set(id, value);
  while (next.size > 2) next.delete(next.keys().next().value!);
  return next;
}

export function touchMw3AgentKit<T>(current: Map<string, T>, id: string): Map<string, T> {
  if (!current.has(id) || [...current.keys()].at(-1) === id) return current;
  return rememberMw3AgentKit(current, id, current.get(id)!);
}
