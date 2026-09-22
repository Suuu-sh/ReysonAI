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
        <p>AI推定レンジと保存済み結果を、<br />ハンドから読み解く。</p>
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

export function SolutionStatusNotice({ solution }) {
  const verified = solution?.validation?.gtoVerified === true
    && solution.validation.status === "gto_verified";

  return (
    <div className={`notice ${verified ? "notice-verified" : "notice-provisional"}`} role="note">
      <strong>{verified ? "GTO検証済み" : "暫定戦略"}</strong>
      <span>
        {verified
          ? "形式・継続価値・Exploitabilityの検証を通過しています。"
          : "postflop継続価値は暫定モデルです。完全なGTOとしては扱いません。"}
      </span>
    </div>
  );
}

export function AiRangeStatusNotice() {
  return (
    <div className="notice notice-ai" role="note">
      <strong>AI Estimated Strategy</strong>
      <span>AI推定レンジ。GTO計算結果ではありません。</span>
    </div>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer">
      <span>SolveaGTO v0.1</span>
      <span>AI推定 / 保存済みデータ · GTO未検証</span>
    </footer>
  );
}
