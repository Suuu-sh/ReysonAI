import { Dialog } from "../components/Dialog.tsx";
import type { ReactNode } from "react";
import type { Profile } from "../profile.ts";
import { AuthPanel } from "./AuthPanel.tsx";
import { accountSnapshot } from "./session.ts";
import { Check, CheckCircle, Clock, CreditCard, Info, Palette, SignOut, Sparkle, Translate, UserCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Sidebar } from "../components/layout.tsx";
import { levels, loadProfile, saveProfile } from "../profile.ts";
import { localized, productLocale, LOCALES, selectProductLocale } from "../i18n.ts";
import { SITE_COPY } from "../site/locales.ts";
import { loadAppearance, loadDisplayMode, loadRangeSource, saveAppearance, saveDisplayMode, saveRangeSource } from "./preferences.ts";
import { ACCOUNT_SECTION } from "./AccountMenu.tsx";
import { ProfileAvatar, PROFILE_AVATARS, profileAvatar, type ProfileAvatarId } from "./ProfileAvatar.tsx";
import { humanRequest } from "../trainer/human-api.ts";
import { ffCopy } from "../trainer/fastfold-api.ts";


const t = (ja: string, en: string) => localized(en, ja);
const sourceCopy = (ja: string, en: string, zh: string, es: string) => ({ ja, en, "zh-CN": zh, es })[productLocale()];
export const ACCOUNT_TABS = [
  { value: "profile", Icon: UserCircle, ja: "アカウント", en: "Account" },
  { value: "subscription", Icon: CreditCard, ja: "サブスクリプション", en: "Subscription", shortJa: "プラン", shortEn: "Plan" },
  { value: "appearance", Icon: Palette, ja: "外観", en: "Appearance" },
  { value: "language", Icon: Translate, ja: "言語", en: "Language" },
];

