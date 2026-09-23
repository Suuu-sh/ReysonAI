import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Onboarding } from "./components/Onboarding.jsx";
import { RangeWorkspace } from "./estimated/RangeWorkspace.jsx";
import { loadProfile, saveProfile } from "./profile.js";
import "./styles.css";

function Root() {
  const [profile, setProfile] = useState(loadProfile);
  const [editing, setEditing] = useState(false);
  if (!profile || editing) {
    return <Onboarding initial={editing ? profile : null} onCancel={() => setEditing(false)} onComplete={values => { setProfile(saveProfile(values)); setEditing(false); }} />;
  }
  return <RangeWorkspace profile={profile} onEditProfile={() => setEditing(true)} />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
