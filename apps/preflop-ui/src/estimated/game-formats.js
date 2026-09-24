// Game formats the range browser can show. Only formats listed in BUILT have saved ranges;
// every other option is shown locked until its ranges are authored.
export const formatOptions = {
  game: [{ value: "cash", label: "Cash" }, { value: "mtt", label: "MTT" }],
  table: [{ value: "6max", label: "6max" }, { value: "9max", label: "9max" }, { value: "hu", label: "ヘッズアップ" }],
  stack: [{ value: 40, label: "40bb" }, { value: 100, label: "100bb" }, { value: 200, label: "200bb" }],
  openSize: [{ value: 2, label: "2BB" }, { value: 2.5, label: "2.5BB" }, { value: 3, label: "3BB" }],
  ante: [{ value: false, label: "アンティなし" }, { value: true, label: "アンティあり" }],
  rake: [{ value: "5pct-cap3", label: "5%・上限3BB" }, { value: "none", label: "レーキなし" }],
};
export const gameFormatFields = [
  ["game", "ゲーム"], ["table", "テーブル"], ["stack", "スタック"], ["openSize", "オープンサイズ"],
];
export const detailedFormatFields = [["ante", "アンティ"], ["rake", "レーキ"]];
const allFormatFields = [...gameFormatFields, ...detailedFormatFields];
// Online low stakes: 5% rake capped at 3BB, no flop no drop (user decision 2026-09-24).
export const BUILT = [{ game: "cash", table: "6max", stack: 100, openSize: 2.5, ante: false, rake: "5pct-cap3" }];
export const defaultFormat = BUILT[0];

export const isBuilt = format => BUILT.some(built => allFormatFields.every(([key]) => built[key] === format[key]));
// An option is selectable when some built format uses it.
export const optionAvailable = (key, value) => BUILT.some(built => built[key] === value);

export function formatLabel(key, value) {
  return formatOptions[key].find(option => option.value === value)?.label ?? String(value);
}
