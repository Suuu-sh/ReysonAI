import { BrandIcon } from "./BrandIcon.tsx";
import { useState } from "react";
import { levels } from "../profile.ts";
import { productLocale, selectProductLocale } from "../i18n.ts";

export function Onboarding({ initial, onComplete, onCancel }) {
  const [level, setLevel] = useState(initial?.level ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const editing = Boolean(initial);
  return <main className="onboarding">
    <form className="onboarding-card" onSubmit={event => { event.preventDefault(); if (level) onComplete({ nickname, level }); }}>
      <div className="onboarding-brand"><BrandIcon size={26} /><span>Reyson<b>AI</b></span></div>
      <div className="app-language-switch onboarding-language" role="group" aria-label="Language / 言語">
        <button type="button" aria-pressed={productLocale() === "en"} onClick={() => selectProductLocale("en")}>EN</button>
        <button type="button" aria-pressed={productLocale() === "ja"} onClick={() => selectProductLocale("ja")}>日本語</button>
      </div>
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
      <div className="onboarding-actions">
        {editing && <button type="button" className="onboarding-cancel" onClick={onCancel}>キャンセル</button>}
        <button type="submit" className="primary" disabled={!level}>{editing ? "保存する" : "はじめる"}</button>
      </div>
      <small className="onboarding-note">設定はこの端末のブラウザに保存されます。アカウント登録は今後対応予定です。</small>
    </form>
  </main>;
}
