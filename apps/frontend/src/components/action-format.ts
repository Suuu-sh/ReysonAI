// Shared presentation helpers; strategy calculations remain in data.ts.
export const pct = (value: unknown): string => typeof value === "number" && Number.isFinite(value)
  ? (value * 100).toFixed(1) + "%"
  : "未計算";

const ACTION_COLORS: Readonly<Record<string, string>> = Object.freeze({
  fold: "#26262c",
  call: "#3a9fb4",
  limp: "#4fa865",
  check: "#6b7686",
  bet33: "#d9477f",
  bet75: "#a85cde",
  bet125: "#6e3fb8",
  all_in: "#8a5fd6",
  raise: "#d9477f",
});

const ACTION_LABELS: Readonly<Record<string, string>> = {
  fold: "フォールド",
  limp: "リンプ",
  call: "コール",
  check: "チェック",
  all_in: "オールイン",
  raise: "レイズ",
};

export function label(action: string): string {
  if (action === "raise_four_bet") return "4bet（推定サイズ）";
  if (action === "raise_ai") return "レイズ（推定サイズ）";
  if (action === "allin") return label("all_in");
  return ACTION_LABELS[action] ?? action.replace("raise_", "レイズ ").replaceAll("_", ".") + " BB";
}

export function color(action: string | null | undefined): string {
  if (action === "allin") return ACTION_COLORS.all_in;
  return action?.startsWith("raise_") ? ACTION_COLORS.raise : (action == null ? undefined : ACTION_COLORS[action]) ?? ACTION_COLORS.raise;
}
