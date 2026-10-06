// Explanation margin uses the same one-decimal equity/threshold as saved facts.
// Raw equity and margin remain the caller's inputs to the strategy policy.
export function fiveBetEquityLead({ equity, need, fiveBettor }) {
  const shownEquity = Math.round(equity * 10) / 10;
  const shownNeed = Math.round(need * 10) / 10;
  const margin = shownEquity - shownNeed;
  return margin >= 0
    ? `${fiveBettor}のオールインレンジに対する勝率は${shownEquity.toFixed(1)}%で、必要勝率${shownNeed.toFixed(1)}%を${margin.toFixed(1)}pt上回ります。`
    : `${fiveBettor}のオールインレンジに対する勝率は${shownEquity.toFixed(1)}%で、必要勝率${shownNeed.toFixed(1)}%に${(-margin).toFixed(1)}pt届きません。`;
}
