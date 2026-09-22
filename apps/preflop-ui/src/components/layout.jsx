import { Brain, Cards, GraduationCap, SquaresFour, Spade } from "@phosphor-icons/react";

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

export function Header({ activeSection, onSectionChange }) {
  return (
    <header className="app-header">
      <div className="brand">
        <Spade size={30} weight="fill" />
        <div>
          Solvea<span>GTO</span>
          <small>Play Closer to Perfect</small>
        </div>
      </div>
      <nav className="header-nav" aria-label="メインナビゲーション">
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
                  title={status ? `${name}：${status}` : undefined}
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
    </header>
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
