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

export function Sidebar({ activeSection, onSectionChange }) {
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1049px)").matches);

  return (
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="SolveaGTO サイドバー">
      <div className="sidebar-heading">
        <div className="brand">
          <Spade size={30} weight="fill" />
          <div className="brand-copy">
            Solvea<span>GTO</span>
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
          onClick={() => setCollapsed(value => !value)}
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
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>SolveaGTO v0.1</span>
      <span>推定レンジ · GTO未検証</span>
    </footer>
  );
}
