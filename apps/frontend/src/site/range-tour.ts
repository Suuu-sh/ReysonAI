/** Pick uniformly from the other saved ranges; never invent or alter a strategy. */
export function pickNextRangeIndex(current: number, count: number, random = Math.random): number {
  if (count <= 1) return 0;
  const next = Math.floor(random() * (count - 1));
  return next >= current ? next + 1 : next;
}
