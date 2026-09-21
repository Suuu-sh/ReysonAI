import { ChartBar, Database, SquaresFour, Spade } from "@phosphor-icons/react";

const navigation = [
  [SquaresFour, "プリフロップ"],
  [ChartBar, "ハンド詳細"],
  [Database, "計算情報"],
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
        {navigation.map(([Icon, name]) => (
          <button
            key={name}
            className={activeSection === name ? "active" : ""}
            onClick={() => onSectionChange(name)}
          >
            <Icon size={21} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      <div className="side-note">
        <Spade size={23} />
        <strong>Preflop Explorer</strong>
        <p>保存済みの計算結果を、<br />ハンドから読み解く。</p>
        <small>READ-ONLY / v0.1</small>
      </div>
    </aside>
  );
}

export function PageHeader() {
  return (
    <header className="app-header">
      <div>
        <h1>より良い判断が、より強いあなたをつくる。</h1>
        <p>局面を選び、戦略の違いをひとつずつ。</p>
      </div>
      <span className="badge">Preflop / 日本語</span>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>SolveaGTO v0.1</span>
      <span>保存済みデータ専用 · 実験モデル</span>
    </footer>
  );
}
