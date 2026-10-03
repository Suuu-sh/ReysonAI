import { Check, CreditCard, DownloadSimple, Lock, Palette, SignOut, Sparkle, Translate, UserCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Sidebar } from "../components/layout.tsx";
import { levels, saveProfile } from "../profile.ts";
import { localized, productLocale, selectProductLocale } from "../i18n.ts";
import { en as siteEn } from "../site/content.ts";
import { ja as siteJa } from "../site/content-ja.ts";
import { exportLocalData, loadAppearance, loadDisplayMode, practiceKeys, saveAppearance, saveDisplayMode } from "./preferences.ts";
import { ACCOUNT_SECTION, initialOf } from "./AccountMenu.tsx";


const t = (ja, en) => localized(en, ja);
export const ACCOUNT_TABS = [
  { value: "account", Icon: UserCircle, ja: "アカウント", en: "Account" },
  { value: "subscription", Icon: CreditCard, ja: "サブスクリプション", en: "Subscription" },
  { value: "appearance", Icon: Palette, ja: "外観", en: "Appearance" },
  { value: "language", Icon: Translate, ja: "言語", en: "Language" },
];

function Choice({ options, value, onChange, label }) {
  return <div className="account-choice" role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" role="radio" key={option.value} aria-checked={value === option.value}
      disabled={option.disabled} className={value === option.value ? "on" : ""} onClick={() => onChange(option.value)}>
      {option.preview}<strong translate={option.native ? "no" : undefined}>{option.label}</strong>{option.hint && <small>{option.hint}</small>}
    </button>)}
  </div>;
}

function SettingRow({ title, description, children }) {
  return <div className="account-row">
    <div><strong>{title}</strong>{description && <small>{description}</small>}</div>
    {children}
  </div>;
}

function AccountTab({ profile, onProfileSaved }) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [level, setLevel] = useState(profile?.level ?? "intermediate");
  const [saved, setSaved] = useState(false);
  const dirty = nickname.trim() !== (profile?.nickname ?? "") || level !== profile?.level;
  const keys = practiceKeys();
  const download = () => {
    const blob = new Blob([JSON.stringify(exportLocalData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: `reysonai-practice-${new Date().toISOString().slice(0, 10)}.json` });
    link.click();
    URL.revokeObjectURL(url);
  };
  return <>
    <section className="account-card">
      <header><h2>{t("プロフィール", "Profile")}</h2></header>
      <div className="account-profile">
        <span className="account-avatar xl">{initialOf({ nickname })}</span>
        <label className="account-field">
          <span>{t("ニックネーム", "Nickname")}</span>
          <input value={nickname} maxLength={20} placeholder={t("ゲスト", "Guest")} onChange={event => { setNickname(event.target.value); setSaved(false); }} />
        </label>
      </div>
      <SettingRow title={t("レベル", "Level")} description={t("レンジ表の見せ方の初期値が変わります", "Sets the default range display")}>
        <Choice label={t("レベル", "Level")} value={level} onChange={value => { setLevel(value); setSaved(false); }}
          options={levels.map(item => ({ value: item.value, label: item.label }))} />
      </SettingRow>
      <footer>
        {saved && <span className="account-saved"><Check size={14} weight="bold" />{t("保存しました", "Saved")}</span>}
        <button type="button" className="account-primary" disabled={!dirty} onClick={() => { onProfileSaved(saveProfile({ nickname, level })); setSaved(true); }}>{t("保存", "Save")}</button>
      </footer>
    </section>
    <section className="account-card">
      <header><h2>{t("ログイン", "Sign-in")}</h2><span className="account-pill">{t("準備中", "Planned")}</span></header>
      <SettingRow title={t("ゲストとして利用中", "Using as a guest")} description={t("プロフィールと練習データはこのブラウザだけに保存されます。アカウント登録と端末間の同期は準備中です。", "Profile and practice data stay in this browser. Accounts and sync are planned.")}>
        <button type="button" className="account-secondary" disabled><Lock size={14} />{t("アカウントを作成", "Create account")}</button>
      </SettingRow>
    </section>
    <section className="account-card">
      <header><h2>{t("練習データ", "Practice data")}</h2></header>
      <SettingRow title={t("データを書き出す", "Export data")} description={t(`ドリル・セッション・回答履歴（${keys.length}項目）をJSONで保存します`, `Save drills, sessions and answers (${keys.length} items) as JSON`)}>
        <button type="button" className="account-secondary" onClick={download} disabled={!keys.length}><DownloadSimple size={14} />{t("書き出す", "Export")}</button>
      </SettingRow>
    </section>
  </>;
}

