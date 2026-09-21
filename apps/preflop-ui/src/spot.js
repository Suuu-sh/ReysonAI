export const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
export const presets = [
  { opener: "BTN", hero: "BB" },
  { opener: "SB", hero: "BB" },
  { opener: "CO", hero: "BB" },
  { opener: "CO", hero: "BTN" },
  { opener: "UTG", hero: "BB" },
];

export function responders(opener) {
  const index = positions.indexOf(opener);
  return index < 0 ? [] : positions.slice(index + 1);
}

// This builder models facing an open, not a 3-bet or a multiway call.
// Omitted seats fold, matching the read-only resolve API contract.
export function spotRequest(solutionId, spot, stackBb) {
  if (!responders(spot.opener).includes(spot.hero)) {
    throw new Error("オープン位置より後の対応位置を選択してください。");
  }
  const size = Number(spot.size);
  if (!Number.isFinite(size) || size < 2 || size >= stackBb) {
    throw new Error(`オープンサイズは2 BB以上、${stackBb} BB未満で指定してください。`);
  }
  return {
    solutionId,
    heroPosition: spot.hero,
    actions: [{ position: spot.opener, action: "raise", sizeBb: size }],
  };
}
export function spotTitle(spot) {
  return `${spot.opener} vs ${spot.hero} · ${spot.size || "—"} BB open`;
}
