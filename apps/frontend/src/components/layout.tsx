import { BrandIcon } from "./BrandIcon.tsx";
import { CaretDoubleLeft, ChartBar, CaretDoubleRight, ClockCounterClockwise, GraduationCap, SquaresFour, GearSix } from "@phosphor-icons/react";
import { useState } from "react";
import { ACCOUNT_SECTION, AccountMenu } from "../account/AccountMenu.tsx";
import "../account/preferences.ts";
import { localized } from "../i18n.ts";

export const RANGE_SECTION = "レンジ分析";
export const LOGOUT_SECTION = "ログアウト";

const navigationGroups = [
  {
    label: "解析",
    items: [
      { Icon: SquaresFour, name: RANGE_SECTION },
    ],
  },
  {
    label: "学習",
    items: [
      { Icon: GraduationCap, name: "トレーナー" },
      { Icon: ClockCounterClockwise, name: "セッション" },
    ],
  },
  {
    label: "スタッツ",
    items: [
      { Icon: ChartBar, name: "プレー分析" },
    ],
  },
];

const COLLAPSE_KEY = "reysonai.sidebar.collapsed";

function readInitialCollapsed() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(max-width: 650px)").matches) return true;
  try {
    const saved = window.localStorage.getItem(COLLAPSE_KEY);
    if (saved !== null) return saved === "1";
  } catch {}
  return window.matchMedia("(max-width: 1049px)").matches;
}

export function Sidebar({ activeSection, onSectionChange, profile = null, onEditProfile }) {
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);
  const toggle = next => {
    setCollapsed(next);
    try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
  };

  return (
    <>
    {!collapsed && <div className="sidebar-backdrop" aria-hidden="true" onClick={() => toggle(true)} />}
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="ReysonAI サイドバー">
      <div className="sidebar-heading">
        <div className="brand">
          <BrandIcon size={30} />
          <div className="brand-copy">
            Reyson<span>AI</span>
            <small>Play Closer to Perfect</small>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          aria-expanded={!collapsed}
          aria-controls="main-navigation"
          title={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          onClick={() => toggle(!collapsed)}
        >
          {collapsed ? <CaretDoubleRight size={17} /> : <CaretDoubleLeft size={17} />}
        </button>
      </div>
      <nav id="main-navigation" className="header-nav" aria-label="メインナビゲーション">
        {navigationGroups.map(group => (
          <div className="header-nav-group" key={group.label}>
            <span className="header-nav-group-label">{group.label}</span>
            <div className="header-nav-items">
              {group.items.map(({ Icon, name, status: pendingStatus }) => {
                const status = pendingStatus;
                const label = name === RANGE_SECTION ? localized("Range", name) : name === "プレー分析" ? localized("Stats", name) : name;
                return (
                <button
                  key={name}
                  className={`${activeSection === name ? "active" : ""} ${status ? "future" : ""}`.trim()}
                  onClick={() => { onSectionChange(name); if (window.matchMedia("(max-width: 650px)").matches) toggle(true); }}
                  disabled={Boolean(status)}
                  aria-current={activeSection === name ? "page" : undefined}
                  aria-label={status ? `${label}（${status}）` : label}
                  title={status ? `${label}：${status}` : label}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {status && <small>{status}</small>}
                </button>
              );})}
            </div>
          </div>
        ))}
      </nav>
      {profile ? <AccountMenu profile={profile} collapsed={collapsed}
        onNavigate={tab => onSectionChange(`${ACCOUNT_SECTION}#${tab}`)} onLogout={() => onSectionChange(LOGOUT_SECTION)} /> : (
        <div className="header-meta">
          <strong>Range Explorer</strong>
          <small>READ-ONLY / v0.1</small>
        </div>
      )}
    </aside>
    <nav className="mobile-tab-bar" aria-label={localized("Main navigation", "メインナビゲーション")}>
      {[
        { name: RANGE_SECTION, label: localized("Range", "レンジ"), Icon: SquaresFour },
        { name: "トレーナー", label: localized("Trainer", "トレーナー"), Icon: GraduationCap },
        { name: "セッション", label: localized("Sessions", "セッション"), Icon: ClockCounterClockwise },
        { name: "プレー分析", label: localized("Stats", "スタッツ"), Icon: ChartBar },
        { name: ACCOUNT_SECTION, label: localized("Settings", "設定"), Icon: GearSix },
      ].map(({ name, label, Icon }) => {
        const active = activeSection.split("#")[0] === name || name === "プレー分析" && activeSection === "弱点";
        return <button key={name} type="button" aria-current={active ? "page" : undefined} onClick={() => onSectionChange(name)}>
          <Icon size={21} weight={active ? "fill" : "regular"} aria-hidden="true" /><span>{label}</span>
        </button>;
      })}
    </nav>
    </>
  );
}
