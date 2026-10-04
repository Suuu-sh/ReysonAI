import { useId } from "react";
import type { StyleId } from "./player-read.ts";

// Play-style mascots. They share the Agents' dark shell and glow, but are animal faces in a
// rounded-square frame, so a style is never mistaken for an Agent (round frame, helmet, visor).
// `head` is the shell silhouette; `face` draws the glowing eyes and details in the style colour.
type Part = (color: string) => JSX.Element;
const DARK = "#07080b";

const MASCOTS: Record<StyleId, { head: string; face: Part }> = {
  // Owl: watches everything, takes the middle road.
  balanced: {
    head: "M26 84 L26 46 C26 36 30 30 36 28 L31 14 L44 25 C48 24.4 52 24.4 56 25 L69 14 L64 28 C70 30 74 36 74 46 L74 84 Z",
    face: c => <>
      <circle cx="40" cy="48" r="10" fill={DARK} /><circle cx="60" cy="48" r="10" fill={DARK} />
      <circle cx="40" cy="48" r="4.5" fill={c} /><circle cx="60" cy="48" r="4.5" fill={c} />
      <path d="M46.5 57 L53.5 57 L50 64 Z" fill={c} fillOpacity=".7" />
      <path d="M36 72 L40 68 L44 72 M48 72 L52 68 L56 72 M60 72 L64 68" fill="none" stroke={c} strokeOpacity=".3" strokeWidth="1.5" />
    </>,
  },
  // Turtle: stays in its shell and only comes out with a strong hand.
  nit: {
    head: "M33 64 L33 44 C33 33 40 26 50 26 C60 26 67 33 67 44 L67 64 Z M8 100 C10 76 28 62 50 62 C72 62 90 76 92 100 Z",
    face: c => <>
      <path d="M40 45 Q43.5 42.5 47 45" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M53 45 Q56.5 42.5 60 45" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 74 L50 68 L60 74 L60 85 L50 91 L40 85 Z M40 74 L28 70 M60 74 L72 70 M40 85 L30 92 M60 85 L70 92" fill="none" stroke={c} strokeOpacity=".45" strokeWidth="1.6" />
    </>,
  },
  // Wolf: picks its spots, then attacks.
  tag: {
    head: "M27 30 L35 13 L45 27 L55 27 L65 13 L73 30 L73 55 C73 66 63 78 50 83 C37 78 27 66 27 55 Z",
    face: c => <>
      <path d="M35 44 L46 48 L46 51.5 L36 48.5 Z" fill={c} /><path d="M65 44 L54 48 L54 51.5 L64 48.5 Z" fill={c} />
      <path d="M40 60 L60 60 L50 78 Z" fill={DARK} /><circle cx="50" cy="65" r="3" fill={c} fillOpacity=".7" />
      <path d="M35 19 L38 25 M65 19 L62 25" stroke={c} strokeOpacity=".4" strokeWidth="1.5" />
    </>,
  },
  // Mouse: careful, and calls rather than raises.
  tight_passive: {
    head: "M30 17 A13 13 0 1 1 29.9 17 Z M70 17 A13 13 0 1 1 69.9 17 Z M28 58 C28 42 38 34 50 34 C62 34 72 42 72 58 C72 72 62 82 50 82 C38 82 28 72 28 58 Z",
    face: c => <>
      <circle cx="30" cy="30" r="7" fill={c} fillOpacity=".22" /><circle cx="70" cy="30" r="7" fill={c} fillOpacity=".22" />
      <circle cx="42" cy="54" r="3.2" fill={c} /><circle cx="58" cy="54" r="3.2" fill={c} />
      <circle cx="50" cy="66" r="2.6" fill={c} />
      <path d="M44 67 L32 64 M44 69 L32 71 M56 67 L68 64 M56 69 L68 71" stroke={c} strokeOpacity=".4" strokeWidth="1.2" />
    </>,
  },
  // Shark: in many pots and always pushing.
  lag: {
    head: "M44 32 L55 9 L60 32 C70 35 78 46 78 62 L78 82 L22 82 L22 62 C22 46 32 34 44 32 Z",
    face: c => <>
      <circle cx="35" cy="50" r="3.8" fill={c} /><circle cx="65" cy="50" r="3.8" fill={c} />
      <path d="M29 64 Q50 74 71 64 L71 70 Q50 82 29 70 Z" fill={DARK} />
      <path d="M33 66.5 L36 71 L39 68.2 L42 72.6 L45 69.3 L48 73.4 L51 69.6 L54 73.4 L57 69.3 L60 72.6 L63 68.2 L66 71 L67 66" fill="none" stroke={c} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M26 58 L31 57 M26 61 L31 60 M74 58 L69 57 M74 61 L69 60" stroke={c} strokeOpacity=".4" strokeWidth="1.2" />
    </>,
  },
  // Fish: mouth always open, calls everything.
  station: {
    head: "M38 36 Q50 18 63 35 C73 39 80 48 80 58 C80 72 66 80 50 80 C34 80 20 72 20 58 C20 48 27 40 38 36 Z M20 58 L10 50 L12 66 Z M80 58 L90 50 L88 66 Z",
    face: c => <>
      <circle cx="39" cy="52" r="7" fill={DARK} /><circle cx="61" cy="52" r="7" fill={DARK} />
      <circle cx="39" cy="52" r="3.6" fill={c} /><circle cx="61" cy="52" r="3.6" fill={c} />
      <circle cx="50" cy="68" r="5" fill={DARK} stroke={c} strokeWidth="2" />
      <circle cx="76" cy="27" r="3" fill="none" stroke={c} strokeOpacity=".5" strokeWidth="1.3" />
      <circle cx="82" cy="17" r="2" fill="none" stroke={c} strokeOpacity=".4" strokeWidth="1.2" />
    </>,
  },
  // Cat: relaxed, happy to watch.
  passive: {
    head: "M28 38 L30 16 L43 30 C47 29 53 29 57 30 L70 16 L72 38 C76 45 76 55 74 63 C70 75 60 81 50 81 C40 81 30 75 26 63 C24 55 24 45 28 38 Z",
    face: c => <>
      <path d="M36 51 Q41 46 46 51" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M54 51 Q59 46 64 51" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M47 60 L53 60 L50 64 Z" fill={c} fillOpacity=".75" />
      <path d="M44 63 L30 60 M44 66 L30 67 M56 63 L70 60 M56 66 L70 67" stroke={c} strokeOpacity=".4" strokeWidth="1.2" />
      <path d="M32 21 L35 29 M68 21 L65 29" stroke={c} strokeOpacity=".35" strokeWidth="1.5" />
    </>,
  },
  // Bull: charges in with raises.
  aggressive: {
    head: "M32 34 C20 33 12 25 13 13 C19 23 26 27 35 28 L65 28 C74 27 81 23 87 13 C88 25 80 33 68 34 C72 44 72 54 68 63 L64 76 C58 83 42 83 36 76 L32 63 C28 54 28 44 32 34 Z",
    face: c => <>
      <path d="M33 31 C22 30 15 23 14.5 15 M67 31 C78 30 85 23 85.5 15" fill="none" stroke={c} strokeOpacity=".5" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M35 44 L46 48 L45 51 L36 48 Z" fill={c} /><path d="M65 44 L54 48 L55 51 L64 48 Z" fill={c} />
      <ellipse cx="50" cy="68" rx="14" ry="9" fill={DARK} />
      <circle cx="44.5" cy="67" r="2.4" fill={c} /><circle cx="55.5" cy="67" r="2.4" fill={c} />
      <circle cx="50" cy="79" r="4" fill="none" stroke={c} strokeWidth="1.8" />
    </>,
  },
  // Not read yet: an unlit silhouette.
  collecting: {
    head: "M50 26 A17 17 0 1 1 49.9 26 Z M20 100 C22 78 34 68 50 68 C66 68 78 78 80 100 Z",
    face: c => <>
      <path d="M45 39 C45 35.5 47.5 34 50 34 C53 34 55.5 36 55.5 39 C55.5 42.5 50.5 43.5 50.5 47 L50.5 48.5" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="50.5" cy="54" r="1.8" fill={c} />
    </>,
  },
};

