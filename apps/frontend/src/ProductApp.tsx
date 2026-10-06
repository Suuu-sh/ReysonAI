import { LearningAccess, isLearningSection, learningAllowed, readLearningIntent, rememberLearningIntent } from "./account/LearningAccess.tsx";
import { AuthPanel, useAccount } from "./account/AuthPanel.tsx";
import { accountSnapshot, logoutAccount, refreshAccount, revalidateAccountSession, startGoogleSignIn } from "./account/session.ts";
import { applyAppearance } from "./account/preferences.ts";
import { localized, productLocale } from "./locale.ts";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding.tsx";
import { AppLoading } from "./components/AppLoading.tsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.tsx";
import { TrainerPage } from "./trainer/TrainerPage.tsx";
import { adoptOnboardingDraft, clearProfile, loadProfile, saveProfile, stashOnboardingDraft } from "./profile.ts";
import { AccountPage, LogoutDialog } from "./account/AccountPage.tsx";
import { ACCOUNT_SECTION } from "./account/AccountMenu.tsx";
import { clearPracticeData } from "./account/preferences.ts";
import { LOGOUT_SECTION, RANGE_SECTION, Sidebar } from "./components/layout.tsx";
import { localizeProductSurface } from "./i18n.ts";
import { HOME_PATH, WELCOME_PATH, canonicalPath, pathOfSection, sectionOfPath } from "./route.ts";

export default function ProductApp() {
  const account = useAccount();
  const locale = productLocale();
  useLayoutEffect(() => localizeProductSurface(document.getElementById("root"), locale), [locale]);
  const pageTitle = localized("Range Analysis", "レンジ分析");
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = `ReysonAI · ${pageTitle}`;
  }, [locale, pageTitle]);
  const [authOpen, setAuthOpen] = useState(window.location.hash.startsWith("#account-error="));
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => {
    refreshAccount();
    const recheck = () => { revalidateAccountSession(); };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  // The URL is the page (see route.ts).
  const [path, setPath] = useState(() => {
    // Old addresses (/app, /ranges, /trainer/…) move to their current path.
    let current = canonicalPath(window.location.pathname);
    // A learning page picked before signing in comes back after the Google round trip (which
    // lands on the front page); a deeper URL already says where to go.
    const intent = current === HOME_PATH ? readLearningIntent() : null;
    if (intent) current = pathOfSection(intent);
    if (current !== window.location.pathname) window.history.replaceState(null, "", current + window.location.search + window.location.hash);
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

  const reloadProfile = () => { adoptOnboardingDraft(); setProfile(loadProfile()); applyAppearance(); };
  useEffect(() => { if (account.ready) reloadProfile(); }, [account.ready, account.user?.id, account.user?.verified]);
  // First-run onboarding is its own address; finishing it returns to the page it stood in front of.
  const welcoming = account.ready && !profile && !authOpen;
  const [returnTo] = useState(() => window.location.search + window.location.hash);
  useEffect(() => {
    const target = welcoming ? WELCOME_PATH : path + (window.location.pathname === WELCOME_PATH ? returnTo : window.location.search + window.location.hash);
    if (window.location.pathname !== (welcoming ? WELCOME_PATH : path)) window.history.replaceState(null, "", target);
  }, [welcoming, path]);
  if (!account.ready) return <AppLoading label={localized("Opening account…", "アカウントを確認中…")} />;
  if (authOpen) return <main className="account-page"><AuthPanel onChanged={reloadProfile} onGuest={async () => { if (accountSnapshot().user) { try { await logoutAccount(); } catch { return; } } rememberLearningIntent(null); go(HOME_PATH); setAuthOpen(false); reloadProfile(); }} />{account.user?.verified && <button className="account-primary" onClick={() => { setAuthOpen(false); reloadProfile(); }}>{localized("Continue", "続ける")}</button>}</main>;
  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} account={account} onAccount={() => setAuthOpen(true)}
      onSignIn={async draft => { stashOnboardingDraft(draft); await startGoogleSignIn(); }}
      onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  const navigate = (name: string) => {
    if (name === LOGOUT_SECTION) { setLoggingOut(true); return; }
    rememberLearningIntent(isLearningSection(name) && !learningAllowed(account) ? name : null);
    go(pathOfSection(name));
  };
  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: navigate };
  const [sectionName, tab] = section.split("#");
  const page = sectionName === ACCOUNT_SECTION ? <AccountPage {...shared} tab={tab} onProfileSaved={setProfile} />
    : isLearningSection(section) ? <LearningAccess account={account} navigation={<Sidebar {...shared} activeSection={section} />} onBack={() => navigate(RANGE_SECTION)} onChanged={reloadProfile}><TrainerPage {...shared} section={section} path={path} onNavigate={go} /></LearningAccess>
    : <RangeWorkspace {...shared} />;
  return <>
    {account.error && account.user && <p role="alert" className="account-sync-error">{localized("Account saving unavailable. Export records in Settings before reloading. No automatic retry.", "アカウント保存が利用できません。再読込前に設定から記録を書き出してください。自動再試行はしません。")}</p>}
    {logoutError && <p role="alert">{localized("Sign out failed. Your session is unchanged.", "ログアウトできませんでした。セッションは変更していません。")}</p>}
    <div key={`${account.user?.id ?? "guest"}:${locale}`}>{page}</div>
    {loggingOut && <LogoutDialog onCancel={() => setLoggingOut(false)} onConfirm={async ({ clearData }) => {
      if (accountSnapshot().user) { try { await logoutAccount(); } catch { setLogoutError(true); return; } setLoggingOut(false); go(HOME_PATH); reloadProfile(); return; }
      if (clearData) clearPracticeData();
      clearProfile(); setLoggingOut(false); go(HOME_PATH); setProfile(null);
    }} />}
  </>;
}
