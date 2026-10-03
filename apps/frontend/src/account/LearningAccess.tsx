import { AuthPanel } from "./AuthPanel.tsx";
import { localized } from "../locale.ts";

const learningSections = ["トレーナー", "セッション", "プレー分析", "弱点"];
const intentKey = "reysonai:learning-intent:v1";
export const isLearningSection = section => learningSections.includes(section);
export const learningAllowed = account => account.ready && account.available && account.user?.verified === true && !["session", "verification"].includes(account.error);
export function readLearningIntent() {
  try {
    const section = window.sessionStorage.getItem(intentKey);
    return isLearningSection(section) ? section : null;
  } catch { return null; }
}
export function rememberLearningIntent(section) {
  try {
    if (isLearningSection(section)) window.sessionStorage.setItem(intentKey, section);
    else window.sessionStorage.removeItem(intentKey);
  } catch {}
}
export function LearningAccess({ account, onBack, onChanged, children }) {
  if (!account.ready) return <div className="site-loading">{localized("Checking Google sign-in…", "Googleログインを確認中…")}</div>;
  if (learningAllowed(account)) return children;
  return <main className="account-page">
    <section className="account-card">
      <h1>{localized("Google sign-in required", "Googleログインが必要です")}</h1>
      <p>{localized("Sign in with Google to use Trainer, Sessions, Play Analysis and Weak Spots. Range analysis is available as a guest.", "トレーナー・セッション・プレー分析・弱点の利用にはGoogleログインが必要です。レンジ分析はゲストでも利用できます。")}</p>
    </section>
    <AuthPanel onChanged={onChanged} />
    <button type="button" className="account-secondary" onClick={onBack}>{localized("Back to range analysis", "レンジ分析に戻る")}</button>
  </main>;
}
