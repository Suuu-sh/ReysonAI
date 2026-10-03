import { useId } from "react";

// Agent avatars drawn inline: a dark helmet with a glowing visor. Each agent has its own visor
// shape and colour (characters.ts). `state` dims the visor on a fold and brightens it on a win.
const VISORS: Record<string, (color: string) => JSX.Element> = {
  orion: color => <rect x="33" y="44" width="34" height="7" rx="3.5" fill={color} />,
  vega: color => <><circle cx="50" cy="48" r="7.5" fill="none" stroke={color} strokeWidth="2.5" /><circle cx="50" cy="48" r="3" fill={color} /></>,
  nova: color => <path d="M33 41 L50 51 L67 41 L67 46.5 L50 56.5 L33 46.5 Z" fill={color} />,
  atlas: color => <><rect x="34" y="45" width="12" height="5" rx="1.5" fill={color} /><rect x="54" y="45" width="12" height="5" rx="1.5" fill={color} /></>,
  lyra: color => <path d="M33 50 Q50 38 67 50 L67 53.5 Q50 42.5 33 53.5 Z" fill={color} />,
  zero: color => <>{[38, 46, 54, 62].map(x => <rect key={x} x={x - 2} y="45.5" width="4" height="4" rx="1" fill={color} />)}</>,
};

export function AgentAvatar({ id, color, size = 56, state = "idle" }: { id: string; color: string; size?: number; state?: "idle" | "win" | "fold" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const visor = VISORS[id] ?? VISORS.orion;
  const lit = state === "fold" ? "#4a4d57" : color;
  return <svg className={`agent-unit is-${state}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <clipPath id={`clip-${uid}`}><circle cx="50" cy="50" r="48" /></clipPath>
      <linearGradient id={`shell-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a3d47" /><stop offset=".55" stopColor="#1d1f26" /><stop offset="1" stopColor="#121318" /></linearGradient>
      <radialGradient id={`bg-${uid}`} cx="50%" cy="38%" r="70%"><stop offset="0" stopColor={lit} stopOpacity=".22" /><stop offset="1" stopColor="#0b0b0e" stopOpacity="1" /></radialGradient>
      <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={state === "win" ? 3.2 : 2} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <g clipPath={`url(#clip-${uid})`}>
      <rect width="100" height="100" fill={`url(#bg-${uid})`} />
      <path d="M14 104 C16 84 31 77 50 77 C69 77 84 84 86 104 Z" fill="#191a20" stroke="rgb(255 255 255 / 6%)" />
      <path d="M40 77 L50 86 L60 77" fill="none" stroke={lit} strokeOpacity=".55" strokeWidth="1.5" />
      <path d="M29 72 L29 45 C29 31 38 23 50 23 C62 23 71 31 71 45 L71 72 Q50 80 29 72 Z" fill={`url(#shell-${uid})`} stroke="rgb(255 255 255 / 10%)" />
      <path d="M33 38 C35 30 41 26 50 26" fill="none" stroke="rgb(255 255 255 / 18%)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="30" y="39" width="40" height="19" rx="7" fill="#07080b" />
      <g className="agent-unit-visor" filter={`url(#glow-${uid})`}>{visor(lit)}</g>
      <path d="M50 23 L50 31" stroke={lit} strokeOpacity=".7" strokeWidth="1.5" />
    </g>
    <circle cx="50" cy="50" r="48" fill="none" stroke={lit} strokeOpacity={state === "win" ? .9 : .35} strokeWidth="2" />
  </svg>;
}
