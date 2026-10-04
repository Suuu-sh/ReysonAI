import { useState } from "react";
import { ArrowLeft, ChartBar, ClockCounterClockwise, GraduationCap, LockSimple, Target } from "@phosphor-icons/react";
import { localized } from "../locale.ts";
import { startGoogleSignIn } from "./session.ts";
import "./account.css";

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
export function LearningAccess({ account, onBack, onChanged, children, navigation = null }) {
  if (!account.ready) return <div className="site-loading">{localized("Checking Google sign-in…", "Googleログインを確認中…")}</div>;
  if (learningAllowed(account)) return children;
  return <div className="shell">{navigation}<main className="account-page learning-gate">
    <LearningGate account={account} onBack={onBack} />
  </main></div>;
}

const GOOGLE_MARK = <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;

export function LearningGate({ account, onBack, title, lead, features: customFeatures, backLabel }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const features = customFeatures ?? [
    [GraduationCap, localized("Trainer", "トレーナー"), localized("Drill spots and check every answer", "局面ドリルで判断を確認")],
    [ClockCounterClockwise, localized("Sessions", "セッション"), localized("Keep your practice history", "練習の記録を残す")],
    [ChartBar, localized("Play analysis", "プレー分析"), localized("See accuracy by spot and street", "局面・ストリート別の精度")],
    [Target, localized("Weak spots", "弱点"), localized("Find the decisions you miss most", "よく間違える判断を見つける")],
  ];
  const signIn = async () => {
    setBusy(true); setFailed(false);
    try { await startGoogleSignIn(); } catch { setFailed(true); setBusy(false); }
  };
  return <section className="learning-gate-card" aria-labelledby="learning-gate-title">
    <span className="learning-gate-icon" aria-hidden="true"><LockSimple size={22} weight="bold" /></span>
    <h1 id="learning-gate-title">{title ?? localized("Sign in to start learning", "ログインして学習をはじめる")}</h1>
    <p className="learning-gate-lead">{lead ?? localized("Learning tools save your progress to your account.", "学習機能は、進み具合をアカウントに保存します。")}</p>
    <ul className="learning-gate-features">
      {features.map(([Icon, name, detail]) => <li key={name}><Icon size={18} aria-hidden="true" /><span><strong>{name}</strong><small>{detail}</small></span></li>)}
    </ul>
    <button type="button" className="learning-gate-google" disabled={busy || !account.available} onClick={signIn}>
      {GOOGLE_MARK}{busy ? localized("Opening Google…", "Googleを開いています…") : localized("Continue with Google", "Googleで続ける")}
    </button>
    {!account.available && <p className="learning-gate-note" role="status">{account.error
      ? localized("Cannot reach the sign-in service. Check your connection and reload.", "ログインサービスに接続できません。接続を確認して再読み込みしてください。")
      : localized("Google sign-in is not set up in this environment.", "この環境ではGoogleログインが未設定です。")}</p>}
    {failed && <p className="learning-gate-note" role="status">{localized("Google sign-in did not start. Please try again.", "Googleログインを開始できませんでした。もう一度お試しください。")}</p>}
    <p className="learning-gate-fine">{localized("Google Workspace and custom-domain accounts work too.", "Google Workspace・独自ドメインのアカウントも使えます。")}</p>
    <div className="learning-gate-divider" />
    <button type="button" className="learning-gate-back" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" />{backLabel ?? localized("Range analysis works without signing in", "レンジ分析はログインなしで使えます")}</button>
  </section>;
}
