import { accountSnapshot, accountStorage } from "./account/session.ts";
import { LOCALE_KEY, productLocale, selectProductLocale, isProductLocale } from "./locale.ts";
import { defaultModeForLevel } from "./estimated/display-mode.ts";

// Guest-local or authenticated profile; nothing here is a credential.
const profileKey = "reysonai:profile:v1";
export const displayModeKey = "reysonai:display-mode:v1";

export const levels = [
  { value: "beginner", label: "初級", title: "レンジの基本を覚えたい", description: "よく出る局面で、どのハンドで参加するかを一目で覚えたい。混合頻度は単純化して表示します。" },
  { value: "intermediate", label: "中級", title: "混合頻度も理解したい", description: "レイズとコールを混ぜる理由や、ポジションによる違いを理解したい。" },
];

const storage = () => {
  try { return typeof window === "undefined" ? null : accountStorage(); } catch { return null; }
};

export interface Profile { nickname: string; level: string; updatedAt: string }
export type ProfileDraft = { nickname?: string; level: string };
export function loadProfile(): Profile | null {
  try {
    const saved = JSON.parse(storage()?.getItem(profileKey) ?? "null");
    // The former 上級 level was merged into 中級.
    if (saved?.level === "advanced") saved.level = "intermediate";
    return saved && levels.some(level => level.value === saved.level) ? saved : null;
  } catch { return null; }
}

export function saveProfile({ nickname = "", level }: ProfileDraft) {
  if (!levels.some(item => item.value === level)) throw new Error("レベルを選んでください。");
  const previousProfile = loadProfile();
  const profile = { nickname: nickname.trim().slice(0, 20), level, updatedAt: new Date().toISOString() };
  try {
    storage()?.setItem(profileKey, JSON.stringify(profile));
    if (!previousProfile || previousProfile.level !== level) {
      storage()?.setItem(displayModeKey, defaultModeForLevel(level));
    }
  } catch {}
  return profile;
}

export const levelLabel = (level: string | undefined) => levels.find(item => item.value === level)?.label ?? "";

// Guest logout forgets only the browser profile.
export function clearProfile() {
  try { storage()?.removeItem(profileKey); } catch {}
}

// Onboarding answers picked before "Continue with Google" survive the OAuth round trip in this
// tab, then become the new account's profile. An account that already has a profile keeps it.
const draftKey = "reysonai:onboarding-draft:v1";
const session = () => { try { return window.sessionStorage; } catch { return null; } };

export function stashOnboardingDraft({ nickname = "", level = "" }: { nickname?: string; level?: string }) {
  try { session()?.setItem(draftKey, JSON.stringify({ nickname, level, locale: productLocale() })); } catch {}
}

export function adoptOnboardingDraft() {
  if (typeof window === "undefined" || !accountSnapshot().user?.verified) return;
  let draft = null;
  try { draft = JSON.parse(session()?.getItem(draftKey) ?? "null"); session()?.removeItem(draftKey); } catch {}
  if (!draft) return;
  if (!loadProfile() && levels.some(item => item.value === draft.level)) saveProfile(draft);
  // A brand-new account has no language yet; keep the one chosen on the onboarding screen.
  if (storage()?.getItem(LOCALE_KEY) === null && isProductLocale(draft.locale)) selectProductLocale(draft.locale);
}
