import { useMemo, useState } from "react";
import { coverageCatalog, formatBacklog, postflopCatalog, PRIORITIES, priorityBacklog } from "./coverage.ts";
import { POSTFLOP_SPOTS } from "../../scripts/postflop-ai/spots.mjs";
import postflopArtifacts from "virtual:postflop-artifacts";
import { formatLabel } from "../estimated/game-formats.ts";
import "./admin.css";
import { hasDataset } from "../estimated/datasets.ts";

// Reason files are only checked for existence here; nothing is loaded.
const reasonIds = { has: id => hasDataset(`reasons/${id}`) };
// Spots with a hand-authored rules module (scripts/postflop-ai/authored/<slug>.mjs) own their policy.
const authoredSlugs = Object.keys(import.meta.glob("../../scripts/postflop-ai/authored/*.mjs")).map(path => path.split("/").pop().replace(".mjs", "-v1"));
const authoredIds = POSTFLOP_SPOTS.filter(spot => authoredSlugs.includes(spot.slug)).map(spot => spot.id);
const STREETS = { preflop: "プリフロップ", flop: "フロップ", turn_river: "ターン/リバー", release: "リリース" };
const STREET_ORDER = { preflop: 0, flop: 1, turn_river: 2, release: 3 };
const FILTERS = [["all", "すべて"], ["todo", "TODO"], ["done", "作成済み"], ["no_reason", "理由なし"]];

