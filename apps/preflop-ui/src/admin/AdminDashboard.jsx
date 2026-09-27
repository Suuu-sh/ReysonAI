import { useMemo, useState } from "react";
import { coverageCatalog, formatBacklog } from "./coverage.js";
import { formatLabel } from "../estimated/game-formats.js";
import "./admin.css";

// Reason files are only checked for existence here; nothing is loaded.
const reasonIds = new Set(Object.keys(import.meta.glob("../estimated/reasons/*.json")).map(path => path.split("/").pop().replace(".json", "")));
const FILTERS = [["all", "すべて"], ["todo", "TODO"], ["done", "作成済み"], ["no_reason", "理由なし"]];

function Meter({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="admin-meter" role="img" aria-label={`${done}/${total}（${pct}%）`}><span style={{ width: `${pct}%` }} /></div>;
}

export default function AdminDashboard() {
  const catalog = useMemo(() => coverageCatalog(), []);
  const formats = useMemo(() => formatBacklog(catalog.total), [catalog.total]);
  const [filter, setFilter] = useState("todo");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const rows = catalog.categories.flatMap(c => c.rows.map(row => ({ ...row, label: c.label, reason: reasonIds.has(row.id) })));
  const reasonMissing = rows.filter(row => row.status === "done" && !row.reason).length;
  const visible = rows.filter(row =>
    (category === "all" || row.category === category) &&
    (filter === "all" || (filter === "no_reason" ? row.status === "done" && !row.reason : row.status === filter)) &&
    (!query || `${row.id} ${row.path}`.toLowerCase().includes(query.toLowerCase())));
  const unbuiltFormats = formats.filter(format => !format.built);

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">SolveaAI · Admin</p>
          <h1>レンジ表カバレッジ</h1>
          <p className="admin-sub">Cash · 6max · 100BB · 2.5BB オープン（作成済みフォーマット）のプリフロップツリー</p>
        </div>
        <a className="admin-back" href="/app">アプリへ戻る</a>
      </header>

      <section className="admin-kpis">
        <div className="admin-kpi"><span>作成済み</span><strong>{catalog.done}</strong><small>/ {catalog.total} スポット</small></div>
        <div className="admin-kpi accent"><span>TODO（このフォーマット）</span><strong>{catalog.todo}</strong><small>スポット</small></div>
        <div className="admin-kpi"><span>理由ファイル未作成</span><strong>{reasonMissing}</strong><small>作成済みスポット中</small></div>
        <div className="admin-kpi"><span>未作成フォーマット</span><strong>{unbuiltFormats.length}</strong><small>× 約{catalog.total}スポット ＝ {(unbuiltFormats.length * catalog.total).toLocaleString()}</small></div>
      </section>

      <section className="admin-panel">
        <h2>カテゴリ別の進捗</h2>
        <table className="admin-table">
          <thead><tr><th>カテゴリ</th><th>データファイル</th><th className="num">作成済み</th><th className="num">TODO</th><th>進捗</th></tr></thead>
          <tbody>
            {catalog.categories.map(c => (
              <tr key={c.key} className={category === c.key ? "selected" : ""} onClick={() => setCategory(category === c.key ? "all" : c.key)}>
                <td>{c.label}</td>
                <td className="mono">{c.file ?? <span className="admin-tag">未モデル化</span>}</td>
                <td className="num">{c.done}</td>
                <td className="num">{c.todo || "—"}</td>
                <td><Meter done={c.done} total={c.total} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>スポット一覧 <small>{visible.length}件</small></h2>
          <div className="admin-controls">
            <div className="admin-seg" role="group" aria-label="状態で絞り込み">
              {FILTERS.map(([value, label]) => <button key={value} type="button" className={filter === value ? "on" : ""} onClick={() => setFilter(value)}>{label}</button>)}
            </div>
            <select value={category} onChange={event => setCategory(event.target.value)} aria-label="カテゴリ">
              <option value="all">全カテゴリ</option>
              {catalog.categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <input type="search" placeholder="ID・アクションで検索" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead><tr><th>状態</th><th>スポットID</th><th>ヒーロー</th><th>アクション</th><th>カテゴリ</th><th>理由</th></tr></thead>
            <tbody>
              {visible.map(row => (
                <tr key={row.id}>
                  <td><span className={`admin-status ${row.status}`}>{row.status === "done" ? "作成済み" : "TODO"}</span></td>
                  <td className="mono">{row.id}</td>
                  <td>{row.hero}</td>
                  <td className="path">{row.path}</td>
                  <td className="muted">{row.label}</td>
                  <td>{row.status === "done" ? (row.reason ? "✓" : <span className="admin-tag">なし</span>) : "—"}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={6} className="muted">該当するスポットはありません。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel">
        <h2>フォーマット別 <small>各フォーマットで上記ツリー一式が必要</small></h2>
        <div className="admin-formats">
          {formats.map(format => (
            <div key={`${format.game}-${format.table}-${format.stack}-${format.openSize}`} className={`admin-format ${format.built ? "built" : ""}`}>
              <strong>{formatLabel("game", format.game)} · {formatLabel("table", format.table)}</strong>
              <span>{formatLabel("stack", format.stack)} · {formatLabel("openSize", format.openSize)}</span>
              <em>{format.built ? `作成済み ${catalog.done}/${catalog.total}` : `TODO ${format.spots}`}</em>
            </div>
          ))}
        </div>
        <p className="admin-note">9max・ヘッズアップはツリー自体が異なるため、スポット数は6maxからの概算です。アンティ・レーキの組み合わせは含めていません。</p>
      </section>
    </div>
  );
}
