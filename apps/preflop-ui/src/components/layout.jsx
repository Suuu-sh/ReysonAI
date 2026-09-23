import { Brain, Cards, CaretDoubleLeft, CaretDoubleRight, GraduationCap, SquaresFour, Spade } from "@phosphor-icons/react";
import { useState } from "react";

const navigationGroups = [
  {
    label: "解析",
    items: [
      { Icon: SquaresFour, name: "プリフロップ" },
      { Icon: Cards, name: "ポストフロップ", status: "準備中" },
    ],
  },
  {
    label: "学習",
    items: [
      { Icon: GraduationCap, name: "トレーナー", status: "準備中" },
      { Icon: Brain, name: "クイズ", status: "準備中" },
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

export function Sidebar({ activeSection, onSectionChange }) {
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
              {group.items.map(({ Icon, name, status }) => (
                <button
                  key={name}
                  className={`${activeSection === name ? "active" : ""} ${status ? "future" : ""}`.trim()}
                  onClick={() => onSectionChange(name)}
                  disabled={Boolean(status)}
                  aria-current={activeSection === name ? "page" : undefined}
                  aria-label={status ? `${name}（${status}）` : name}
                  title={status ? `${name}：${status}` : name}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {status && <small>{status}</small>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="header-meta">
        <strong>Preflop Explorer</strong>
        <small>READ-ONLY / v0.1</small>
      </div>
    </aside>
    </>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>SolveaAI v0.1</span>
      <span>AI生成ソリューション</span>
    </footer>
  );
}
