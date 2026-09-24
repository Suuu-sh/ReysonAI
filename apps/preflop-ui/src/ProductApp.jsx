import { useState } from "react";
import { Onboarding } from "./components/Onboarding.jsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.jsx";
import { loadProfile, saveProfile } from "./profile.js";

export default function ProductApp() {
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);

  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }

  return <RangeWorkspace profile={profile} onEditProfile={() => setEditing(true)} />;
}
