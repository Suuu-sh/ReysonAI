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

export function Sidebar({ activeSection, onSectionChange }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Spade size={39} weight="fill" />
        <div>
          Solvea<span>GTO</span>
          <small>Play Closer to Perfect</small>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="メインナビゲーション">
        {navigationGroups.map(group => (
          <div className="sidebar-group" key={group.label}>
            <span className="sidebar-group-label">{group.label}</span>
            {group.items.map(({ Icon, name, status }) => (
              <button
                key={name}
                className={`${activeSection === name ? "active" : ""} ${status ? "future" : ""}`.trim()}
                onClick={() => onSectionChange(name)}
                disabled={Boolean(status)}
                title={status ? `${name}：${status}` : undefined}
              >
                <Icon size={21} />
                <span>{name}</span>
                {status && <small>{status}</small>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-note">
        <Spade size={23} />
        <strong>Preflop Explorer</strong>
        <p>推定レンジを、<br />ハンドから読み解く。</p>
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
