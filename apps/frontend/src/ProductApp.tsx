import { AuthPanel, useAccount } from "./account/AuthPanel.tsx";
import { accountSnapshot, logoutAccount, refreshAccount } from "./account/session.ts";
import { applyAppearance } from "./account/preferences.ts";
import { localized } from "./locale.ts";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding.tsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.tsx";
import { TrainerPage } from "./trainer/TrainerPage.tsx";
import { clearProfile, loadProfile, saveProfile } from "./profile.ts";
import { AccountPage, LogoutDialog } from "./account/AccountPage.tsx";
import { ACCOUNT_SECTION } from "./account/AccountMenu.tsx";
import { clearPracticeData } from "./account/preferences.ts";
import { LOGOUT_SECTION } from "./components/layout.tsx";
import { localizeProductSurface } from "./i18n.ts";
import { HOME_PATH, pathOfSection, sectionOfPath } from "./route.ts";

export default function ProductApp() {
  useLayoutEffect(() => localizeProductSurface(document.getElementById("root")), []);
  const account = useAccount();
  const [authOpen, setAuthOpen] = useState(window.location.hash.startsWith("#account-error="));
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => { refreshAccount(); }, []);
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  // The URL is the page: /app (the old single address) lands on the front page.
  const [path, setPath] = useState(() => {
    const current = window.location.pathname;
    if (current === "/app" || current.startsWith("/app/")) { window.history.replaceState(null, "", HOME_PATH + window.location.search + window.location.hash); return HOME_PATH; }
    return current;
  });
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((next: string, replace = false) => {
    if (next === window.location.pathname) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", next);
    setPath(next);
  }, []);
  const section = sectionOfPath(path);
  const [loggingOut, setLoggingOut] = useState(false);

  const reloadProfile = () => { setProfile(loadProfile()); applyAppearance(); };
  useEffect(() => { if (account.ready) reloadProfile(); }, [account.ready, account.user?.id, account.user?.verified]);
  if (!account.ready) return <div className="site-loading">{localized("Opening account…", "アカウントを確認中…")}</div>;
  if (authOpen) return <main className="account-page"><AuthPanel onChanged={reloadProfile} onGuest={async () => { if (accountSnapshot().user) { try { await logoutAccount(); } catch { return; } } setAuthOpen(false); reloadProfile(); }} />{account.user?.verified && <button className="account-primary" onClick={() => { setAuthOpen(false); reloadProfile(); }}>{localized("Continue", "続ける")}</button>}</main>;
  if (!profile || editing) {
    return <><button type="button" className="account-secondary" onClick={() => setAuthOpen(true)}>{account.user ? localized("Account", "アカウント") : localized("Sign in with Google", "Googleでログイン")}</button><Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} /></>;
  }

  const navigate = name => name === LOGOUT_SECTION ? setLoggingOut(true) : go(pathOfSection(name));
  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: navigate };
  const [sectionName, tab] = section.split("#");
  const page = sectionName === ACCOUNT_SECTION ? <AccountPage {...shared} tab={tab} onProfileSaved={setProfile} />
    : ["トレーナー", "セッション", "プレー分析", "弱点"].includes(section) ? <TrainerPage {...shared} section={section} path={path} onNavigate={go} />
    : <RangeWorkspace {...shared} />;
  return <>
    {account.error && <p role="alert" className="account-sync-error">{localized("Account saving unavailable. Export records in Settings before reloading. No automatic retry.", "アカウント保存が利用できません。再読込前に設定から記録を書き出してください。自動再試行はしません。")}</p>}
    {logoutError && <p role="alert">{localized("Sign out failed. Your session is unchanged.", "ログアウトできませんでした。セッションは変更していません。")}</p>}
    <div key={account.user?.id ?? "guest"}>{page}</div>
    {loggingOut && <LogoutDialog onCancel={() => setLoggingOut(false)} onConfirm={async ({ clearData }) => {
      if (accountSnapshot().user) { try { await logoutAccount(); } catch { setLogoutError(true); return; } setLoggingOut(false); go(HOME_PATH); reloadProfile(); return; }
      if (clearData) clearPracticeData();
      clearProfile(); setLoggingOut(false); go(HOME_PATH); setProfile(null);
    }} />}
  </>;
}