function Choice({ options, value, onChange, label }: { options: { value: string; label: string; disabled?: boolean; preview?: ReactNode; native?: boolean; hint?: string }[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="account-choice" role="radiogroup" aria-label={label}>
    {options.map(option => <button type="button" role="radio" key={option.value} aria-checked={value === option.value}
      disabled={option.disabled} className={value === option.value ? "on" : ""} onClick={() => onChange(option.value)}>
      {option.preview}<strong translate={option.native ? "no" : undefined} lang={option.native ? option.value : undefined}>{option.label}</strong>{option.hint && <small>{option.hint}</small>}
    </button>)}
  </div>;
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="account-row">
    <div><strong>{title}</strong>{description && <small>{description}</small>}</div>
    {children}
  </div>;
}

function AccountTab({ profile, onProfileSaved }: { profile: Profile | null; onProfileSaved: (profile: Profile | null) => void }) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [level, setLevel] = useState(profile?.level ?? "intermediate");
  const [avatar, setAvatar] = useState<ProfileAvatarId>(profileAvatar(profile?.avatar));
  const [publicReady, setPublicReady] = useState(false);
  const [publicError, setPublicError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadedAccountId = accountSnapshot().user?.verified ? accountSnapshot().user!.id : null;
  const signedIn = loadedAccountId !== null;
  const avatarChanged = avatar !== profileAvatar(profile?.avatar);
  const dirty = nickname.trim() !== (profile?.nickname ?? "") || level !== profile?.level || avatarChanged;
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    humanRequest<{ profile: { avatar: string } | null }>("public-profile").then(result => {
      if (cancelled) return;
      // A missing server profile is not an instruction to replace an imported
      // local avatar with the default (or to create a profile on page load).
      if (!result.profile) { setPublicReady(true); setPublicError(false); return; }
      const remote = profileAvatar(result.profile.avatar);
      setPublicReady(true);
      setPublicError(false);
      setAvatar(remote);
      if (remote !== profileAvatar(profile?.avatar) && profile) onProfileSaved(saveProfile({ nickname: profile.nickname, level: profile.level, avatar: remote }));
    }).catch(() => { if (!cancelled) { setPublicReady(false); setPublicError(true); } });
    return () => { cancelled = true; };
  }, [signedIn]);
  const save = async () => {
    if (saving) return;
    setSaving(true); setPublicError(false);
    try {
      if (signedIn && avatarChanged) {
        const currentAccountId = accountSnapshot().user?.verified ? accountSnapshot().user!.id : null;
        if (!publicReady || !loadedAccountId || currentAccountId !== loadedAccountId) { setPublicError(true); return; }
        await humanRequest("public-profile", { avatar, expectedUserId: loadedAccountId });
        if ((accountSnapshot().user?.verified ? accountSnapshot().user!.id : null) !== loadedAccountId) { setPublicError(true); return; }
      }
      onProfileSaved(saveProfile({ nickname, level, avatar })); setSaved(true);
    } catch { setPublicError(true); }
    finally { setSaving(false); }
  };
  return <>
    <section className="account-card">
      <header><h2>{t("プロフィール", "Profile")}</h2></header>
      <div className="account-profile">
        <label className="account-field">
          <span>{t("ニックネーム", "Nickname")}</span>
          <input value={nickname} maxLength={20} placeholder={t("ゲスト", "Guest")} onChange={event => { setNickname(event.target.value); setSaved(false); }} />
        </label>
      </div>
      <SettingRow title={ffCopy("Profile icon", "プロフィールアイコン", "个人头像", "Icono de perfil")} description={signedIn
        ? ffCopy("Choose a built-in icon shared with your public Ranked profile.", "対人ランクの公開プロフィールと共通の内蔵アイコンを選びます。", "选择与公开排位资料共用的内置图标。", "Elige un icono integrado compartido con tu perfil público de Ranked.")
        : ffCopy("Guest icons stay in this browser; sign in to use one on a public Ranked profile.", "ゲストのアイコンはこのブラウザだけに保存されます。公開ランクプロフィールで使うにはログインしてください。", "访客头像仅保存在此浏览器；登录后才能用于公开排位资料。", "Los iconos de invitado solo se guardan en este navegador; inicia sesión para usarlos en Ranked.")}>
        <div className="account-avatar-choice" role="radiogroup" aria-label={ffCopy("Profile icon", "プロフィールアイコン", "个人头像", "Icono de perfil")}>
          {PROFILE_AVATARS.map((id, index) => <button type="button" role="radio" key={id} aria-checked={avatar === id} aria-label={[
            ffCopy("Person", "人物", "人物", "Persona"), ffCopy("Spade", "スペード", "黑桃", "Pica"), ffCopy("Diamond", "ダイヤ", "方块", "Diamante"), ffCopy("Club", "クラブ", "梅花", "Trébol"), ffCopy("Heart", "ハート", "红心", "Corazón"), ffCopy("Star", "星", "星星", "Estrella"), ffCopy("Moon", "月", "月亮", "Luna"), ffCopy("Bolt", "稲妻", "闪电", "Rayo")][index]} disabled={signedIn && !publicReady} onClick={() => { setAvatar(id); setSaved(false); }}><ProfileAvatar avatar={id} size={30} /></button>)}
        </div>
      </SettingRow>
      {signedIn && <p className="account-avatar-hint">{ffCopy("Saving a new icon creates your public Ranked player profile if you have not joined yet.", "未参加の場合、アイコンを保存すると対人ランクの公開プレイヤープロフィールが作成されます。", "如果尚未参加，保存图标会创建公开排位玩家资料。", "Si aún no participas, guardar el icono creará tu perfil público de Ranked.")}</p>}
      {publicError && <p role="alert" className="account-avatar-error">{ffCopy("Ranked profile unavailable. Icon changes cannot be saved right now.", "公開ランクプロフィールを利用できません。現在アイコンの変更は保存できません。", "公开排位资料不可用。目前无法保存头像更改。", "Perfil público no disponible. No se pueden guardar cambios de icono ahora.")}</p>}
      <SettingRow title={t("レベル", "Level")} description={t("レンジ表の見せ方の初期値が変わります", "Sets the default range display")}>
        <Choice label={t("レベル", "Level")} value={level} onChange={value => { setLevel(value); setSaved(false); }}
          options={levels.map(item => ({ value: item.value, label: item.label }))} />
      </SettingRow>
      <footer>
        {saved && <span className="account-saved"><Check size={14} weight="bold" />{t("保存しました", "Saved")}</span>}
        <button type="button" className="account-primary" disabled={!dirty || saving} onClick={() => void save()}>{t("保存", "Save")}</button>
      </footer>
    </section>
    <AuthPanel onChanged={() => onProfileSaved(loadProfile())} />
  </>;
}

function SubscriptionTab() {
  const pricing = SITE_COPY[productLocale()].pricing;
  const [free] = pricing.plans;
  return <>
    <section className="account-card account-plan-current">
      <span className="account-plan-icon" aria-hidden="true"><CreditCard size={20} weight="duotone" /></span>
      <div>
        <span className="account-eyebrow">{t("現在のプラン", "Current plan")}</span>
        <h2>{free.name}</h2>
        <p>{t("公開中のプレビュー機能をすべて無料で使えます。", "All preview features are free to use.")}</p>
      </div>
      <span className="account-pill success">{t("利用中", "Active")}</span>
    </section>
    <h2 className="account-section-title">{sourceCopy("プランを比較", "Compare plans", "比较方案", "Comparar planes")}</h2>
    <div className="account-plans">
      {pricing.plans.map((plan, index) => {
        const current = index === 0;
        return <article key={plan.name} className={`account-plan${current ? " current" : " upcoming"}`} aria-current={current ? "true" : undefined}>
          <header>
            <h3>{!current && <Sparkle size={15} weight="fill" />}{plan.name}</h3>
            <span className={`account-pill${current ? " success" : " accent"}`}>{current ? t("利用中", "Active") : plan.status}</span>
          </header>
          <p className="account-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></p>
          <p className="account-plan-desc">{plan.description}</p>
          <ul>{plan.features.map(feature => <li key={feature}><Check size={13} weight="bold" />{feature}</li>)}</ul>
          <p className="account-plan-status">
            {current ? <><CheckCircle size={15} weight="fill" />{sourceCopy("ご利用中のプランです", "You're on this plan", "你正在使用此方案", "Estás en este plan")}</>
              : <><Clock size={15} weight="bold" />{plan.action}</>}
          </p>
        </article>;
      })}
    </div>
    <p className="account-note"><Info size={14} weight="bold" aria-hidden="true" /><span>{pricing.note}</span></p>
  </>;
}

