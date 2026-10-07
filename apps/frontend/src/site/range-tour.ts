/** Equal preflop/postflop exposure, then uniform within the chosen saved group. */
export function pickNextRangeIndex(current: number, count: number, preflopCount = count, random = Math.random): number {
  if (count <= 1) return 0;
  const preflop = Array.from({ length: preflopCount }, (_, index) => index).filter(index => index !== current);
  const postflop = Array.from({ length: count - preflopCount }, (_, index) => preflopCount + index).filter(index => index !== current);
  const chosen = preflop.length && postflop.length ? (random() < .5 ? preflop : postflop) : preflop.length ? preflop : postflop;
  return chosen[Math.floor(random() * chosen.length)];
}
