import { CaretDoubleLeft, ChartBar, CaretDoubleRight, GraduationCap, SquaresFour, Spade } from "@phosphor-icons/react";
import { useState } from "react";
import { levelLabel } from "../profile.js";

export const RANGE_SECTION = "レンジ分析";

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
      { Icon: ChartBar, name: "プレー分析" },
      { Icon: ChartBar, name: "弱点" },
    ],
  },
];

const COLLAPSE_KEY = "solveaai.sidebar.collapsed";

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
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="SolveaAI サイドバー">
      <div className="sidebar-heading">
        <div className="brand">
          <Spade size={30} weight="fill" />
          <div className="brand-copy">
            Solvea<span>AI</span>
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
                return (
                <button
                  key={name}
                  className={`${activeSection === name ? "active" : ""} ${status ? "future" : ""}`.trim()}
                  onClick={() => { onSectionChange(name); if (window.matchMedia("(max-width: 650px)").matches) toggle(true); }}
                  disabled={Boolean(status)}
                  aria-current={activeSection === name ? "page" : undefined}
                  aria-label={status ? `${name}（${status}）` : name}
                  title={status ? `${name}：${status}` : name}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {status && <small>{status}</small>}
                </button>
              );})}
            </div>
          </div>
        ))}
      </nav>
      {profile ? (
        <button type="button" className="header-meta profile-chip" onClick={onEditProfile} title="レベルを変更" aria-label={`プロフィール：${levelLabel(profile.level)}。レベルを変更`}>
          <strong>{profile.nickname || "ゲスト"}</strong>
          <small>{levelLabel(profile.level)} · レベルを変更</small>
        </button>
      ) : (
        <div className="header-meta">
          <strong>Range Explorer</strong>
          <small>READ-ONLY / v0.1</small>
        </div>
      )}
    </aside>
    </>
  );
}
