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
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  // The URL is the page: /app (the old single address) lands on the front page.
  const [path, setPath] = useState(() => {
    const current = window.location.pathname;
    if (current === "/app" || current.startsWith("/app/")) { window.history.replaceState(null, "", HOME_PATH); return HOME_PATH; }
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

  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  const navigate = name => name === LOGOUT_SECTION ? setLoggingOut(true) : go(pathOfSection(name));
  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: navigate };
  const [sectionName, tab] = section.split("#");
  const page = sectionName === ACCOUNT_SECTION ? <AccountPage {...shared} tab={tab} onProfileSaved={setProfile} />
    : ["トレーナー", "セッション", "プレー分析", "弱点"].includes(section) ? <TrainerPage {...shared} section={section} path={path} onNavigate={go} />
    : <RangeWorkspace {...shared} />;
  return <>
    {page}
    {loggingOut && <LogoutDialog onCancel={() => setLoggingOut(false)} onConfirm={({ clearData }) => {
      if (clearData) clearPracticeData();
      clearProfile(); setLoggingOut(false); go(HOME_PATH); setProfile(null);
    }} />}
  </>;
}