function Meter({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="admin-meter" role="img" aria-label={`${done}/${total}（${pct}%）`}><span style={{ width: `${pct}%` }} /></div>;
}

export default function AdminDashboard() {
  const catalog = useMemo(() => coverageCatalog(), []);
  const postflop = useMemo(() => postflopCatalog(POSTFLOP_SPOTS, postflopArtifacts, authoredIds), []);
  const allCategories = [...catalog.categories.map(c => ({ ...c, street: "preflop" })), ...postflop.categories];
  const formats = useMemo(() => formatBacklog(catalog.total), [catalog.total]);
  const [filter, setFilter] = useState("todo");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const rows = allCategories.flatMap(c => c.rows.map(row => ({ ...row, label: c.label, street: c.street, reason: c.street === "preflop" ? reasonIds.has(row.id) : null })));
  const priorities = priorityBacklog(catalog, postflop);
  const reasonMissing = rows.filter(row => row.status === "done" && row.reason === false).length;
  const visible = rows.filter(row =>
    (category === "all" || row.category === category) &&
    (priorityFilter === "all" || row.priority === Number(priorityFilter)) &&
    (filter === "all" || (filter === "no_reason" ? row.status === "done" && row.reason === false : filter === "todo" ? row.status !== "done" : row.status === filter)) &&
    (!query || `${row.id} ${row.path}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => a.priority - b.priority || STREET_ORDER[a.street] - STREET_ORDER[b.street]);
  const unbuiltFormats = formats.filter(format => !format.built);

  return (
    <div className="admin">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">ReysonAI · Admin</p>
          <h1>カバレッジと TODO</h1>
          <p className="admin-sub">Cash · 6max · 100BB · 2.5BB オープン（作成済みフォーマット）のプリフロップツリーと、ヘッズアップのフロップ〜リバー AI方針</p>
        </div>
        <a className="admin-back" href="/analyze/ranges">アプリへ戻る</a>
      </header>

      <section className="admin-kpis">
        <div className="admin-kpi"><span>プリフロップ作成済み</span><strong>{catalog.done}</strong><small>/ {catalog.total} スポット（TODO {catalog.todo}）</small></div>
        {[["flop", "フロップ AI方針"], ["turn_river", "ターン/リバー AI方針"]].map(([street, label]) => {
          const list = postflop.categories.filter(c => c.street === street && c.modelled);
          const done = list.reduce((sum, c) => sum + c.done, 0), total = list.reduce((sum, c) => sum + c.total, 0);
          return <div key={street} className="admin-kpi"><span>{label}</span><strong>{done}</strong><small>/ {total} スポット（TODO {total - done}）</small></div>;
        })}
        <div className="admin-kpi accent"><span>TODO 合計（このフォーマット）</span><strong>{catalog.todo + postflop.todo}</strong><small>プリフロップ＋ポストフロップ</small></div>
        <div className="admin-kpi"><span>理由ファイル未作成</span><strong>{reasonMissing}</strong><small>作成済みスポット中</small></div>
        <div className="admin-kpi"><span>未作成フォーマット</span><strong>{unbuiltFormats.length}</strong><small>× 約{catalog.total}スポット ＝ {(unbuiltFormats.length * catalog.total).toLocaleString()}</small></div>
      </section>

      <section className="admin-panel" aria-labelledby="admin-priorities-title">
        <h2 id="admin-priorities-title">開発優先度</h2>
        <ol className="admin-priorities">
          {priorities.map(priority => (
            <li key={priority.value}>
              <span className={`admin-priority p${priority.value}`}>{priority.label}</span>
              <div><strong>{priority.title}</strong><p>{priority.scope}</p><small>一覧化済み TODO {priority.todo} / {priority.total} 件</small></div>
            </li>
          ))}
        </ol>
        <p className="admin-note">順番は P1 → P2 → P3。件数は既存のスポット・方針ファイル単位で、全ボード・全アクション分岐の完成を意味しません。オールインで終了する経路はリバーまでの追加方針を必要としません。</p>
      </section>

      <section className="admin-panel">
        <h2>カテゴリ別の進捗</h2>
        <table className="admin-table">
          <thead><tr><th>ストリート</th><th>カテゴリ</th><th>データファイル</th><th className="num">作成済み</th><th className="num">TODO</th><th>進捗</th></tr></thead>
          <tbody>
            {allCategories.map(c => (
              <tr key={c.key} className={category === c.key ? "selected" : ""} onClick={() => setCategory(category === c.key ? "all" : c.key)}>
                <td className="muted">{STREETS[c.street]}</td>
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
            <fieldset className="admin-seg" aria-label="状態で絞り込み">
              {FILTERS.map(([value, label]) => <button key={value} type="button" className={filter === value ? "on" : ""} onClick={() => setFilter(value)}>{label}</button>)}
            </fieldset>
            <select value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)} aria-label="優先度で絞り込み">
              <option value="all">全優先度</option>
              {PRIORITIES.map(priority => <option key={priority.value} value={priority.value}>{priority.label} · {priority.title}</option>)}
            </select>
            <select value={category} onChange={event => setCategory(event.target.value)} aria-label="カテゴリ">
              <option value="all">全カテゴリ</option>
              {allCategories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <input type="search" placeholder="ID・アクションで検索" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
        </div>
        <div className="admin-scroll">
          <table className="admin-table">
            <thead><tr><th>優先度</th><th>状態</th><th>スポットID</th><th>ヒーロー</th><th>アクション</th><th>カテゴリ</th><th>理由</th></tr></thead>
            <tbody>
              {visible.map(row => (
                <tr key={`${row.street}-${row.category}-${row.id}`}>
                  <td><span className={`admin-priority p${row.priority}`}>P{row.priority}</span></td>
                  <td><span className={`admin-status ${row.status}`}>{{ done: "作成済み", todo: "TODO", copy: "TODO（流用）" }[row.status]}</span></td>
                  <td className="mono">{row.id}</td>
                  <td>{row.hero}</td>
                  <td className="path">{row.path}</td>
                  <td className="muted">{row.label}</td>
                  <td>{row.reason === null ? "—" : row.status === "done" ? (row.reason ? "✓" : <span className="admin-tag">なし</span>) : "—"}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={7} className="muted">該当するスポットはありません。</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="admin-note">ポストフロップは .local/postflop-ai の方針ファイルで判定します。他スポットと同じ内容のファイルは流用（仮置き）なので TODO 扱いです。.local が無い環境のビルドではすべて TODO。プリフロップで到達しないため対象外: {postflop.unreachable.join(", ")}</p>
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
