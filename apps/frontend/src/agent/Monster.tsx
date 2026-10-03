// Cute monster avatars drawn inline (no image files). Each character gets a body shape and a
// small feature from its id; colours come from characters.ts.
const SHAPES: Record<string, { body: string; extra?: string }> = {
  mochi: { body: "M14 62 C10 34 26 16 50 16 C74 16 90 34 86 62 C84 78 70 84 50 84 C30 84 16 78 14 62 Z" },
  poko: { body: "M24 52 C24 44 34 40 50 40 C66 40 76 44 76 52 L76 78 C76 84 70 86 50 86 C30 86 24 84 24 78 Z", extra: "cap" },
  lulu: { body: "M20 58 C20 38 32 26 50 26 C68 26 80 38 80 58 C80 76 68 86 50 86 C32 86 20 76 20 58 Z", extra: "ears" },
  donk: { body: "M22 54 C22 36 34 28 50 28 C66 28 78 36 78 54 C78 74 66 86 50 86 C34 86 22 74 22 54 Z", extra: "acorn" },
  nemu: { body: "M18 56 C18 34 32 22 50 22 C68 22 82 34 82 56 C82 76 68 86 50 86 C32 86 18 76 18 56 Z", extra: "tufts" },
  kira: { body: "M20 50 C20 30 34 20 50 20 C66 20 80 30 80 50 L80 60 L20 60 Z", extra: "tentacles" },
  pichi: { body: "M50 12 C62 32 80 46 80 62 C80 78 66 88 50 88 C34 88 20 78 20 62 C20 46 38 32 50 12 Z" },
  gabu: { body: "M16 60 C16 40 30 30 50 30 C70 30 84 40 84 60 C84 78 70 86 50 86 C30 86 16 78 16 60 Z", extra: "teeth" },
  mofu: { body: "M22 58 C12 56 12 40 24 38 C24 26 40 22 46 30 C52 20 70 22 72 34 C86 34 90 52 78 58 C80 74 66 84 50 84 C34 84 20 74 22 58 Z" },
  sora: { body: "M12 58 C12 40 30 28 52 28 C74 28 88 42 88 58 C88 76 72 86 50 86 C28 86 12 76 12 58 Z", extra: "spout" },
  bomu: { body: "M20 58 C20 40 34 28 50 28 C66 28 80 40 80 58 C80 76 66 88 50 88 C34 88 20 76 20 58 Z", extra: "fuse" },
  chili: { body: "M30 30 C50 22 74 34 76 58 C78 78 62 88 48 86 C32 84 22 72 24 56 C25 44 26 36 30 30 Z", extra: "stem" },
  goro: { body: "M14 66 C14 46 30 34 50 34 C70 34 86 46 86 66 C86 80 72 86 50 86 C28 86 14 80 14 66 Z", extra: "shell" },
  hino: { body: "M50 10 C58 26 76 34 78 56 C80 76 66 88 50 88 C34 88 20 76 22 56 C24 40 36 34 40 22 C44 30 46 34 50 10 Z" },
  garuru: { body: "M20 58 C20 40 32 30 50 30 C68 30 80 40 80 58 C80 76 68 86 50 86 C32 86 20 76 20 58 Z", extra: "wolf" },
  evi: { body: "M50 16 C62 30 84 40 84 60 C84 76 70 84 58 80 C56 86 60 90 64 92 L36 92 C40 90 44 86 42 80 C30 84 16 76 16 60 C16 40 38 30 50 16 Z" },
};