function SubscriptionTab() {
  const pricing = (productLocale() === "ja" ? siteJa : siteEn).pricing;
  return <>
    <section className="account-card account-plan-current">
      <div>
        <span className="account-eyebrow">{t("現在のプラン", "Current plan")}</span>
        <h2>Free</h2>
        <p>{t("公開中のプレビュー機能をすべて無料で使えます。", "All preview features are free to use.")}</p>
      </div>
      <span className="account-pill success">{t("利用中", "Active")}</span>
    </section>
    <div className="account-plans">
      {pricing.plans.map((plan, index) => <article key={plan.name} className={`account-plan${index === 0 ? " current" : " upcoming"}`}>
        <header>
          <h3>{index === 1 && <Sparkle size={15} weight="fill" />}{plan.name}</h3>
          <span className="account-pill">{plan.status}</span>
        </header>
        <p className="account-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></p>
        <p className="account-plan-desc">{plan.description}</p>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={13} weight="bold" />{feature}</li>)}</ul>
        <button type="button" className={index === 0 ? "account-secondary" : "account-primary"} disabled>
          {index === 0 ? t("現在のプラン", "Current plan") : plan.action}
        </button>
      </article>)}
    </div>
    <p className="account-note">{pricing.note}</p>
  </>;
}

function AppearanceTab() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const [displayMode, setDisplayMode] = useState(loadDisplayMode);
  const update = patch => { const next = { ...appearance, ...patch }; setAppearance(next); saveAppearance(next); };
  const cardPreview = colors => <span className="account-card-preview" aria-hidden="true">{colors.map(([suit, color]) => <i key={suit} style={{ background: color }}>{suit}</i>)}</span>;
  return <section className="account-card">
    <header><h2>{t("外観", "Appearance")}</h2></header>
    <SettingRow title={t("テーマ", "Theme")}>
      <Choice label={t("テーマ", "Theme")} value="dark" onChange={() => {}}
        options={[{ value: "dark", label: t("ダーク", "Dark") }, { value: "light", label: t("ライト", "Light"), hint: t("準備中", "Planned"), disabled: true }]} />
    </SettingRow>
    <SettingRow title={t("レンジの表示", "Range display")} description={t("レンジ分析を次に開いたときから反映", "Applies next time Range Analysis opens")}>
      <Choice label={t("レンジの表示", "Range display")} value={displayMode} onChange={value => { setDisplayMode(value); saveDisplayMode(value); }}
        options={[{ value: "simple", label: t("シンプル", "Simple"), hint: t("主な行動だけ", "Main action") }, { value: "standard", label: t("スタンダード", "Standard"), hint: t("頻度も表示", "With frequencies") }]} />
    </SettingRow>
    <SettingRow title={t("カードの色", "Card colors")} description={t("トレーナーのカード", "Trainer cards")}>
      <Choice label={t("カードの色", "Card colors")} value={appearance.cards} onChange={cards => update({ cards })}
        options={[
          { value: "four", label: t("4色", "Four-color"), preview: cardPreview([["♠", "#3b3b44"], ["♥", "#c9344f"], ["♦", "#2f6fbf"], ["♣", "#3d8f55"]]) },
          { value: "two", label: t("2色", "Two-color"), preview: cardPreview([["♠", "#3b3b44"], ["♥", "#c9344f"], ["♦", "#c9344f"], ["♣", "#3b3b44"]]) },
        ]} />
    </SettingRow>
    <SettingRow title={t("アニメーション", "Motion")} description={t("配札や判定の動きを止めます", "Stops dealing and verdict animations")}>
      <Choice label={t("アニメーション", "Motion")} value={appearance.motion} onChange={motion => update({ motion })}
        options={[{ value: "standard", label: t("標準", "Standard") }, { value: "reduce", label: t("減らす", "Reduced") }]} />
    </SettingRow>
  </section>;
}

