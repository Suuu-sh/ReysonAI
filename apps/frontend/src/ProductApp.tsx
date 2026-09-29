import { useLayoutEffect, useState } from "react";
import { Onboarding } from "./components/Onboarding.tsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.tsx";
import { TrainerPage } from "./trainer/TrainerPage.tsx";
import { loadProfile, saveProfile } from "./profile.ts";
import { RANGE_SECTION } from "./components/layout.tsx";
import { localizeProductSurface } from "./i18n.ts";

export default function ProductApp() {
  useLayoutEffect(() => localizeProductSurface(document.getElementById("root")), []);
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState(RANGE_SECTION);

  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: setSection };
  if (section === "トレーナー" || section === "セッション" || section === "プレー分析" || section === "弱点") return <TrainerPage {...shared} section={section} />;
  return <RangeWorkspace {...shared} />;
}