export function StyleAvatar({ id, color, size = 56, dim = false }: { id: StyleId; color: string; size?: number; dim?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const mascot = MASCOTS[id] ?? MASCOTS.collecting;
  const lit = dim ? "#8a8f9c" : color;
  return <svg className={`style-unit${dim ? " is-dim" : ""}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <clipPath id={`sclip-${uid}`}><rect x="2" y="2" width="96" height="96" rx="24" /></clipPath>
      <linearGradient id={`sshell-${uid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a3d47" /><stop offset=".55" stopColor="#1d1f26" /><stop offset="1" stopColor="#121318" /></linearGradient>
      <radialGradient id={`sbg-${uid}`} cx="50%" cy="40%" r="72%"><stop offset="0" stopColor={lit} stopOpacity=".24" /><stop offset="1" stopColor="#0b0b0e" /></radialGradient>
      <filter id={`sglow-${uid}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    </defs>
    <g clipPath={`url(#sclip-${uid})`}>
      <rect width="100" height="100" fill={`url(#sbg-${uid})`} />
      <path d={mascot.head} fill={`url(#sshell-${uid})`} stroke="rgb(255 255 255 / 10%)" fillRule="nonzero" />
      <g className="style-unit-face" filter={`url(#sglow-${uid})`}>{mascot.face(lit)}</g>
    </g>
    <rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke={lit} strokeOpacity={dim ? .25 : .5} strokeWidth="2" />
  </svg>;
}
