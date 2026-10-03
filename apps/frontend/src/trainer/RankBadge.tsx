import { TIERS, TIER_EN, tierFor } from "./rank-store.ts";
import { localized } from "../locale.ts";

export function RankBadge({ name, size = 48 }) {
  return <img className="rank-badge" src={`/ranks/${TIER_EN[name].toLowerCase()}.png`} width={size} height={size} alt={localized(`${TIER_EN[name]} rank`, `${name}ランク`)} />;
}

export function RankLadder({ rating }) {
  const current = tierFor(rating);
  return <ol className="rank-ladder" aria-label={localized("Rank tiers and rating thresholds", "ランクと昇格レート")}>
    {TIERS.map(tier => <li key={tier.name} className={tier.name === current.name ? "current" : rating >= tier.min ? "reached" : ""} aria-current={tier.name === current.name ? "step" : undefined}>
      <RankBadge name={tier.name} size={52} /><span>{localized(TIER_EN[tier.name], tier.name)}</span><small>{tier.min.toLocaleString()}+</small>
    </li>)}
  </ol>;
}
