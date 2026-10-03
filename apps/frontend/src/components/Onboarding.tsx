import { BrandIcon } from "./BrandIcon.tsx";
import { useState } from "react";
import { levels } from "../profile.ts";
import { localized, productLocale, selectProductLocale } from "../i18n.ts";

// Google's "G" mark, kept in its brand colors on every theme.
const GoogleMark = () => <svg className="google-mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</svg>;

// account: { user, available } from useAccount(). Signing in is offered, never required.
export function Onboarding({ initial, onComplete, onCancel, account = null, onSignIn = null, onAccount = null }) {
  const [level, setLevel] = useState(initial?.level ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [signingIn, setSigningIn] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const editing = Boolean(initial);
  const user = account?.user ?? null;
  const offerGoogle = !editing && !user && Boolean(account?.available && onSignIn);
  const signIn = async () => {
    setSigningIn(true); setSignInFailed(false);
    try { await onSignIn({ nickname, level }); }
    catch { setSignInFailed(true); setSigningIn(false); }
  };
  return <main className="onboarding">
    <form className="onboarding-card" onSubmit={event => { event.preventDefault(); if (level) onComplete({ nickname, level }); }}>
      <div className="onboarding-top">
        <div className="onboarding-brand"><BrandIcon size={26} /><span>Reyson<b>AI</b></span></div>
        <div className="app-language-switch onboarding-language" role="group" aria-label="Language / 言語">
          <button type="button" aria-pressed={productLocale() === "en"} onClick={() => selectProductLocale("en")}>EN</button>
          <button type="button" aria-pressed={productLocale() === "ja"} onClick={() => selectProductLocale("ja")}>日本語</button>
        </div>
      </div>
      {!editing && user && <div className="onboarding-account">
        <span className="onboarding-account-dot" aria-hidden="true" />
        <span className="onboarding-account-text">{localized("Signed in as", "ログイン中")} <b>{user.email}</b></span>
        {onAccount && <button type="button" className="onboarding-link" onClick={onAccount}>{localized("Switch", "切り替え")}</button>}
      </div>}
      <h1>{editing ? "レベルを変更" : "はじめに、あなたのレベルを教えてください"}</h1>
      <p className="onboarding-lead">レベルに合わせて、レンジ表の見せ方を変えます。あとからいつでも変更できます。</p>
      <fieldset className="level-options">
        <legend>レベル</legend>
        {levels.map(item => <label key={item.value} className={`level-option${level === item.value ? " selected" : ""}`}>
          <input type="radio" name="level" value={item.value} checked={level === item.value} onChange={() => setLevel(item.value)} />
          <span className="level-name">{item.label}</span>
          <strong>{item.title}</strong>
          <small>{item.description}</small>
        </label>)}
      </fieldset>
      <label className="nickname-field">
        <span>ニックネーム（任意）</span>
        <input type="text" value={nickname} maxLength={20} autoComplete="nickname" placeholder="例：たろう" onChange={event => setNickname(event.target.value)} />
      </label>
      {offerGoogle ? <div className="onboarding-start">
        <div className="onboarding-start-buttons">
          <button type="submit" className="onboarding-guest" disabled={!level || signingIn}>{localized("Start as guest", "ゲストではじめる")}</button>
          <button type="button" className="google-signin" disabled={signingIn} onClick={signIn}><GoogleMark />{signingIn ? localized("Opening Google…", "Googleを開いています…") : localized("Continue with Google", "Googleで続ける")}</button>
        </div>
        {signInFailed && <p role="alert" className="onboarding-error">{localized("Couldn't reach Google sign-in. Check your connection, or start as a guest.", "Googleログインに接続できませんでした。接続を確認するか、ゲストではじめてください。")}</p>}
        <small className="onboarding-note">{localized("Signing in saves your settings and practice records to your account and unlocks Trainer, Sessions and Weak Spots. Range analysis works as a guest too.", "ログインすると設定と練習記録がアカウントに保存され、トレーナー・セッション・弱点分析も使えます。レンジ分析はゲストでも使えます。")}</small>
      </div> : <>
        <div className="onboarding-actions">
          {editing && <button type="button" className="onboarding-cancel" onClick={onCancel}>キャンセル</button>}
          <button type="submit" className="primary" disabled={!level}>{editing ? "保存する" : "はじめる"}</button>
        </div>
        <small className="onboarding-note">{user ? localized("Your settings are saved to your account.", "設定はアカウントに保存されます。") : "ゲストの設定はこのブラウザに保存されます。ログイン中の設定はアカウントに同期されます。"}</small>
      </>}
    </form>
  </main>;
}