function AppearanceTab() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const [displayMode, setDisplayMode] = useState(loadDisplayMode);
  const [rangeSource, setRangeSource] = useState(loadRangeSource);
  const update = (patch: Partial<ReturnType<typeof loadAppearance>>) => { const next = { ...appearance, ...patch }; setAppearance(next); saveAppearance(next); };
  const cardPreview = (colors: string[][]) => <span className="account-card-preview" aria-hidden="true">{colors.map(([suit, color]) => <i key={suit} style={{ background: color }}>{suit}</i>)}</span>;
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
    <SettingRow title={sourceCopy("計算バージョン", "Calculation version", "计算版本", "Versión de cálculo")}
      description={sourceCopy("レンジ分析のみ切り替えます。トレーナーと保存済み履歴は AI のままです。", "Changes Range Analysis only. Trainer and saved history remain AI-based.", "仅切换范围分析。训练器和已保存的历史记录仍使用 AI。", "Solo cambia el análisis de rangos. El entrenador y el historial guardado siguen usando IA.")}>
      <Choice label={sourceCopy("計算バージョン", "Calculation version", "计算版本", "Versión de cálculo")}
        value={rangeSource} onChange={value => { const next = value === "gto" ? "gto" : "ai"; setRangeSource(next); saveRangeSource(next); }}
        options={[{ value: "ai", label: "AI", hint: sourceCopy("推定レンジ", "Estimated ranges", "估计范围", "Rangos estimados") },
          { value: "gto", label: "GTO", hint: sourceCopy("保存済みフロップ計算", "Saved flop calculation", "已保存的翻牌计算", "Cálculo de flop guardado") }]} />
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
        options={LOCALES.map(item => ({ ...item, native: true }))} />
    </SettingRow>
  </section>;
}

export function LogoutDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (options: { clearData: boolean }) => void }) {
  const [clearData, setClearData] = useState(false);
  return <Dialog labelledBy="logout-title" onClose={onCancel} className="account-logout">
      <span className="account-logout-icon"><SignOut size={20} /></span>
      <h2 id="logout-title">{t("ログアウトしますか？", "Log out?")}</h2>
      <p>{t("アカウントからログアウトします。ゲストのプロフィールと練習記録はこのブラウザに残ります。", "Sign out of your account. Guest profile and practice records remain in this browser.")}</p>
      {!accountSnapshot().user && <label className="account-check">
        <input type="checkbox" checked={clearData} onChange={event => setClearData(event.target.checked)} />
        <span>{t("練習データ（ドリル・セッション・回答履歴）も削除する", "Also delete practice data (drills, sessions, answers)")}</span>
      </label>}
      <div className="account-dialog-actions">
        <button type="button" className="account-secondary" onClick={onCancel}>{t("キャンセル", "Cancel")}</button>
        <button type="button" className="account-danger" onClick={() => onConfirm({ clearData })}>{t("ログアウト", "Log out")}</button>
      </div>
  </Dialog>;
}

export function AccountPage({ profile, tab = "profile", onSectionChange, onEditProfile, onProfileSaved, onLogout }: { profile: Profile; tab?: string; onSectionChange: (name: string) => void; onEditProfile?: () => void; onProfileSaved: (profile: Profile | null) => void; onLogout?: () => void }) {
  const active = ACCOUNT_TABS.some(item => item.value === tab) ? tab : "profile";
  return <div className="shell">
    <Sidebar activeSection={ACCOUNT_SECTION} onSectionChange={onSectionChange} profile={profile} onEditProfile={onEditProfile} onLogout={onLogout} />
    <main className="account-page">
      <div className="account-layout">
        <header className="account-heading trainer-home-head"><h1 className="trainer-home-eyebrow">SETTINGS</h1></header>
        <nav className="account-tabs" aria-label={t("設定の項目", "Settings sections")}>
          {ACCOUNT_TABS.map(({ value, Icon, ja, en, shortJa, shortEn }) => <button type="button" key={value} aria-current={active === value ? "page" : undefined} aria-label={t(ja, en)}
            className={active === value ? "on" : ""} onClick={() => onSectionChange(`${ACCOUNT_SECTION}#${value}`)}>
            <Icon size={17} weight={active === value ? "fill" : "regular"} />
            {shortJa ? <><span className="account-tab-full">{t(ja, en)}</span><span className="account-tab-short" aria-hidden="true">{t(shortJa, shortEn)}</span></> : t(ja, en)}
          </button>)}
        </nav>
        <div className="account-content">
          {active === "profile" ? <AccountTab key={profile?.updatedAt} profile={profile} onProfileSaved={onProfileSaved} />
            : active === "subscription" ? <SubscriptionTab />
            : active === "appearance" ? <AppearanceTab />
            : <LanguageTab />}
        </div>
      </div>
    </main>
  </div>;
}