export function Monster({ id, color, size = 56, mood = "idle" }: { id: string; color: string; size?: number; mood?: "idle" | "win" | "fold" }) {
  const shape = SHAPES[id] ?? SHAPES.mochi;
  const dark = "#1c1c22";
  const eyeY = id === "kira" ? 44 : id === "pichi" || id === "hino" || id === "evi" ? 58 : 56;
  const sleepy = id === "nemu" || mood === "fold";
  return <svg className={`monster mood-${mood}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"><g className="monster-body">
    {shape.extra === "ears" && <><ellipse cx="36" cy="18" rx="7" ry="16" fill={color} /><ellipse cx="64" cy="18" rx="7" ry="16" fill={color} /></>}
    {shape.extra === "tufts" && <><path d="M26 30 L22 12 L38 24 Z" fill={color} /><path d="M74 30 L78 12 L62 24 Z" fill={color} /></>}
    {shape.extra === "wolf" && <><path d="M26 38 L26 14 L42 32 Z" fill={color} /><path d="M74 38 L74 14 L58 32 Z" fill={color} /></>}
    {shape.extra === "fuse" && <><path d="M50 28 C52 18 60 16 62 10" stroke="#8a7a5a" strokeWidth="3" fill="none" /><circle cx="63" cy="9" r="4" fill="#ffb347" /></>}
    {shape.extra === "spout" && <path d="M50 26 C46 16 40 14 38 10 M50 26 C54 16 60 14 62 10" stroke="#9fd0ff" strokeWidth="3" fill="none" strokeLinecap="round" />}
    {shape.extra === "stem" && <path d="M30 30 C28 20 36 14 44 16" stroke="#5aa860" strokeWidth="5" fill="none" strokeLinecap="round" />}
    {shape.extra === "tentacles" && [28, 40, 52, 64, 72].map(x => <path key={x} d={`M${x} 58 C${x - 4} 70 ${x + 4} 78 ${x} 88`} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" />)}
    {shape.extra === "shell" && <path d="M22 60 C24 38 76 38 78 60 Z" fill="#7d7468" opacity=".55" />}
    <path d={shape.body} fill={color} />
    {shape.extra === "cap" && <path d="M14 52 C14 26 32 14 50 14 C68 14 86 26 86 52 Z" fill="#e8584c" />}
    {shape.extra === "cap" && <><circle cx="34" cy="32" r="5" fill="#fff" opacity=".9" /><circle cx="60" cy="26" r="4" fill="#fff" opacity=".9" /><circle cx="70" cy="40" r="3.5" fill="#fff" opacity=".9" /></>}
    {shape.extra === "acorn" && <path d="M20 46 C22 26 78 26 80 46 Z" fill="#7a5532" />}
    <g className="monster-eyes">{sleepy
      ? <><path d={`M36 ${eyeY} q5 4 10 0`} stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" /><path d={`M54 ${eyeY} q5 4 10 0`} stroke={dark} strokeWidth="3" fill="none" strokeLinecap="round" /></>
      : <><ellipse cx="41" cy={eyeY} rx="4.5" ry="5.5" fill={dark} /><ellipse cx="59" cy={eyeY} rx="4.5" ry="5.5" fill={dark} />
        <circle cx="42.5" cy={eyeY - 2} r="1.6" fill="#fff" /><circle cx="60.5" cy={eyeY - 2} r="1.6" fill="#fff" /></>}</g>
    <ellipse cx="32" cy={eyeY + 9} rx="5" ry="3" fill="#ff8fb3" opacity=".55" />
    <ellipse cx="68" cy={eyeY + 9} rx="5" ry="3" fill="#ff8fb3" opacity=".55" />
    {shape.extra === "teeth"
      ? <path d={`M40 ${eyeY + 12} L60 ${eyeY + 12} L57 ${eyeY + 16} L54 ${eyeY + 12} L50 ${eyeY + 16} L46 ${eyeY + 12} L43 ${eyeY + 16} Z`} fill="#fff" />
      : <path d={mood === "win" ? `M44 ${eyeY + 10} q6 7 12 0` : `M46 ${eyeY + 11} q4 3 8 0`} stroke={dark} strokeWidth="2.6" fill="none" strokeLinecap="round" />}
  </g></svg>;
}
