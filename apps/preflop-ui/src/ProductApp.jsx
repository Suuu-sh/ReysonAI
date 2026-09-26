import { useState } from "react";
import { Onboarding } from "./components/Onboarding.jsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.jsx";
import { TrainerPage } from "./trainer/TrainerPage.jsx";
import { loadProfile, saveProfile } from "./profile.js";
import { RANGE_SECTION } from "./components/layout.jsx";

export default function ProductApp() {
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState(RANGE_SECTION);

  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  const shared = { profile, onEditProfile: () => setEditing(true), onSectionChange: setSection };
  if (section === "トレーナー" || section === "弱点") return <TrainerPage {...shared} section={section} />;
  return <RangeWorkspace {...shared} />;
}