function LanguageTab() {
  const locale = productLocale();
  return <section className="account-card">
    <header><h2>{t("言語", "Language")}</h2></header>
    <SettingRow title={t("表示言語", "Display language")} description={t("切り替えるとページを再読み込みします。戦略データや保存した記録は翻訳されません。", "Switching reloads the page. Strategy data and saved records are not translated.")}>
      <Choice label={t("表示言語", "Display language")} value={locale} onChange={value => value !== locale && selectProductLocale(value)}
        options={[{ value: "en", label: "English", native: true }, { value: "ja", label: "日本語", native: true }]} />
    </SettingRow>
  </section>;
}

export function LogoutDialog({ onCancel, onConfirm }) {
  const [clearData, setClearData] = useState(false);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="modal account-logout" role="dialog" aria-modal="true" aria-labelledby="logout-title">
      <span className="account-logout-icon"><SignOut size={20} /></span>
      <h2 id="logout-title">{t("ログアウトしますか？", "Log out?")}</h2>
      <p>{t("アカウント機能はまだないため、この端末のプロフィールを削除して最初の画面に戻ります。", "Accounts are not available yet, so this removes the profile from this browser and returns to the start screen.")}</p>
      <label className="account-check">
        <input type="checkbox" checked={clearData} onChange={event => setClearData(event.target.checked)} />
        <span>{t("練習データ（ドリル・セッション・回答履歴）も削除する", "Also delete practice data (drills, sessions, answers)")}</span>
      </label>
      <div className="account-dialog-actions">
        <button type="button" className="account-secondary" onClick={onCancel}>{t("キャンセル", "Cancel")}</button>
        <button type="button" className="account-danger" onClick={() => onConfirm({ clearData })}>{t("ログアウト", "Log out")}</button>
      </div>
    </div>
  </div>;
}

export function AccountPage({ profile, tab = "account", onSectionChange, onEditProfile, onProfileSaved, onLogout }) {
  const active = ACCOUNT_TABS.some(item => item.value === tab) ? tab : "account";
  return <div className="shell">
    <Sidebar activeSection={ACCOUNT_SECTION} onSectionChange={onSectionChange} profile={profile} onEditProfile={onEditProfile} onLogout={onLogout} />
    <main className="account-page">
      <div className="account-layout">
        <header className="account-heading"><h1>{t("設定", "Settings")}</h1></header>
        <nav className="account-tabs" aria-label={t("設定の項目", "Settings sections")}>
          {ACCOUNT_TABS.map(({ value, Icon, ja, en }) => <button type="button" key={value} aria-current={active === value ? "page" : undefined}
            className={active === value ? "on" : ""} onClick={() => onSectionChange(`${ACCOUNT_SECTION}#${value}`)}><Icon size={17} />{t(ja, en)}</button>)}
        </nav>
        <div className="account-content">
          {active === "account" ? <AccountTab key={profile?.updatedAt} profile={profile} onProfileSaved={onProfileSaved} />
            : active === "subscription" ? <SubscriptionTab />
            : active === "appearance" ? <AppearanceTab />
            : <LanguageTab />}
        </div>
      </div>
    </main>
  </div>;
}
