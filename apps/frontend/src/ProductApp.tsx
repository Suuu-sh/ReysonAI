import { useLayoutEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding.tsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.tsx";
import { TrainerPage } from "./trainer/TrainerPage.tsx";
import { clearProfile, loadProfile, saveProfile } from "./profile.ts";
import { AccountPage, LogoutDialog } from "./account/AccountPage.tsx";
import { ACCOUNT_SECTION } from "./account/AccountMenu.tsx";
import { clearPracticeData } from "./account/preferences.ts";
import { LOGOUT_SECTION, RANGE_SECTION } from "./components/layout.tsx";
import { localizeProductSurface } from "./i18n.ts";

export default function ProductApp() {
  useLayoutEffect(() => localizeProductSurface(document.getElementById("root")), []);
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState(RANGE_SECTION);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  const navigate = name => name === LOGOUT_SECTION ? setLoggingOut(true) : setSection(name);
  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: navigate };
  const [sectionName, tab] = section.split("#");
  const page = sectionName === ACCOUNT_SECTION ? <AccountPage {...shared} tab={tab} onProfileSaved={setProfile} />
    : ["トレーナー", "セッション", "プレー分析", "弱点"].includes(section) ? <TrainerPage {...shared} section={section} />
    : <RangeWorkspace {...shared} />;
  return <>
    {page}
    {loggingOut && <LogoutDialog onCancel={() => setLoggingOut(false)} onConfirm={({ clearData }) => {
      if (clearData) clearPracticeData();
      clearProfile(); setLoggingOut(false); setSection(RANGE_SECTION); setProfile(null);
    }} />}
  </>;
}
