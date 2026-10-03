// Rank emblem drawing with no store or dataset imports, so the marketing site can show the
// same emblems as the app (RankBadge.tsx wraps it for the trainer).
import { useId } from "react";

// Flat, geometric rank emblems drawn inline. Each tier adds one element (Bronze a single gem,
// Master a crowned, winged crystal) so the order reads at a glance even at 24px.
// [light, dark] fill per tier; the first is also the tier's accent colour.
export const TIER_COLORS: Record<string, [string, string]> = {
  ブロンズ: ["#d99a6c", "#7a4424"],
  シルバー: ["#e8ebf1", "#7f8796"],
  ゴールド: ["#ffd76a", "#b97a12"],
  プラチナ: ["#7ff0dc", "#1f8f86"],
  ダイヤモンド: ["#c3a8ff", "#6a43e8"],
  マスター: ["#ff7ab2", "#a3124f"],
};
export const tierColor = (name: string) => TIER_COLORS[name]?.[0] ?? "#f0609e";

function Emblem({ level, fill }: { level: number; fill: string }) {
  const wing = (side: 1 | -1) => <path d={`M${50 + side * 14} 42 L${50 + side * 40} 32 L${50 + side * 31} 49 L${50 + side * 40} 58 L${50 + side * 14} 60 Z`} fill={fill} opacity=".8" />;
  return <>
    {level >= 3 && <>{wing(1)}{wing(-1)}</>}
    {level >= 4 && <><path d="M64 64 L86 70 L66 76 Z" fill={fill} opacity=".6" /><path d="M36 64 L14 70 L34 76 Z" fill={fill} opacity=".6" /></>}
    {level >= 5 && <path d="M37 21 L44 29 L50 15 L56 29 L63 21 L61 32 L39 32 Z" fill={fill} />}
    {/* Core gem: a diamond that gains a cut with the tier. */}
    <path d="M50 26 L68 48 L50 80 L32 48 Z" fill={fill} />
    <path d="M50 26 L68 48 L50 52 Z" fill="#fff" opacity=".45" />
    <path d="M50 26 L50 52 L32 48 Z" fill="#fff" opacity=".18" />
    <path d="M32 48 L50 52 L50 80 Z" fill="#000" opacity=".2" />
    {level >= 1 && <path d="M41 48 L50 38 L59 48 L50 62 Z" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />}
    {level >= 2 && <path d="M50 84 L56 92 L50 89 L44 92 Z" fill={fill} />}
  </>;
}

// `level` is the tier index (0 Bronze … 5 Master); `name` picks the colours (Japanese tier name).
export function TierEmblem({ level, name, size = 48, label, tier }: { level: number; name: string; size?: number; label?: string; tier?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [light, dark] = TIER_COLORS[name] ?? TIER_COLORS["ブロンズ"];
  return <svg className="rank-badge" data-tier={tier} width={size} height={size} viewBox="0 0 100 100" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <defs>
      <linearGradient id={`rank-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={light} /><stop offset="1" stopColor={dark} /></linearGradient>
    </defs>
    <Emblem level={level} fill={`url(#rank-${uid})`} />
  </svg>;
}
