import { useEffect, useState } from "react";
import { localized } from "../locale.ts";
import { accountSnapshot, importGuestData, logoutAccount, startGoogleSignIn, subscribeAccount } from "./session.ts";
import "./account.css";
const t = (en, ja) => localized(en, ja);
export function useAccount() {
  const [state, setState] = useState(accountSnapshot);
  useEffect(() => subscribeAccount(() => setState(accountSnapshot())), []);
  return state;
}
export function AuthPanel({ onChanged = () => {}, onGuest }) {
  const { user: sessionUser, error, available } = useAccount();
  const user = ["session", "verification"].includes(error) ? null : sessionUser;
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(typeof window !== "undefined" && window.location.hash.startsWith("#account-error=") ? t("Google sign-in was not completed. No automatic retry was made.", "Googleログインが完了しませんでした。自動再試行はしていません。") : "");
  const perform = async action => {
    setBusy(true); setMessage("");
    try { await action(); }
    catch { setMessage(t("Unable to complete this request. Check your connection. No automatic retry was made.", "処理できませんでした。接続を確認してください。自動再試行はしていません。")); }
    finally { setBusy(false); }
  };
  return <section className="account-card account-auth">
    <header><h2>{t("Account", "アカウント")}</h2></header>
    {user ? <>
      <p translate="no">{user.email}</p>
      <p>{t("Signed in with Google. Profile, preferences and practice records are saved to your account. Ranked results are not imported or treated as authoritative.", "Googleでログイン中。プロフィール・設定・練習記録はアカウントに保存されます。ローカルのランク記録は移行せず、公式成績として扱いません。")}</p>
      <p>{t("Guest data stays on this browser unless you explicitly import it. Import replaces your account profile, settings and practice history with this browser's guest data; it does not merge them. Export your account data first if needed.", "ゲストデータは明示的に移行しない限りこのブラウザに残ります。移行するとアカウントのプロフィール・設定・練習記録を、このブラウザのゲストデータで置き換えます。統合はしません。必要なら先にアカウントデータを書き出してください。")}</p>
      <label className="account-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t("I consent to uploading guest data and replacing account data.", "ゲストデータのアップロードとアカウントデータの置き換えに同意します。")}</label>
      <button className="account-secondary" disabled={!consent || busy || !!error} onClick={() => perform(async () => { await importGuestData(consent); setConsent(false); onChanged(); setMessage(t("Guest data imported.", "ゲストデータを移行しました。")); })}>{t("Import guest data", "ゲストデータを移行")}</button>
      <button className="account-secondary" disabled={busy} onClick={() => perform(async () => { await logoutAccount(); onChanged(); })}>{t("Sign out", "ログアウト")}</button>
    </> : <>
      <p>{t("Use your Google account, including Google Workspace or custom-domain accounts. Range analysis remains available without signing in. Learning requires Google sign-in.", "Google Workspaceや独自ドメインを含むGoogleアカウントでログインできます。レンジ分析はログインなしで利用できます。学習にはGoogleログインが必要です。")}</p>
      {!available && <p role="status">{error ? t("Cannot connect to the sign-in service. Check your connection and API server. No automatic retry was made.", "ログインサービスに接続できません。接続とAPIサーバーを確認してください。自動再試行はしていません。") : t("Google sign-in is not configured for this environment. Range analysis remains available as a guest.", "この環境のGoogleログイン設定が未完了です。レンジ分析はゲストでも利用できます。")}</p>}
      <button type="button" className="account-primary" disabled={busy || !available} onClick={() => perform(startGoogleSignIn)}>{t("Sign in with Google", "Googleでログイン")}</button>
    </>}
    {message && <p role="status">{message}</p>}
    {error && sessionUser && <p role="alert">{error === "conflict" ? t("Another device changed this account. Saving is paused; reload to load the latest account data. Unsaved edits are not uploaded.", "別の端末で更新されました。保存を停止しました。再読込で最新データを取得できます。未保存の変更はアップロードされません。") : t("Account saving is unavailable. No automatic retry was made. Export your records before reloading or signing out.", "アカウント保存が利用できません。自動再試行はしていません。再読込やログアウト前に記録を書き出してください。")}</p>}
    {onGuest && <button className="account-secondary" disabled={busy} onClick={onGuest}>{t("Continue to range analysis as guest", "ゲストとしてレンジ分析へ")}</button>}
  </section>;
}
