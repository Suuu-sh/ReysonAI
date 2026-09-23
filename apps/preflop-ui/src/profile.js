import { defaultModeForLevel } from "./estimated/display-mode.js";

// Local profile until real accounts exist; nothing here is a credential.
const profileKey = "solveaai:profile:v1";
export const displayModeKey = "solveaai:display-mode:v1";

export const levels = [
  { value: "beginner", label: "初級", title: "レンジの基本を覚えたい", description: "よく出る局面で、どのハンドで参加するかを一目で覚えたい。混合頻度は単純化して表示します。" },
  { value: "intermediate", label: "中級", title: "混合頻度も理解したい", description: "レイズとコールを混ぜる理由や、ポジションによる違いを理解したい。" },
  { value: "advanced", label: "上級", title: "数値と根拠を細かく見たい", description: "勝率・必要勝率・ブロッカーなどの数値から、配分の妥当性を自分で判断したい。" },
];

const storage = () => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

export function loadProfile() {
  try {
    const saved = JSON.parse(storage()?.getItem(profileKey) ?? "null");
    return saved && levels.some(level => level.value === saved.level) ? saved : null;
  } catch { return null; }
}

// Saving a level also resets the display mode to that level's default.
export function saveProfile({ nickname = "", level }) {
  if (!levels.some(item => item.value === level)) throw new Error("レベルを選んでください。");
  const profile = { nickname: nickname.trim().slice(0, 20), level, updatedAt: new Date().toISOString() };
  try {
    storage()?.setItem(profileKey, JSON.stringify(profile));
    storage()?.setItem(displayModeKey, defaultModeForLevel(level));
  } catch {}
  return profile;
}

export const levelLabel = level => levels.find(item => item.value === level)?.label ?? "";
