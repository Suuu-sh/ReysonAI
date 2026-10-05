import { TIER_COLORS, TierEmblem, tierColor } from "./RankEmblem.tsx";
import { LEGEND, LEGEND_TOP_N, TIERS, TIER_EN, tierFor } from "./rank-store.ts";
import { localized } from "../locale.ts";

export { TIER_COLORS, tierColor };

export function RankBadge({ name, size = 48 }) {
  const level = name === LEGEND ? TIERS.length : Math.max(0, TIERS.findIndex(tier => tier.name === name));
  return <TierEmblem level={level} name={name} size={size} tier={TIER_EN[name]?.toLowerCase()} label={localized(`${localized(TIER_EN[name], name)} rank`, `${name}ランク`)} />;
}

export function RankLadder({ rating }) {
  const current = tierFor(rating);
  const index = TIERS.findIndex(tier => tier.name === current.name);
  // Fill across all seven pills (six tiers plus Legend) so the line ends under the current pill.
  const fill = (index + current.progress) / (TIERS.length + 1);
  return <ol className="rank-ladder" style={{ "--ladder-fill": fill, "--ladder-color": tierColor(current.name) }} aria-label={localized("Rank tiers and rating thresholds", "ランクと昇格レート")}>
    {TIERS.map(tier => <li key={tier.name} className={tier.name === current.name ? "current" : rating >= tier.min ? "reached" : ""} aria-current={tier.name === current.name ? "step" : undefined}
      style={{ "--tier": tierColor(tier.name), "--i": TIERS.indexOf(tier) }}>
      <RankBadge name={tier.name} size={34} /><span>{localized(TIER_EN[tier.name], tier.name)}</span><small>{tier.min.toLocaleString()}+</small>
    </li>)}
    <li className="rank-ladder-legend" style={{ "--tier": tierColor(LEGEND) }}>
      <RankBadge name={LEGEND} size={34} /><span>{localized("Legend", LEGEND)}</span><small className="rank-ladder-legend-copy" title={localized(`Top ${LEGEND_TOP_N} among Masters`, `マスターのうち上位${LEGEND_TOP_N}人`)}>{localized(`Top ${LEGEND_TOP_N} among Masters`, `マスターのうち上位${LEGEND_TOP_N}人`)}</small>
    </li>
  </ol>;
}
